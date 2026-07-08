import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SALT_ROUNDS = 12;
const JWT_COOKIE_NAME = "manikan_auth_token";
const JWT_EXPIRY = "7d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

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

// ─── JWT Utilities ───────────────────────────────────────────

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

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as TokenPayload;
}

export async function createCustomerToken(
  payload: CustomerTokenPayload
): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyCustomerToken(
  token: string
): Promise<CustomerTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as CustomerTokenPayload;
}

// ─── Cookie Utilities ────────────────────────────────────────

const CUSTOMER_JWT_COOKIE_NAME = "manikan_customer_token";

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export function setCustomerAuthCookie(
  response: NextResponse,
  token: string
): void {
  response.cookies.set(CUSTOMER_JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function getAuthFromCookies(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function getCustomerFromCookies(): Promise<CustomerTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_JWT_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    return await verifyCustomerToken(token);
  } catch {
    return null;
  }
}
