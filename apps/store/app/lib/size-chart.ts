import { prisma } from "./prisma";
import { BODY_FIT_MATCH_FIELDS } from "./measurement-fields";

// Builds the JSON string /api/widget/recommend hands to recommendation-service
// as size_chart. Server-built from ProductVariant, replacing a
// client-supplied size_chart -- product_id is attacker-controlled, so a
// fallback that trusted the client whenever a product had no ingested data
// would just move the hole to whichever product an attacker points at (see
// the security review for this change). This is the only source now; the
// caller must not accept a client value at all.
//
// Emits the JSON array shape compute_recommended_size (app/agent.py) parses
// via json.loads and is tested against in tests/test_agent.py:
// [{"size": ..., "chest_cm": ..., "waist_cm": ..., "hip_cm": ...}, ...].

export async function buildBodyFitChartCsv(
  productId: string,
  retailerId: string,
): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product || product.retailerId !== retailerId) return null;

  // compute_recommended_size only ever reads chest/waist/hip; a variant with
  // none of those contributes nothing (agent.py's own KeyError skip on a
  // missing chest_cm/waist_cm), so exclude it here rather than emitting an
  // entry the matcher would just discard anyway.
  const usable = product.variants.filter((v) =>
    BODY_FIT_MATCH_FIELDS.some((f) => (v as any)[f] != null) || v.garmentWaistCm != null || v.garmentHipCm != null
  );
  // Never emit an empty array: json.loads("[]") -> compute_recommended_size's
  // `if not size_chart` branch returns is_out_of_range=True cleanly. null
  // lets the caller omit size_chart entirely so the agent asks for
  // measurements instead.
  if (usable.length === 0) return null;

  return JSON.stringify(
    usable.map((v) => ({
      size: v.sizeLabel,
      ...(v.chestCm != null ? { chest_cm: v.chestCm } : {}),
      ...(v.waistCm != null ? { waist_cm: v.waistCm } : v.garmentWaistCm != null ? { waist_cm: v.garmentWaistCm } : {}),
      ...(v.hipCm != null ? { hip_cm: v.hipCm } : v.garmentHipCm != null ? { hip_cm: v.garmentHipCm } : {}),
    })),
  );
}
