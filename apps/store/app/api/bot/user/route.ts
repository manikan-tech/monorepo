import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

// Shared secret the Telegram bot must send to authenticate.
const BOT_API_SECRET = process.env.BOT_API_SECRET || "";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET /api/bot/user ───────────────────────────────────────────
// Query params:
//   ?telegramChatId=123456   → lookup by linked Telegram chat_id
//   ?manikanId=clxyz...      → lookup by Manikan customer ID
//
// Returns: { found, customerId?, firstName?, creditsRemaining?, alreadyLinked? }
export async function GET(request: NextRequest) {
  // Verify bot secret
  const secret = request.headers.get("x-bot-secret");
  if (!secret || secret !== BOT_API_SECRET) return unauthorized();

  const { searchParams } = request.nextUrl;
  const telegramChatId = searchParams.get("telegramChatId");
  const manikanId = searchParams.get("manikanId");

  if (!telegramChatId && !manikanId) {
    return NextResponse.json(
      { error: "Provide telegramChatId or manikanId" },
      { status: 400 },
    );
  }

  const monthlyQuota = parseInt(process.env.BOT_MONTHLY_QUOTA || "5", 10);

  try {
    let customer;

    if (telegramChatId) {
      // Lookup by Telegram chat ID (returning user)
      customer = await prisma.customer.findUnique({
        where: { telegramChatId },
      });
    } else if (manikanId) {
      // Lookup by Manikan customer ID (first-time linking)
      customer = await prisma.customer.findUnique({
        where: { id: manikanId },
      });
    }

    if (!customer) {
      return NextResponse.json({ found: false });
    }

    // Count usage this calendar month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageCount = await prisma.botUsage.count({
      where: {
        customerId: customer.id,
        createdAt: { gte: monthStart },
      },
    });

    return NextResponse.json({
      found: true,
      customerId: customer.id,
      firstName: customer.firstName,
      creditsRemaining: Math.max(0, monthlyQuota - usageCount),
      alreadyLinked: !!customer.telegramChatId,
    });
  } catch (error) {
    console.error("[bot/user GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── POST /api/bot/user ──────────────────────────────────────────
// Body (JSON):
//   { action: "link",       customerId: "...", telegramChatId: "..." }
//   { action: "use_credit", customerId: "..." }
export async function POST(request: NextRequest) {
  // Verify bot secret
  const secret = request.headers.get("x-bot-secret");
  if (!secret || secret !== BOT_API_SECRET) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, customerId, telegramChatId } = body;

  if (!action || !customerId) {
    return NextResponse.json(
      { error: "action and customerId are required" },
      { status: 400 },
    );
  }

  try {
    // ── Link Telegram account ───────────────────────────────────
    if (action === "link") {
      if (!telegramChatId) {
        return NextResponse.json(
          { error: "telegramChatId is required for linking" },
          { status: 400 },
        );
      }

      // Check if this Telegram chat_id is already linked to another customer
      const existingLink = await prisma.customer.findUnique({
        where: { telegramChatId },
      });

      if (existingLink && existingLink.id !== customerId) {
        return NextResponse.json({
          success: false,
          error: "ALREADY_LINKED_OTHER",
          message:
            "This Telegram account is already linked to another Manikan user.",
        });
      }

      // Link it
      await prisma.customer.update({
        where: { id: customerId },
        data: { telegramChatId },
      });

      return NextResponse.json({ success: true });
    }

    // ── Unlink Telegram account ──────────────────────────────────
    if (action === "unlink") {
      await prisma.customer.update({
        where: { id: customerId },
        data: { telegramChatId: null },
      });
      return NextResponse.json({ success: true });
    }

    // ── Deduct a credit ─────────────────────────────────────────
    if (action === "use_credit") {
      // Double-check quota before deducting
      const monthlyQuota = parseInt(
        process.env.BOT_MONTHLY_QUOTA || "5",
        10,
      );
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const usageCount = await prisma.botUsage.count({
        where: {
          customerId,
          createdAt: { gte: monthStart },
        },
      });

      if (usageCount >= monthlyQuota) {
        return NextResponse.json({
          success: false,
          error: "QUOTA_EXCEEDED",
          message: "Monthly quota exceeded.",
        });
      }

      await prisma.botUsage.create({
        data: { customerId, action: "VTON_GENERATION" },
      });

      return NextResponse.json({
        success: true,
        creditsRemaining: Math.max(0, monthlyQuota - usageCount - 1),
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    console.error("[bot/user POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
