import { getRuntimeContext, listAdminEvents } from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

function dateParam(value: string | null, exclusiveEnd = false) {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date filter");
  if (exclusiveEnd && dateOnly) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { companion } = await getRuntimeContext();
    const params = request.nextUrl.searchParams;
    const events = await listAdminEvents(companion.id, {
      type: params.get("type")?.trim() || undefined,
      source: params.get("source")?.trim() || undefined,
      from: dateParam(params.get("from") ?? params.get("date")),
      to: dateParam(params.get("to") ?? params.get("date"), true),
      limit: Number(params.get("limit")) || 200,
    });
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid date filter") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to load admin events", error);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}
