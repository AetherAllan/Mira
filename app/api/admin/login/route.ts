import { NextRequest, NextResponse } from "next/server";
import { attachAdminSession, clearAdminSession, verifyAdminPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const isJson = request.headers.get("content-type")?.includes("application/json");
  const body = isJson
    ? ((await request.json().catch(() => ({}))) as { password?: string })
    : Object.fromEntries(await request.formData());
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyAdminPassword(password)) {
    if (isJson) return NextResponse.json({ error: "密码错误" }, { status: 401 });
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  const response = isJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL("/dashboard", request.url), 303);
  attachAdminSession(response);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSession(response);
  return response;
}
