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
        const response = await fetchWithTimeout(`${VTON_SERVICE_URL}/health`, 3000);
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
        console.error("VTON health check failed:", error);
        return NextResponse.json(
            {
                serviceAvailable: false,
                upstreamStatus: 503,
                status: "degraded",
                error: "Virtual try-on service is unreachable.",
            },
            { status: 503 }
        );
    }
}
