import { prisma } from "./prisma";
import { BODY_FIT_FIELDS, BODY_FIT_MATCH_FIELDS, csvColumnFor } from "./measurement-fields";

// Builds the CSV string /api/widget/recommend hands to recommendation-service.
// Server-built from ProductVariant, replacing a client-supplied size_chart --
// product_id is attacker-controlled, so a fallback that trusted the client
// whenever a product had no ingested data would just move the hole to
// whichever product an attacker points at (see the security review for this
// change). This is the only source now; the caller must not accept a client
// value at all.
//
// Emits the same header shape parse_size_chart_csv already expects
// (size_label,chest_cm,waist_cm,hip_cm,length_cm,inseam_cm), so the Python
// side needs no change.

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function buildBodyFitChartCsv(
  productId: string,
  retailerId: string,
): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product || product.retailerId !== retailerId) return null;

  // compute_best_size_match only ever reads chest/waist/hip; a variant with
  // none of those contributes nothing (agent.py's own `chart_chest == 0.0 and
  // chart_waist == 0.0: continue` skip), so exclude it here rather than
  // emitting a row with three "" cells the matcher would just discard anyway.
  const usable = product.variants.filter((v) =>
    BODY_FIT_MATCH_FIELDS.some((f) => v[f] != null),
  );
  // Never emit a header-only string: parse_size_chart_csv("") -> DictReader
  // returns [] -> compute_best_size_match's `if not distances` branch
  // fabricates a size with 0.5 confidence. null lets the caller omit
  // size_chart entirely so the agent asks for measurements instead.
  if (usable.length === 0) return null;

  const header = ["size_label", ...BODY_FIT_FIELDS.map(csvColumnFor)];
  const lines = usable.map((v) =>
    [
      csvEscape(v.sizeLabel),
      ...BODY_FIT_FIELDS.map((f) => (v[f] != null ? String(v[f]) : "")),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
