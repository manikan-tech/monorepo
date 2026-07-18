import { NextResponse } from "next/server";

const VTON_SERVICE_URL = process.env.VTON_SERVICE_URL || "http://localhost:8003";

async function fetchWithTimeout(url: string, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
        });
    } finally {
        clearTimeout(timeout);
    }
}

export async function GET() {
    try {
        const response = await fetchWithTimeout(`${VTON_SERVICE_URL}/capabilities`, 3000);
        const payload = await response.json().catch(() => ({}));

        return NextResponse.json(
            {
                serviceAvailable: response.ok,
                upstreamStatus: response.status,
                ...payload,
            },
            {
                status: response.ok ? 200 : 503,
            }
        );
    } catch (error) {
        console.error("VTON capabilities check failed:", error);
        return NextResponse.json(
            {
                serviceAvailable: false,
                upstreamStatus: 503,
                status: "degraded",
                supported_categories: ["blouse", "shirt", "jacket", "pants", "skirt", "dress"],
                min_image_dimensions: {
                    human: { width: 400, height: 600 },
                    garment: { width: 300, height: 300 },
                },
                max_upload_size_bytes: 5 * 1024 * 1024,
                error: "Virtual try-on service is unreachable.",
            },
            { status: 503 }
        );
    }
}
