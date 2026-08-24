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
  fitNotes: string | null;
  garmentColorHex: string | null;
  tshirtColorHex: string | null;
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

/** Only intercept explicit product-information requests; fit and sizing stay with the existing flow. */
export function asksForProductDetails(messages: unknown[]): boolean {
  const query = lastUserMessage(messages);
  return Boolean(query && PRODUCT_DETAIL_REQUEST.test(query));
}

/** Formats catalog facts only. It never infers a colour, texture, or material from the product image. */
export function buildProductDetailsResponse(product: ProductDetails) {
  const facts: string[] = [];
  const description = product.description?.trim();

  if (description) {
    facts.push(sentence(description));
  } else {
    facts.push(`${product.name} is listed as a ${product.category.toLowerCase()}.`);
  }

  const attributes = [
    product.brand ? `Brand: ${product.brand}` : null,
    product.fabric ? `Material: ${product.fabric}` : null,
    product.garmentColorHex || product.tshirtColorHex
      ? `Catalog color: ${product.garmentColorHex || product.tshirtColorHex}`
      : null,
    product.fitNotes?.trim() ? `Fit notes: ${product.fitNotes.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  if (attributes.length > 0) facts.push(sentence(attributes.join(". ")));

  const message = `About ${product.name}: ${facts.join(" ")}`;
  return {
    action: "provide_recommendation",
    provider: "STORE-PRODUCT-DETAILS",
    message,
    explanation: message,
    recommended_size: null,
    confidence_score: null,
  };
}
