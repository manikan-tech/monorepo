import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { prisma } from "./prisma";

// 8-hour session — admin does not need an indefinitely-live session
export const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60;
export interface AdminSession {
  authenticated: true;
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "SUPPORT";
}

/**
 * Returns the admin session if the request carries a valid admin cookie and Supabase session.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const role = cookieStore.get("manikan_role")?.value;
    if (role !== "admin") return null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) return null;
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: user.email },
    });

    if (!admin) return null;

    return {
      authenticated: true,
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };
  } catch (error) {
    console.error("Error in getAdminSession:", error);
    return null;
  }
}
