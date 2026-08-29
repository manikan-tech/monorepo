-- Telegram account linking and successful-generation metering.
-- IF NOT EXISTS makes this safe for the pre-existing Customer.telegramChatId
-- column on the Phase 1 database.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_telegramChatId_key"
  ON "Customer"("telegramChatId");

CREATE TABLE IF NOT EXISTS "BotUsage" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'VTON_GENERATION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BotUsage_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BotUsage_customerId_createdAt_idx"
  ON "BotUsage"("customerId", "createdAt");
