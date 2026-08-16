import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "../../../lib/prisma";
import { authorizeServiceRequest } from "../../../lib/service-auth";

const VTON_SERVICE_URL = process.env.VTON_SERVICE_URL || "http://localhost:8003";
// Shared secret tryon-service verifies on every call — distinct from
// VTON_2D_SERVICE_KEY above, which only guards the inbound hop to THIS route.
// Proves this outbound request came from this proxy, not just from something
// that can reach the Python service's URL.
const TRYON_SERVICE_KEY = process.env.TRYON_SERVICE_KEY || "";
const MAX_HUMAN_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const ALLOWED_IMAGE_HOSTS = new Set(
    (process.env.VTON_ALLOWED_IMAGE_HOSTS || "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
);

const CATEGORY_ALIASES: Record<string, string> = {
    top: "shirt", tops: "shirt", tee: "shirt", tees: "shirt", tshirt: "shirt",
    "t-shirt": "shirt", tshirts: "shirt", upper: "shirt", upper_body: "shirt",
    upperbody: "shirt", lower: "pants", lower_body: "pants", lowerbody: "pants",
    trouser: "pants", trousers: "pants", jean: "pants", jeans: "pants", shorts: "pants",
    dresses: "dress", overall: "dress",
};
const ALLOWED_CATEGORIES = new Set(["blouse", "shirt", "jacket", "pants", "skirt", "dress"]);

function normalizeCategory(value: string): string | null {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized) return null;
    return CATEGORY_ALIASES[normalized] || normalized;
}

function resolveProductImageUrl(value: string): string | null {
    try {
        const url = new URL(value);
        // The VTON service fetches this URL itself. Restricting it to known
        // asset hosts prevents a retailer-controlled catalog field from being
        // used as an SSRF primitive against the service's private network.
        if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
            return null;
        }
        return url.toString();
    } catch {
        return null;
    }
}

function jsonError(requestId: string, status: number, code: string, error: string) {
    return NextResponse.json({ error, code, requestId }, { status });
}

function extractUpstreamError(payload: unknown): { error: string; code?: string } {
    if (!payload || typeof payload !== "object") return { error: "Virtual try-on service error" };
    const data = payload as Record<string, unknown>;
    const detail = data.detail;
    if (detail && typeof detail === "object") {
        const value = detail as Record<string, unknown>;
        return {
            error: typeof value.error === "string" ? value.error : "Virtual try-on service error",
            code: typeof value.code === "string" ? value.code : undefined,
        };
    }
    return {
        error: typeof detail === "string" ? detail : typeof data.error === "string" ? data.error : "Virtual try-on service error",
        code: typeof data.code === "string" ? data.code : undefined,
    };
}

// Internal service endpoint. It is intentionally not browser/session callable.
// /api/vton/2d/proxy is the sole storefront entrypoint.
export async function POST(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    const auth = await authorizeServiceRequest(request, "VTON_2D");
    if (!auth.ok) return auth.response;

    try {
        const formData = await request.formData();
        const humanImage = formData.get("human_image");
        const productId = formData.get("product_id");
        if (!(humanImage instanceof File)) {
            return jsonError(requestId, 400, "MISSING_HUMAN_IMAGE", "human_image is required.");
        }
        if (!humanImage.type.startsWith("image/") || humanImage.size <= 0) {
            return jsonError(requestId, 400, "INVALID_HUMAN_IMAGE", "human_image must be a non-empty image file.");
        }
        if (humanImage.size > MAX_HUMAN_IMAGE_SIZE_BYTES) {
            return jsonError(requestId, 400, "HUMAN_IMAGE_TOO_LARGE", "human_image must be 5MB or smaller.");
        }
        if (typeof productId !== "string" || !productId.trim()) {
            return jsonError(requestId, 400, "MISSING_PRODUCT_ID", "product_id is required.");
        }

        // Product data is the source of truth. This prevents callers from
        // spending a retailer's AI quota on arbitrary image URLs/categories.
        const product = await prisma.product.findFirst({
            where: { id: productId, isActive: true },
            select: { imageUrl: true, category: true },
        });
        if (!product) {
            return jsonError(requestId, 404, "PRODUCT_NOT_FOUND", "Product not found.");
        }
        const garmentImageUrl = resolveProductImageUrl(product.imageUrl);
        if (!garmentImageUrl) {
            return jsonError(requestId, 422, "INVALID_PRODUCT_IMAGE", "Product image is not permitted for virtual try-on.");
        }
        const category = normalizeCategory(product.category);
        if (!category || !ALLOWED_CATEGORIES.has(category)) {
            return jsonError(requestId, 422, "UNSUPPORTED_CATEGORY", "Product category is not supported for virtual try-on.");
        }

        const upstreamFormData = new FormData();
        upstreamFormData.append("human_image", humanImage);
        upstreamFormData.append("garment_image_url", garmentImageUrl);
        upstreamFormData.append("category", category);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let upstream: Response;
        try {
            upstream = await fetch(`${VTON_SERVICE_URL}/api/vton/2d`, {
                method: "POST",
                body: upstreamFormData,
                headers: {
                    "X-Request-Id": requestId,
                    "X-Manikan-Internal-Key": process.env.TRYON_SERVICE_KEY || "",
                },
                signal: controller.signal,
                cache: "no-store",
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!upstream.ok) {
            const payload = await upstream.json().catch(() => null);
            const error = extractUpstreamError(payload);
            return jsonError(requestId, upstream.status, error.code || "VTON_SERVICE_ERROR", error.error);
        }
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
                "Cache-Control": "no-store, max-age=0",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("VTON service proxy error [%s]:", requestId, error);
        return jsonError(requestId, 502, "VTON_SERVICE_UNREACHABLE", "Virtual try-on service unreachable");
    }
}
