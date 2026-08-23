import OpenAI from "openai";

export const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function getEmbeddingClient(apiKey: string, baseURL?: string): { client: OpenAI; model: string } {
  return {
    client: new OpenAI({
      apiKey,
      baseURL,
    }),
    model: process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  };
}

function generateDeterministicMockVector(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  // Mulberry32 generator
  let a = seed;
  const rand = () => {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const vector: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const val = rand() * 2 - 1;
    vector.push(val);
    sumSq += val * val;
  }

  const magnitude = Math.sqrt(sumSq);
  return vector.map((val) => val / (magnitude || 1));
}

export function vectorToPgLiteral(vector: readonly number[]): string {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider returned ${vector.length} dimensions; expected ${EMBEDDING_DIMENSIONS}`);
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned a non-finite vector value");
  }

  return `[${vector.join(",")}]`;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) {
    throw new Error("Cannot create an embedding for empty text");
  }

  const baseURL = process.env.OPENAI_BASE_URL ?? process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY
    ?? process.env.EMBEDDING_API_KEY
    ?? (baseURL ? process.env.DEEPSEEK_API_KEY : undefined);

  if (!apiKey) {
    console.warn("⚠️ OPENAI_API_KEY or EMBEDDING_API_KEY is not defined. Generating a deterministic mock embedding vector.");
    const mockVector = generateDeterministicMockVector(input);
    vectorToPgLiteral(mockVector);
    return mockVector;
  }

  const { client, model } = getEmbeddingClient(apiKey, baseURL);
  const request = {
    model,
    input,
    encoding_format: "float",
  } as const;
  const response = await client.embeddings.create(
    model.startsWith("text-embedding-3")
      ? { ...request, dimensions: EMBEDDING_DIMENSIONS }
      : request,
  );
  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error("Embedding provider returned no embedding data");
  }

  vectorToPgLiteral(embedding);
  return embedding;
}

export type EmbeddableProduct = {
  name: string;
  category: string;
  fabric: string | null;
  description: string | null;
  fitNotes: string | null;
};

export function buildProductEmbeddingText(product: EmbeddableProduct): string {
  return `${product.name}. Category: ${product.category}. Fabric: ${product.fabric ?? ""}. Description: ${product.description ?? ""}. Fit Notes: ${product.fitNotes ?? ""}`;
}
