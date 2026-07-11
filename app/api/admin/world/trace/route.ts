import { NextRequest, NextResponse } from "next/server";
import { ensureCompanionContext } from "@/db/repo";
import { getCorrelationTrace } from "@/db/worldDashboardRepo";
import { requireAdminApi } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const correlationId = request.nextUrl.searchParams.get("correlationId")?.trim() ?? "";
  if (!UUID.test(correlationId)) {
    return NextResponse.json({ error: "A valid correlationId is required" }, { status: 400 });
  }
  const context = await ensureCompanionContext();
  return NextResponse.json(await getCorrelationTrace(context.companion.id, correlationId));
}
