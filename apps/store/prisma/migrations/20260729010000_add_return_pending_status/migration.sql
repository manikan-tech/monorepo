-- Adds the RETURN_PENDING value to the OrderStatus enum.
-- This is the saga intermediate state that is written BEFORE the Stripe refund
-- call so that concurrent return requests see a terminal-like status and are
-- rejected immediately within the Phase 1 transaction, before any Stripe
-- network call is made.
--
-- Apply with:
--     prisma db execute --file prisma/migrations/20260729010000_add_return_pending_status/migration.sql --schema prisma/schema.prisma

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURN_PENDING'
    BEFORE 'RETURNED';
