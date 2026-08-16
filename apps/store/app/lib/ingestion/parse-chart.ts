import Papa from "papaparse";
import type { ChartType } from "@prisma/client";
import { csvColumnFor, targetFieldsFor } from "../measurement-fields";
import { isPositiveNumber } from "../validation";
import type { ParsedRow, RowError } from "./types";

// CSV -> ParsedRow[] + RowError[]. Pure: no database access, no side effects,
// so it can be exercised directly and reused unchanged when a later phase
// feeds rows in from an extraction model instead of a file.

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type ParseOutcome = {
  rows: ParsedRow[];
  errors: RowError[];
};

/** Papa is configured exactly as the existing upload-csv route configures it,
 *  so retailers see one consistent CSV dialect across the dashboard. */
export function parseCsv(text: string): { data: Record<string, unknown>[]; fatal: string | null } {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return { data: [], fatal: `${first?.message ?? "Invalid CSV"} (row ${(first?.row ?? 0) + 1})` };
  }
  return { data: parsed.data, fatal: null };
}

function cell(raw: Record<string, unknown>, column: string): unknown {
  // Papa lower-cases nothing, so accept the canonical header and a trimmed /
  // case-insensitive variant rather than failing a retailer on whitespace.
  if (column in raw) return raw[column];
  const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === column);
  return key ? raw[key] : undefined;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Validate every data row against the columns its chart type requires.
 *
 * Deliberately does NOT resolve products or categories -- that needs the
 * database, and happens in process-job.ts. This stage catches everything
 * decidable from the file alone, so a retailer sees all their formatting
 * problems at once rather than one per round-trip.
 *
 * `fieldsForRow` is injected because GARMENT_TECHPACK's column list depends on
 * the product's category, which is only known after a DB lookup. Passing a
 * resolver keeps this function pure while still letting the caller vary the
 * expected columns per row.
 */
export function validateRows(
  chartType: ChartType,
  data: Record<string, unknown>[],
  fieldsForRow: (productCode: string) => readonly string[] | null,
): ParseOutcome {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  data.forEach((raw, index) => {
    const rowNumber = index + 1; // 1-based over data rows; header excluded
    const productCode = asString(cell(raw, "product_code"));
    const sizeLabel = asString(cell(raw, "size_label"));

    if (!productCode || !sizeLabel) {
      errors.push({
        rowNumber,
        productCode,
        sizeLabel,
        code: "MISSING_REQUIRED_COLUMN",
        message: !productCode
          ? "product_code is required"
          : "size_label is required",
        field: !productCode ? "productCode" : "sizeLabel",
      });
      return;
    }

    const fields = fieldsForRow(productCode);
    if (fields === null) {
      // The caller could not resolve this product (unknown code, or a category
      // with no garment model). It has already recorded the specific error.
      return;
    }

    const values: Record<string, number | null> = {};
    let supplied = 0;
    let cellError: RowError | null = null;

    for (const field of fields) {
      const column = csvColumnFor(field);
      const value = cell(raw, column);
      if (value === undefined || value === null || value === "") {
        values[field] = null;
        continue;
      }
      if (!isPositiveNumber(value)) {
        cellError = {
          rowNumber,
          productCode,
          sizeLabel,
          code: "NOT_A_NUMBER",
          message: `${column} must be a positive number`,
          field,
        };
        break;
      }
      values[field] = value;
      supplied++;
    }

    if (cellError) {
      errors.push(cellError);
      return;
    }

    // GARMENT_TECHPACK needs every field; BODY_FIT needs at least one.
    if (chartType === "GARMENT_TECHPACK") {
      const missing = fields.filter((f) => values[f] === null);
      if (missing.length > 0) {
        errors.push({
          rowNumber,
          productCode,
          sizeLabel,
          code: "INVALID_VARIANT",
          message: `missing required ${missing.map(csvColumnFor).join(", ")}`,
          field: missing[0],
        });
        return;
      }
    } else if (supplied === 0) {
      errors.push({
        rowNumber,
        productCode,
        sizeLabel,
        code: "NO_MEASUREMENTS",
        message: "at least one measurement column is required",
      });
      return;
    }

    const row: ParsedRow = { rowNumber, productCode, sizeLabel, values };

    if (chartType === "GARMENT_TECHPACK") {
      const hex = asString(cell(raw, "garment_color_hex"));
      if (!hex || !HEX_COLOR.test(hex)) {
        errors.push({
          rowNumber,
          productCode,
          sizeLabel,
          code: "INVALID_COLOR",
          message:
            "garment_color_hex is required and must be a hex colour (e.g. #1a1a2e)",
          field: "garmentColorHex",
        });
        return;
      }
      row.garmentColorHex = hex;
    }

    rows.push(row);
  });

  return { rows, errors };
}

/** Header-only CSV a retailer can download and fill in. */
export function templateFor(chartType: ChartType, category: string): string {
  const fields = targetFieldsFor(chartType, category);
  const columns = [
    "product_code",
    "size_label",
    ...(chartType === "GARMENT_TECHPACK" ? ["garment_color_hex"] : []),
    ...fields.map(csvColumnFor),
  ];
  return columns.join(",") + "\n";
}
