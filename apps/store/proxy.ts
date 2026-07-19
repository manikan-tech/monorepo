import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "./app/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Supabase Auth handles all route protection and redirections
  return await updateSession(request);
}

export const config = {
  // Match only specific routes to avoid running on static assets or breaking storefront routing (404 fix)
  matcher: [
    "/dashboard/:path*",
    "/account/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password"
  ],
};
