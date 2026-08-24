type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

type ProductDetails = {
  name: string;
  category: string;
  brand: string;
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

/** Only intercept explicit product-information requests; fit and sizing stay with the existing flow. */
export function asksForProductDetails(messages: unknown[]): boolean {
  const query = lastUserMessage(messages);
  return Boolean(query && PRODUCT_DETAIL_REQUEST.test(query));
}

/**
 * Trusted context inserted by Store after the conversation. The recommendation
 * service can vary the answer by the shopper's question, but cannot invent
 * catalog facts or expose internal metadata such as colour hex values.
 */
export function buildProductDetailsContext(product: ProductDetails): string {
  const facts = [
    `Name: ${product.name}`,
    `Category: ${product.category}`,
    product.brand ? `Brand: ${product.brand}` : null,
    product.fabric ? `Material: ${product.fabric}` : null,
    product.description?.trim() ? `Description: ${product.description.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return [
    "TRUSTED CURRENT-PRODUCT CONTEXT (from the Store database):",
    ...facts,
    "The shopper's latest message is about this product. Answer that specific question in a warm, natural shopping-assistant voice in 1-3 short sentences.",
    "Use only the facts above; do not invent colour, texture, features, pricing, or availability. Do not expose IDs, hex colour values, internal fit instructions, or implementation details.",
    "Do not repeat a previous fit or out-of-range result unless the shopper explicitly asks about size or fit.",
  ].join("\n");
}
