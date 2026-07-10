import {
  createEvent,
  createEventSeeds,
  getRuntimeContext,
  listSeeds,
  setSeedEnabled,
} from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { companion } = await getRuntimeContext();
    return NextResponse.json({ seeds: await listSeeds(companion.id) });
  } catch (error) {
    console.error("Failed to load admin seed cards", error);
    return NextResponse.json({ error: "Failed to load seed cards" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = record(await request.json());
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    const { user, companion } = await getRuntimeContext();

    if (body.action === "toggle" || body.action === "set_enabled") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
      }
      const seed = await setSeedEnabled(body.id, body.enabled, companion.id);
      if (!seed) return NextResponse.json({ error: "Seed card not found" }, { status: 404 });
      await createEvent({
        userId: user.id,
        companionId: companion.id,
        type: "world.seed.update",
        source: "admin",
        payloadJson: { seedId: seed.id, enabled: seed.enabled },
      });
      return NextResponse.json({ seed });
    }

    if (
      typeof body.type !== "string" ||
      !body.type.trim() ||
      typeof body.text !== "string" ||
      !body.text.trim()
    ) {
      return NextResponse.json({ error: "type and text are required" }, { status: 400 });
    }
    if (
      body.tags !== undefined &&
      (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string"))
    ) {
      return NextResponse.json({ error: "tags must be strings" }, { status: 400 });
    }
    if (body.weight !== undefined && typeof body.weight !== "number") {
      return NextResponse.json({ error: "weight must be a number" }, { status: 400 });
    }

    const rows = await createEventSeeds(companion.id, [
      {
        type: body.type.trim(),
        text: body.text.trim(),
        tags: (body.tags as string[] | undefined) ?? [],
        weight: typeof body.weight === "number" ? Math.max(0, Math.min(body.weight, 10)) : 1,
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      },
    ]);
    if (!rows[0]) {
      return NextResponse.json({ error: "Seed card already exists" }, { status: 409 });
    }
    await createEvent({
      userId: user.id,
      companionId: companion.id,
      type: "world.seed.create",
      source: "admin",
      payloadJson: { seedId: rows[0].id, type: rows[0].type },
    });
    return NextResponse.json({ seed: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Failed to update admin seed card", error);
    return NextResponse.json({ error: "Failed to update seed card" }, { status: 500 });
  }
}
