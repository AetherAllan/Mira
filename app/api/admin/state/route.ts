import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getDashboardSnapshot());
  } catch (error) {
    console.error("Failed to load admin state", error);
    return NextResponse.json({ error: "Failed to load dashboard state" }, { status: 500 });
  }
}
