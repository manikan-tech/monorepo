import { NextResponse } from "next/server";

// Clears the admin session cookie.
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("manikan_admin", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return response;
}
