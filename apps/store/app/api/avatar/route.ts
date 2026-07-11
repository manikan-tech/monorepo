import { NextRequest, NextResponse } from "next/server";

// ─── POST /api/avatar ───
// Thin proxy for the bare 3D body avatar (no garment). Enforces the
// "widget never calls the Python Body Service directly" rule for the
// body-model playground too. This flow has no product context, so it does
// NOT write a MeasurementSession (that happens in /api/tryon). The widget
// may include `shopper_ref` in the payload for uniformity; it is ignored here.

const BODY_SERVICE_URL = process.env.BODY_SERVICE_URL || "http://localhost:8001";

// ─── TODO(Phase 3b — Security): NOT YET IMPLEMENTED ───
//   Same auth gate as /api/tryon (retailer-key + Origin allowlist + rate
//   limiting) must be added here before launch. See docs/enterprise-roadmap.md.
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    let body: {
        sex?: string;
        height_cm?: number;
        weight_kg?: number;
        chest_cm?: number;
        waist_cm?: number;
        hips_cm?: number;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const { sex, height_cm, weight_kg, chest_cm, waist_cm, hips_cm } = body;

    for (const [key, value] of Object.entries({ sex, height_cm, weight_kg, chest_cm, waist_cm, hips_cm })) {
        if (value === undefined || value === null) {
            return NextResponse.json(
                { error: `Missing measurement: ${key}` },
                { status: 400, headers: CORS_HEADERS }
            );
        }
    }

    // ── Proxy to the Body Service ──
    try {
        const upstream = await fetch(`${BODY_SERVICE_URL}/generate-avatar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sex, height_cm, weight_kg, chest_cm, waist_cm, hips_cm }),
        });

        if (!upstream.ok) {
            const detail = await upstream.json().catch(() => ({}));
            return NextResponse.json(
                { error: detail.detail || "Body service error" },
                { status: upstream.status, headers: CORS_HEADERS }
            );
        }

        const glb = await upstream.arrayBuffer();
        return new NextResponse(glb, {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "model/gltf-binary" },
        });
    } catch (error) {
        console.error("Body service unreachable:", error);
        return NextResponse.json(
            { error: "Body service unreachable" },
            { status: 502, headers: CORS_HEADERS }
        );
    }
}
