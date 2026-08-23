-- Product.description is already present in newer databases, but this makes
-- the RAG text fields safe to apply to older environments as well.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fitNotes" TEXT;

-- Cosine-distance queries only need to consider indexed products.
CREATE INDEX IF NOT EXISTS "Product_embedding_hnsw_cosine_idx"
  ON "Product" USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
