import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/config";

const COOKIE_NAME = "mira_admin";
const SESSION_PAYLOAD = "mira-dashboard:v1";

function sessionToken() {
  return createHmac("sha256", getAdminPassword()).update(SESSION_PAYLOAD).digest("base64url");
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAdminPassword(candidate: string) {
  try {
    return sameSecret(candidate, getAdminPassword());
  } catch {
    return false;
  }
}

export async function isAdmin() {
  try {
    const value = (await cookies()).get(COOKIE_NAME)?.value;
    return Boolean(value && sameSecret(value, sessionToken()));
  } catch {
    return false;
  }
}

export function attachAdminSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAdminSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/login");
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
