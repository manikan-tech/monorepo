import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

export async function GET() {
  try {
    const distinctProducts = await prisma.product.findMany({
      select: { brand: true },
      distinct: ["brand"],
      where: { isActive: true },
    });

    const brands = distinctProducts
      .flatMap(({ brand }) => {
        const value = brand?.trim();
        return value ? [value] : [];
      })
      .sort((left, right) => left.localeCompare(right));

    return NextResponse.json({ brands });
  } catch (error) {
    console.error("Failed to fetch product brands:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
