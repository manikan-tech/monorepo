import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCustomerFromCookies } from "../../../lib/auth";

// ─── PATCH /api/addresses/[id] ─── update an address
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.address.findUnique({
        where: { id },
        select: { customerId: true },
    });

    if (!existing || existing.customerId !== customer.sub) {
        return NextResponse.json({ error: "Address not found" }, { status: 404 });
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

    // If setting this as default, unset any previous default first
    if (body.isDefault) {
        await prisma.address.updateMany({
            where: { customerId: customer.sub, isDefault: true },
            data: { isDefault: false },
        });
    }

    const address = await prisma.address.update({
        where: { id },
        data: {
            ...(body.label !== undefined && { label: body.label }),
            ...(body.street !== undefined && { street: body.street }),
            ...(body.city !== undefined && { city: body.city }),
            ...(body.state !== undefined && { state: body.state }),
            ...(body.zipCode !== undefined && { zipCode: body.zipCode }),
            ...(body.country !== undefined && { country: body.country }),
            ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        },
    });

    return NextResponse.json({ address }, { status: 200 });
}

// ─── DELETE /api/addresses/[id] ─── delete an address
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.address.findUnique({
        where: { id },
        select: { customerId: true, isDefault: true },
    });

    if (!existing || existing.customerId !== customer.sub) {
        return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    await prisma.address.delete({ where: { id } });

    // If we just deleted the default address, promote the next oldest one
    if (existing.isDefault) {
        const next = await prisma.address.findFirst({
            where: { customerId: customer.sub },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });

        if (next) {
            await prisma.address.update({
                where: { id: next.id },
                data: { isDefault: true },
            });
        }
    }

    return NextResponse.json({ message: "Address deleted" }, { status: 200 });
}
