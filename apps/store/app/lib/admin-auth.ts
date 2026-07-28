import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

const ADMIN_COOKIE_NAME = "manikan_admin";
// 8-hour session — admin does not need an indefinitely-live session
export const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60;
export interface AdminSession {
  authenticated: true;
}

/**
 * Returns the admin session if the request carries a valid admin cookie.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!value) return null;

    if (!verifyAdminSecret(value)) return null;

    return { authenticated: true };
  } catch {
    return null;
  }
}

/**
 * Verifies the plain-text secret against ADMIN_SECRET env variable
 */
export function verifyAdminSecret(submitted: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !submitted) return false;

  try {
    const a = Buffer.from(submitted);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
