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
  //
  // EXCEPT when a `next` param is present: that's the signal that /login was
  // reached on purpose, mid-flow (Navbar's Try-On modal, the product page's
  // handleVirtualTryOn) -- always because the CURRENT session isn't valid for
  // whatever they're trying to do (a stale retailer/admin session, an expired
  // manikan_role cookie, etc.). A blanket bounce here previously discarded
  // `next` and sent them to "/" with no way to ever reach the login form to
  // sign in as the right account -- confirmed live: it showed as "/visualize"
  // flashing then landing back on home. Having a Supabase session at all is
  // not the same as being correctly authenticated for the destination, so
  // `next` presence takes precedence over this convenience redirect.
  const hasNextParam = request.nextUrl.searchParams.has("next");
  if (user && isAuthRoute && !hasNextParam) {
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

  // route protection for admin
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isAdminLogin = request.nextUrl.pathname === "/admin/login";

  if (isAdminRoute && !isAdminLogin) {
    if (!user || role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  // Prevent Admins from accessing Retailer dashboard or Customer account
  if (user && role === "admin" && (isDashboard || isAccount || request.nextUrl.pathname === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
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
