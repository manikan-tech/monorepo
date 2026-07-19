import path from "path";
import { access, readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getCustomerFromCookies } from "../../../lib/auth";

const CACHE_DIR = path.join(process.cwd(), "public", "vton-cache");
const CACHE_EXTENSIONS = ["png", "webp", "jpg", "jpeg"] as const;

const MIME_TYPES: Record<(typeof CACHE_EXTENSIONS)[number], string> = {
    png: "image/png",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
};

async function findCachedFile(productId: string) {
    for (const extension of CACHE_EXTENSIONS) {
        const filePath = path.join(CACHE_DIR, `${productId}.${extension}`);
        try {
            await access(filePath);
            return {
                filePath,
                contentType: MIME_TYPES[extension],
            };
        } catch {
            // Try the next extension.
        }
    }

    return null;
}

async function buildCachedPreviewResponse(productId: string, method: "GET" | "HEAD") {
    const cachedFile = await findCachedFile(productId);
    if (!cachedFile) {
        return NextResponse.json({ error: "Cached preview not found." }, { status: 404 });
    }

    const headers = new Headers({
        "Content-Type": cachedFile.contentType,
        "Cache-Control": "public, max-age=3600, immutable",
    });

    if (method === "HEAD") {
        return new NextResponse(null, { status: 200, headers });
    }

    const body = await readFile(cachedFile.filePath);
    return new NextResponse(body, { status: 200, headers });
}

async function handleCachedPreview(request: NextRequest, method: "GET" | "HEAD") {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const productId = request.nextUrl.searchParams.get("productId")?.trim();
    if (!productId) {
        return NextResponse.json({ error: "productId is required." }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(productId)) {
        return NextResponse.json({ error: "Invalid productId." }, { status: 400 });
    }

    return buildCachedPreviewResponse(productId, method);
}

export async function GET(request: NextRequest) {
    return handleCachedPreview(request, "GET");
}

export async function HEAD(request: NextRequest) {
    return handleCachedPreview(request, "HEAD");
}
