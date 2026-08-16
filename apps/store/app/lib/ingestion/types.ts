import type { Prisma } from "@prisma/client";
import type { CommitErrorCode } from "../commit-measurements";

// The single definition of the shapes stored in SizeChartIngestion.rows and
// .errors.
//
// Those columns are Json in Postgres, so Prisma types them as JsonValue and
// gives us no compile-time safety at all across the route -> handler -> UI
// boundary. Declaring these once here, and reading the columns only through
// the parse* helpers below, is what stops the three sides drifting apart.
// Nothing should re-declare these shapes inline or cast the Json directly.

/** One data row parsed from the uploaded CSV.
 *
 *  `rowNumber` is 1-based over DATA rows (the header is not counted) and is
 *  the stable identity used to match a corrected row back on PATCH. It is
 *  deliberately not (productCode, sizeLabel): a retailer's correction may be
 *  to those very fields -- a typo'd sizeLabel is one of the things that
 *  produces an UNKNOWN_SIZE error in the first place -- so matching on them
 *  would make exactly the rows most likely to need fixing impossible to
 *  match. */
export type ParsedRow = {
  rowNumber: number;
  productCode: string;
  sizeLabel: string;
  /** camelCase Prisma column -> value. Blank/absent cells are null rather
   *  than omitted, so the shape is the same for every row. */
  values: Record<string, number | null>;
  /** GARMENT_TECHPACK only; product-level, repeated on each row of a group. */
  garmentColorHex?: string;
  /** Non-blocking quality notes about THIS row. Lives here rather than in a
   *  separate column on the job so a warning cannot drift away from the row it
   *  describes, and so a PATCH edit of the row carries its warnings with it. */
  warnings?: RowWarning[];
};

export type RowErrorCode =
  | CommitErrorCode // re-used, never redefined
  | "UNKNOWN_PRODUCT_CODE" // product_code does not resolve for this retailer
  | "MISSING_REQUIRED_COLUMN" // product_code / size_label absent from the row
  | "NOT_A_NUMBER" // cell present but not a positive number
  | "NO_MEASUREMENTS" // BODY_FIT row with every measurement blank
  | "INCONSISTENT_COLOR"; // garment_color_hex differs within one product group

export type RowError = {
  rowNumber: number;
  productCode: string | null; // null when the cell itself was missing
  sizeLabel: string | null;
  code: RowErrorCode;
  message: string;
  field?: string; // camelCase column, when the fault is one specific cell
};

/** Non-blocking: the row still commits, but downstream quality suffers.
 *  Carries no rowNumber -- it is always nested inside the ParsedRow it
 *  describes, so repeating the identity would be a second copy to keep in
 *  sync. Persisted as part of `rows`; there is no separate warnings column. */
export type RowWarning = {
  code: "MISSING_MATCH_FIELDS";
  message: string;
};

/** The one place SizeChartIngestion.rows is turned back into typed objects. */
export function parseRows(json: Prisma.JsonValue | null): ParsedRow[] {
  return Array.isArray(json) ? (json as unknown as ParsedRow[]) : [];
}

/** The one place SizeChartIngestion.errors is turned back into typed objects. */
export function parseErrors(json: Prisma.JsonValue | null): RowError[] {
  return Array.isArray(json) ? (json as unknown as RowError[]) : [];
}
