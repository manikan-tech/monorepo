-- Manikan — Business Inquiry lead-capture (For Business page)
--
-- Adds the BusinessInquiry model for the /business page "Request a Demo" form.
-- This is a standalone table with no foreign keys — it captures pre-signup leads.
--
-- Apply with:
--     prisma db execute --file prisma/migrations/20260718150000_add_business_inquiry/migration.sql --schema prisma/schema.prisma
-- (Do NOT `prisma db push` — unrelated drift may exist on the shared DB.)

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED');

-- CreateTable
CREATE TABLE "BusinessInquiry" (
    "id"            TEXT NOT NULL,
    "companyName"   TEXT NOT NULL,
    "contactName"   TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "phone"         TEXT,
    "website"       TEXT,
    "monthlyOrders" TEXT,
    "message"       TEXT,
    "status"        "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessInquiry_pkey" PRIMARY KEY ("id")
);
