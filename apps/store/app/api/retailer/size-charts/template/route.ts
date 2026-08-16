import { NextRequest, NextResponse } from "next/server";
import type { ChartType } from "@prisma/client";
import { getAuthFromCookies } from "../../../../lib/auth";
import { templateFor } from "../../../../lib/ingestion/parse-chart";
import { GARMENT_CATEGORIES } from "../../../../lib/tryon-status";

// ─── GET /api/retailer/size-charts/template ─────────────────────────────
// A header-only CSV the retailer can fill in. There is no downloadable
// template anywhere else in the product, so without this a retailer has to
// reverse-engineer the column names from an error message.

function isChartType(value: string | null): value is ChartType {
  return value === "BODY_FIT" || value === "GARMENT_TECHPACK";
}

export async function GET(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chartType = request.nextUrl.searchParams.get("chartType");
  if (!isChartType(chartType)) {
    return NextResponse.json(
      { error: "chartType must be BODY_FIT or GARMENT_TECHPACK" },
      { status: 400 }
    );
  }

  // BODY_FIT is category-independent, so `category` is only consulted for
  // GARMENT_TECHPACK, where the column list genuinely differs per category.
  const category = request.nextUrl.searchParams.get("category") ?? "";
  if (chartType === "GARMENT_TECHPACK" && !GARMENT_CATEGORIES.includes(category as never)) {
    return NextResponse.json(
      {
        error: `category must be one of ${GARMENT_CATEGORIES.join(", ")} for a garment tech pack`,
      },
      { status: 400 }
    );
  }

  const csv = templateFor(chartType, category);
  const suffix = chartType === "GARMENT_TECHPACK" ? `-${category}` : "";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="manikan-${chartType.toLowerCase().replace("_", "-")}${suffix}-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
