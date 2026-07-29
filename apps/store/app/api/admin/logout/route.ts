import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Clears the admin session cookie and Supabase session.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });

  response.cookies.set("manikan_role", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
