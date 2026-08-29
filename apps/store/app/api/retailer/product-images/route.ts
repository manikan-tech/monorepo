import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";

const PRODUCT_IMAGE_BUCKET = process.env.PRODUCT_IMAGE_BUCKET || "product-images";
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function hasValidImageSignature(bytes: Uint8Array, contentType: keyof typeof IMAGE_TYPES): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

// ─── POST /api/retailer/product-images ──────────────────────────────────
// A retailer-only upload boundary for catalog imagery. Objects are public by
// design because the Store, retailer websites, and VTON worker must all be
// able to fetch the same durable HTTPS URL without sharing credentials.
export async function POST(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }
  if (!(image.type in IMAGE_TYPES)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image" }, { status: 400 });
  }
  if (image.size <= 0 || image.size > MAX_PRODUCT_IMAGE_BYTES) {
    return NextResponse.json({ error: "Product images must be between 1 byte and 10MB" }, { status: 413 });
  }

  const contentType = image.type as keyof typeof IMAGE_TYPES;
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!hasValidImageSignature(bytes, contentType)) {
    return NextResponse.json({ error: "The uploaded file does not match its image type" }, { status: 400 });
  }

  const path = `${user.sub}/${randomUUID()}.${IMAGE_TYPES[contentType]}`;
  const { error } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) {
    console.error("Product image upload failed:", error.message);
    return NextResponse.json(
      { error: "Product image storage is not available. Please try again or use an image URL." },
      { status: 503 },
    );
  }

  const { data } = supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return NextResponse.json({ imageUrl: data.publicUrl, path }, { status: 201 });
}
