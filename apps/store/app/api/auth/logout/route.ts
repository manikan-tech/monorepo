import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    
    // Also clear the old legacy manikan_auth_token just in case
    const cookieStore = await cookies();
    cookieStore.delete("manikan_auth_token");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
