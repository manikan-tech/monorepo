import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCustomerFromCookies } from "../../../lib/auth";

const VTON_SERVICE_URL = process.env.VTON_SERVICE_URL || "http://localhost:8003";
const MAX_HUMAN_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const CATEGORY_ALIASES: Record<string, string> = {
    top: "shirt",
    tops: "shirt",
    tee: "shirt",
    tees: "shirt",
    tshirt: "shirt",
    "t-shirt": "shirt",
    tshirts: "shirt",
    upper: "shirt",
    upper_body: "shirt",
    upperbody: "shirt",
    lower: "pants",
    lower_body: "pants",
    lowerbody: "pants",
    trouser: "pants",
    trousers: "pants",
    jean: "pants",
    jeans: "pants",
    shorts: "pants",
    dresses: "dress",
    overall: "dress",
};

const ALLOWED_CATEGORIES = new Set(["blouse", "shirt", "jacket", "pants", "skirt", "dress"]);

function normalizeCategory(value: FormDataEntryValue | null): string | null {
    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized) return null;

    return CATEGORY_ALIASES[normalized] || normalized;
}

function resolveGarmentImageUrl(value: FormDataEntryValue | null, origin: string): string | null {
    if (typeof value !== "string") return null;

    const raw = value.trim();
    if (!raw) return null;

    try {
        const resolved = new URL(raw, origin);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
            return null;
        }

        return resolved.toString();
    } catch {
        return null;
    }
}

function jsonError(
    requestId: string,
    status: number,
    code: string,
    error: string,
    details?: Record<string, unknown>
) {
    return NextResponse.json(
        {
            error,
            code,
            requestId,
            ...(details || {}),
        },
        { status }
    );
}

function extractUpstreamError(payload: unknown): { error: string; code?: string } {
    if (!payload || typeof payload !== "object") {
        return { error: "Virtual try-on service error" };
    }

    const data = payload as Record<string, unknown>;
    const detail = data.detail;

    if (detail && typeof detail === "object") {
        const detailObj = detail as Record<string, unknown>;
        const error = typeof detailObj.error === "string"
            ? detailObj.error
            : typeof detailObj.detail === "string"
                ? detailObj.detail
                : "Virtual try-on service error";
        const code = typeof detailObj.code === "string" ? detailObj.code : undefined;
        return { error, code };
    }

    if (typeof detail === "string") {
        return { error: detail };
    }

    if (typeof data.error === "string") {
        return {
            error: data.error,
            code: typeof data.code === "string" ? data.code : undefined,
        };
    }

    return { error: "Virtual try-on service error" };
}

export async function POST(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return jsonError(requestId, 401, "UNAUTHORIZED", "Unauthorized");
    }

    try {
        const formData = await request.formData();

        const humanImage = formData.get("human_image");
        if (!(humanImage instanceof File)) {
            return jsonError(requestId, 400, "MISSING_HUMAN_IMAGE", "human_image is required.");
        }

        if (!humanImage.type.startsWith("image/")) {
            return jsonError(requestId, 400, "INVALID_HUMAN_IMAGE_TYPE", "human_image must be an image file.");
        }

        if (humanImage.size <= 0) {
            return jsonError(requestId, 400, "EMPTY_HUMAN_IMAGE", "human_image cannot be empty.");
        }

        if (humanImage.size > MAX_HUMAN_IMAGE_SIZE_BYTES) {
            return jsonError(
                requestId,
                400,
                "HUMAN_IMAGE_TOO_LARGE",
                "human_image must be 5MB or smaller."
            );
        }

        const garmentImageUrl = resolveGarmentImageUrl(
            formData.get("garment_image_url"),
            request.nextUrl.origin
        );
        if (!garmentImageUrl) {
            return jsonError(
                requestId,
                400,
                "INVALID_GARMENT_IMAGE_URL",
                "garment_image_url must be a valid http(s) image URL."
            );
        }

        const category = normalizeCategory(formData.get("category"));
        if (!category || !ALLOWED_CATEGORIES.has(category)) {
            return jsonError(
                requestId,
                422,
                "UNSUPPORTED_CATEGORY",
                "category must be one of: blouse, shirt, jacket, pants, skirt, dress."
            );
        }

        const proxyFormData = new FormData();
        proxyFormData.append("human_image", humanImage);
        proxyFormData.append("garment_image_url", garmentImageUrl);
        proxyFormData.append("category", category);

        const upstream = await fetch(`${VTON_SERVICE_URL}/api/vton/2d`, {
            method: "POST",
            body: proxyFormData,
            headers: {
                "X-Request-Id": requestId,
            },
        });

        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        const headers = new Headers({
            "Content-Type": contentType,
            "Cache-Control": "no-store, max-age=0",
        });

        if (!upstream.ok) {
            const responseContentType = upstream.headers.get("content-type") || "";
            let errorMessage = "Virtual try-on service error";
            let errorCode = "VTON_SERVICE_ERROR";

            if (responseContentType.includes("application/json")) {
                const detail = await upstream.json().catch(() => ({}));
                const upstreamError = extractUpstreamError(detail);
                errorMessage = upstreamError.error || errorMessage;
                errorCode = upstreamError.code || errorCode;
            } else {
                const text = await upstream.text().catch(() => "");
                if (text.trim()) {
                    errorMessage = text.slice(0, 500);
                }
            }

            return jsonError(requestId, upstream.status, errorCode, errorMessage);
        }

        const body = await upstream.arrayBuffer();
        return new NextResponse(body, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error("VTON proxy error [%s]:", requestId, error);
        return jsonError(
            requestId,
            502,
            "VTON_SERVICE_UNREACHABLE",
            "Virtual try-on service unreachable"
        );
    }
}
