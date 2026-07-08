import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getCustomerFromCookies } from "../../lib/auth";

// ─── GET /api/addresses ─── list all addresses for the current customer
export async function GET() {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const addresses = await prisma.address.findMany({
        where: { customerId: customer.sub },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ addresses }, { status: 200 });
}

// ─── POST /api/addresses ─── create a new address
export async function POST(request: NextRequest) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
        label?: string;
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
        isDefault?: boolean;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { label, street, city, state, zipCode, country, isDefault } = body;

    if (!street || !city || !state) {
        return NextResponse.json(
            { error: "street, city, and state are required" },
            { status: 400 }
        );
    }

    // If setting this as default, unset any previous default first
    if (isDefault) {
        await prisma.address.updateMany({
            where: { customerId: customer.sub, isDefault: true },
            data: { isDefault: false },
        });
    }

    const address = await prisma.address.create({
        data: {
            customerId: customer.sub,
            label: label ?? "Home",
            street,
            city,
            state,
            zipCode: zipCode ?? null,
            country: country ?? "Egypt",
            isDefault: isDefault ?? false,
        },
    });

    return NextResponse.json({ address }, { status: 201 });
}
