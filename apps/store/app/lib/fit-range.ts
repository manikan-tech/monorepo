type FitDimension = "chest" | "waist" | "hips";

type SizeChartRow = {
  size?: unknown;
  chest_cm?: unknown;
  waist_cm?: unknown;
  hip_cm?: unknown;
};

type ShopperMeasurements = {
  chest_cm?: unknown;
  waist_cm?: unknown;
  hips_cm?: unknown;
};

export type FitRangeDifference = {
  dimension: FitDimension;
  shopperCm: number;
  chartCm: number;
  size: string;
  direction: "below_minimum" | "above_maximum";
  differenceCm: number;
};

export type FitRangeAssessment = {
  differences: FitRangeDifference[];
  hasAboveMaximum: boolean;
  closestSize: string | null;
};

const DIMENSIONS: ReadonlyArray<{
  dimension: FitDimension;
  chartField: keyof SizeChartRow;
  shopperField: keyof ShopperMeasurements;
}> = [
  { dimension: "chest", chartField: "chest_cm", shopperField: "chest_cm" },
  { dimension: "waist", chartField: "waist_cm", shopperField: "waist_cm" },
  { dimension: "hips", chartField: "hip_cm", shopperField: "hips_cm" },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function describeDifference(difference: FitRangeDifference): string {
  const dimension = difference.dimension;
  const size = difference.size ? ` (${difference.size})` : "";
  const shopper = formatCm(difference.shopperCm);
  const chart = formatCm(difference.chartCm);
  const delta = formatCm(difference.differenceCm);

  if (difference.direction === "above_maximum") {
    return `Your ${dimension} is ${shopper} cm. The largest available ${dimension} is ${chart} cm${size}, so you are ${delta} cm above the chart.`;
  }

  return `Your ${dimension} is ${shopper} cm. The smallest available ${dimension} is ${chart} cm${size}, so it is ${delta} cm larger than your measurement.`;
}

/**
 * Compares the submitted body measurements with the exact server-built chart
 * sent to the recommendation service. It deliberately does not choose a
 * regular recommendation: that remains the agent's responsibility. This
 * helper only identifies the unambiguous cases outside the published range.
 */
export function assessFitRange(
  rawMeasurements: unknown,
  sizeChartJson: string,
): FitRangeAssessment | null {
  if (!rawMeasurements || typeof rawMeasurements !== "object") return null;

  let chart: SizeChartRow[];
  try {
    const parsed: unknown = JSON.parse(sizeChartJson);
    if (!Array.isArray(parsed)) return null;
    chart = parsed.filter((row): row is SizeChartRow => Boolean(row) && typeof row === "object");
  } catch {
    return null;
  }

  const measurements = rawMeasurements as ShopperMeasurements;
  const differences: FitRangeDifference[] = [];

  for (const { dimension, chartField, shopperField } of DIMENSIONS) {
    const shopperCm = measurements[shopperField];
    if (!isFiniteNumber(shopperCm)) continue;

    const values = chart.flatMap((row) => {
      const chartCm = row[chartField];
      return isFiniteNumber(chartCm)
        ? [{ chartCm, size: typeof row.size === "string" ? row.size : "" }]
        : [];
    });
    if (values.length === 0) continue;

    const minimum = values.reduce((smallest, value) => value.chartCm < smallest.chartCm ? value : smallest);
    const maximum = values.reduce((largest, value) => value.chartCm > largest.chartCm ? value : largest);

    if (shopperCm < minimum.chartCm) {
      differences.push({
        dimension,
        shopperCm,
        chartCm: minimum.chartCm,
        size: minimum.size,
        direction: "below_minimum",
        differenceCm: minimum.chartCm - shopperCm,
      });
    } else if (shopperCm > maximum.chartCm) {
      differences.push({
        dimension,
        shopperCm,
        chartCm: maximum.chartCm,
        size: maximum.size,
        direction: "above_maximum",
        differenceCm: shopperCm - maximum.chartCm,
      });
    }
  }

  if (differences.length === 0) return null;

  const hasAboveMaximum = differences.some((difference) => difference.direction === "above_maximum");
  const belowMinimumSizes = differences
    .filter((difference) => difference.direction === "below_minimum")
    .map((difference) => difference.size)
    .filter(Boolean);
  // A smallest-size suggestion is only safe when every out-of-range dimension
  // is below its minimum and those minimum values point to the same size.
  const closestSize = !hasAboveMaximum
    && belowMinimumSizes.length === differences.length
    && new Set(belowMinimumSizes).size === 1
    ? belowMinimumSizes[0] ?? null
    : null;

  return { differences, hasAboveMaximum, closestSize };
}

export function buildFitRangeResponse(assessment: FitRangeAssessment) {
  const details = assessment.differences.map(describeDifference).join(" ");

  if (assessment.hasAboveMaximum) {
    return {
      action: "provide_recommendation",
      provider: "STORE-FIT-RANGE",
      message: `This item is outside the available size range. ${details} I would not recommend this item in its listed sizes.`,
      explanation: details,
      recommended_size: null,
      confidence_score: null,
      fit_range: assessment,
    };
  }

  const recommendation = assessment.closestSize
    ? `${assessment.closestSize} is the closest available size and may fit slightly loose in the measurements above.`
    : "The smallest available option is likely to fit slightly loose in the measurements above.";

  return {
    action: "provide_recommendation",
    provider: "STORE-FIT-RANGE",
    message: `This item is just below the available size range. ${details} ${recommendation}`,
    explanation: `${details} ${recommendation}`,
    recommended_size: assessment.closestSize,
    confidence_score: null,
    fit_range: assessment,
  };
}
