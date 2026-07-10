import { generateWorldEventFromSeed, getRuntimeContext } from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body: unknown = await request.json().catch(() => ({}));
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const seedId = (body as Record<string, unknown>).seedId;
    if (seedId !== undefined && typeof seedId !== "string") {
      return NextResponse.json({ error: "seedId must be a string" }, { status: 400 });
    }
    const { companion } = await getRuntimeContext();
    const result = await generateWorldEventFromSeed(companion.id, seedId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No enabled seed card found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Failed to generate admin world event", error);
    return NextResponse.json({ error: "Failed to generate world event" }, { status: 500 });
  }
}
