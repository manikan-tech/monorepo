CREATE TABLE "OriginAllowlist" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OriginAllowlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VtonCacheEntry" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VtonCacheEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OriginAllowlist_retailerId_origin_key"
  ON "OriginAllowlist"("retailerId", "origin");
CREATE INDEX "OriginAllowlist_retailerId_idx"
  ON "OriginAllowlist"("retailerId");
CREATE UNIQUE INDEX "VtonCacheEntry_retailerId_cacheKey_key"
  ON "VtonCacheEntry"("retailerId", "cacheKey");
CREATE INDEX "VtonCacheEntry_retailerId_updatedAt_idx"
  ON "VtonCacheEntry"("retailerId", "updatedAt");

ALTER TABLE "OriginAllowlist" ADD CONSTRAINT "OriginAllowlist_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VtonCacheEntry" ADD CONSTRAINT "VtonCacheEntry_retailerId_fkey"
  FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
