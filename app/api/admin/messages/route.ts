import type { MessageRole } from "@/core/types";
import { listAdminMessages, getRuntimeContext } from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const ROLES = new Set<MessageRole>(["user", "assistant", "system", "tool"]);

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
    const roleValue = params.get("role");
    if (roleValue && !ROLES.has(roleValue as MessageRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const messages = await listAdminMessages(companion.id, {
      role: roleValue as MessageRole | undefined,
      topic: params.get("topic")?.trim() || undefined,
      from: dateParam(params.get("from") ?? params.get("date")),
      to: dateParam(params.get("to") ?? params.get("date"), true),
      limit: Number(params.get("limit")) || 200,
    });
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid date filter") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to load admin messages", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
