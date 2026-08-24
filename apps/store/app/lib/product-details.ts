type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

type ProductDetails = {
  name: string;
  category: string;
  fabric: string;
  description: string | null;
};

const PRODUCT_DETAIL_REQUEST = /\b(tell me (?:more )?about|describe|description|details?|about this|what (?:does|is) this|colou?rs?|fabric|material|texture|style|look|brand)\b/i;

function lastUserMessage(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const { role, content } = message as ChatMessage;
    if (role === "user" && typeof content === "string") return content.trim();
  }
  return null;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function concise(value: string, maximumLength = 280): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return sentence(normalized);

  const shortened = normalized.slice(0, maximumLength);
  const lastWord = shortened.lastIndexOf(" ");
  return `${(lastWord > 0 ? shortened.slice(0, lastWord) : shortened).trimEnd()}…`;
}

/** Only intercept explicit product-information requests; fit and sizing stay with the existing flow. */
export function asksForProductDetails(messages: unknown[]): boolean {
  const query = lastUserMessage(messages);
  return Boolean(query && PRODUCT_DETAIL_REQUEST.test(query));
}

/**
 * Makes a short, shopper-friendly introduction from approved catalog copy.
 * Fit instructions and implementation-only fields (such as colour hex codes)
 * are deliberately excluded from customer-facing messages.
 */
export function buildProductDetailsResponse(product: ProductDetails) {
  const description = product.description?.trim();
  const intro = description
    ? concise(description)
    : `${product.name} is a piece from our ${product.category.toLowerCase()} collection.`;
  const material = product.fabric.trim();
  const mentionsMaterial = description?.toLowerCase().includes(material.toLowerCase());
  const materialDetail = material && !mentionsMaterial
    ? `Made with ${material}, it brings a considered finish to the look.`
    : null;
  const closing = "An easy choice when you want to feel comfortable and put together.";

  const message = [`Meet ${product.name} — ${intro}`, materialDetail, closing]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return {
    action: "provide_recommendation",
    provider: "STORE-PRODUCT-DETAILS",
    message,
    explanation: message,
    recommended_size: null,
    confidence_score: null,
  };
}
