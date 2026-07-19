import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup" ||
    request.nextUrl.pathname === "/forgot-password" ||
    request.nextUrl.pathname === "/reset-password";

  // Note: Retailers might also log in. The front-end login page will redirect
  // them appropriately. But if a logged-in user hits /login, we should redirect them.
  // We can't tell if they are a Retailer or Customer just from the session here,
  // so we default to sending them to the store root. They can navigate from there.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const role = request.cookies.get("manikan_role")?.value;

  // Account and Dashboard protection
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAccount = request.nextUrl.pathname.startsWith("/account");

  if (!user && (isDashboard || isAccount)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Prevent Customers from accessing Retailer dashboard
  if (user && isDashboard && role !== "retailer") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
