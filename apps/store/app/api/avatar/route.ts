import { NextRequest, NextResponse } from "next/server";
import { authorizeWidgetRequest, consumeQuota } from "../../lib/widget-auth";

// ─── POST /api/avatar ───
// Thin proxy for the bare 3D body avatar (no garment). Enforces the
// "widget never calls the Python Body Service directly" rule for the
// body-model playground too, and — like /api/tryon — is protected by the
// same Phase 3b security gate (key + fail-closed Origin + allowlist + rate
// limit). It is an equally open door to the FastAPI engine, so it MUST be
// gated. This flow has no product context, so it writes no MeasurementSession.
// The widget may include `shopper_ref` in the payload for uniformity; ignored.

const BODY_SERVICE_URL = process.env.BODY_SERVICE_URL || "http://localhost:8001";
// Shared secret body-service verifies on every call — proves this request
// came from this proxy, not just from something that can reach the URL.
const BODY_SERVICE_KEY = process.env.BODY_SERVICE_KEY || "";

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Manikan-Key",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    // ── Security gate (key + fail-closed Origin + allowlist + rate limit) ──
    const auth = await authorizeWidgetRequest(request, CORS_HEADERS, "BODY_MODELING");
    if (!auth.ok) {
        return auth.response;
    }

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
            headers: {
                "Content-Type": "application/json",
                "X-Manikan-Internal-Key": BODY_SERVICE_KEY,
            },
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

        // ── Deduct Quota ──
        if (auth.subscription) {
            await consumeQuota(auth.subscription.id, "BODY_MODELING");
        }

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
