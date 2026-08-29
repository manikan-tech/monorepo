import OpenAI from "openai";

export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);
const DEFAULT_EMBEDDING_MODEL = "liquid/lfm-2.5-embedding-350m:free";

const embeddingCache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 500;

function getEmbeddingClient(apiKey: string, baseURL?: string): { client: OpenAI; model: string } {
  return {
    client: new OpenAI({
      apiKey,
      baseURL,
    }),
    model: process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  };
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
  const result = await createEmbeddings([text]);
  const [embedding] = result;
  if (!embedding) {
    throw new Error("Embedding provider returned no vector for the requested text");
  }
  return embedding;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  const inputs = texts.map(t => t.trim()).filter(Boolean);
  if (inputs.length === 0) {
    throw new Error("Cannot create embeddings for empty text array");
  }

  const baseURL = process.env.OPENROUTER_BASE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? process.env.EMBEDDING_BASE_URL
    ?? "https://openrouter.ai/api/v1";
    
  const apiKey = process.env.OPENROUTER_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? process.env.EMBEDDING_API_KEY
    ?? (baseURL ? process.env.DEEPSEEK_API_KEY : undefined);

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not defined. Real embeddings cannot be generated and mock fallback is disabled.");
  }

  const { client, model } = getEmbeddingClient(apiKey, baseURL);

  const results: Array<number[] | undefined> = new Array(inputs.length);
  const missingInputs: string[] = [];
  const missingIndices: number[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const text = inputs[i];
    if (text === undefined) {
      throw new Error("Embedding input was unexpectedly missing");
    }
    const cacheKey = `${model}:${text}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
      results[i] = cached;
    } else {
      missingInputs.push(text);
      missingIndices.push(i);
    }
  }

  if (missingInputs.length > 0) {
    const request = {
      model,
      input: missingInputs,
      encoding_format: "float",
    } as const;

    const response = await client.embeddings.create(
      model.startsWith("text-embedding-3")
        ? { ...request, dimensions: EMBEDDING_DIMENSIONS }
        : request,
    );

    const newEmbeddings = response.data.map(d => d.embedding);

    if (!newEmbeddings || newEmbeddings.length !== missingInputs.length) {
      throw new Error(`Embedding provider returned incorrect number of results. Expected ${missingInputs.length}, got ${newEmbeddings?.length}`);
    }

    for (let i = 0; i < newEmbeddings.length; i++) {
      const embedding = newEmbeddings[i];
      const originalIndex = missingIndices[i];
      const originalText = missingInputs[i];
      if (!embedding || originalIndex === undefined || originalText === undefined) {
        throw new Error("Embedding provider returned an incomplete result set");
      }
      vectorToPgLiteral(embedding); // Validate

      results[originalIndex] = embedding;

      const cacheKey = `${model}:${originalText}`;
      if (embeddingCache.size >= MAX_CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey !== undefined) {
          embeddingCache.delete(firstKey);
        }
      }
      embeddingCache.set(cacheKey, embedding);
    }
  }

  return results.map((embedding) => {
    if (!embedding) {
      throw new Error("Embedding provider returned an incomplete result set");
    }
    return embedding;
  });
}

export type EmbeddableProduct = {
  name: string;
  category: string;
  gender: string;
  brand: string;
  fabric: string | null;
  description: string | null;
  fitNotes: string | null;
};

export function buildProductEmbeddingText(product: EmbeddableProduct): string {
  return [
    `${product.name} by ${product.brand}`,
    `Category: ${product.category} (${product.gender})`,
    product.fabric ? `Fabric: ${product.fabric}` : "",
    product.description ? `Description: ${product.description}` : "",
    product.fitNotes ? `Fit Notes: ${product.fitNotes}` : ""
  ].filter(Boolean).join(". ");
}
