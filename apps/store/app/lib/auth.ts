import { createClient } from "./supabase/server";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

// ─── Password Utilities ──────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Utilities (Stubbed for backwards compatibility) ────
// The application previously used JWTs. We have migrated to Supabase SSR Auth.
// These types are kept to avoid breaking existing API routes.

export interface TokenPayload {
  sub: string; // retailer ID
  email: string;
  name: string;
}

export interface CustomerTokenPayload {
  sub: string; // customer ID
  email: string;
  firstName: string;
  lastName: string;
}

// We no longer sign tokens, Supabase handles it. 
export async function createToken(payload: TokenPayload): Promise<string> {
  throw new Error("createToken is deprecated. Use Supabase Auth.");
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  throw new Error("verifyToken is deprecated. Use Supabase Auth.");
}

export async function createCustomerToken(
  payload: CustomerTokenPayload
): Promise<string> {
  throw new Error("createCustomerToken is deprecated. Use Supabase Auth.");
}

export async function verifyCustomerToken(
  token: string
): Promise<CustomerTokenPayload> {
  throw new Error("verifyCustomerToken is deprecated. Use Supabase Auth.");
}

// ─── Cookie Utilities (Stubbed) ──────────────────────────────
// Setting cookies is now handled by Supabase SSR middleware and signInWithPassword.

export function setAuthCookie(response: any, token: string): void {
  // Deprecated
}

export function setCustomerAuthCookie(response: any, token: string): void {
  // Deprecated
}

// ─── Auth Retrievers (Migrated to Supabase) ──────────────────

export async function getAuthFromCookies(): Promise<TokenPayload | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) return null;

    // Look up the Retailer in Prisma using the Supabase auth ID or email
    const retailer = await prisma.retailer.findUnique({
      where: { email: user.email },
    });

    if (!retailer) return null;

    // Return the payload shape expected by the rest of the app
    return {
      sub: retailer.id, // This is the Prisma Retailer ID, not the Supabase Auth ID
      email: retailer.email,
      name: retailer.storeName,
    };
  } catch (error) {
    console.error("Error in getAuthFromCookies adapter:", error);
    return null;
  }
}

export async function getCustomerFromCookies(): Promise<CustomerTokenPayload | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) return null;

    // Look up the Customer in Prisma
    const customer = await prisma.customer.findUnique({
      where: { email: user.email },
    });

    if (!customer) return null;

    // Return the payload shape expected by the rest of the app
    return {
      sub: customer.id, // This is the Prisma Customer ID
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    };
  } catch (error) {
    console.error("Error in getCustomerFromCookies adapter:", error);
    return null;
  }
}
