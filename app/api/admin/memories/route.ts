import type { MemoryKind } from "@/core/types";
import {
  createEvent,
  createMemory,
  deleteMemory,
  getRuntimeContext,
  listAdminMemories,
  setMemoryCooldown,
} from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const KINDS = new Set<MemoryKind>([
  "user_memory",
  "relationship_memory",
  "self_memory",
  "world_experience",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tags(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { companion } = await getRuntimeContext();
    const params = request.nextUrl.searchParams;
    const kindValue = params.get("kind");
    if (kindValue && !KINDS.has(kindValue as MemoryKind)) {
      return NextResponse.json({ error: "Invalid memory kind" }, { status: 400 });
    }
    const memories = await listAdminMemories(companion.id, {
      kind: kindValue as MemoryKind | undefined,
      tag: params.get("tag")?.trim() || undefined,
      search: params.get("search")?.trim() || undefined,
      limit: Number(params.get("limit")) || 200,
    });
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("Failed to load admin memories", error);
    return NextResponse.json({ error: "Failed to load memories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = record(await request.json());
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    const { user, companion } = await getRuntimeContext();

    if (body.action === "cooldown") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Memory id is required" }, { status: 400 });
      }
      const parsed = body.cooldownUntil == null ? null : new Date(String(body.cooldownUntil));
      if (parsed && Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid cooldownUntil" }, { status: 400 });
      }
      const memory = await setMemoryCooldown(body.id, parsed, companion.id);
      if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
      await createEvent({
        userId: user.id,
        companionId: companion.id,
        type: "memory.cooldown",
        source: "admin",
        payloadJson: { memoryId: memory.id, cooldownUntil: parsed?.toISOString() ?? null },
      });
      return NextResponse.json({ memory });
    }

    if (
      typeof body.kind !== "string" ||
      !KINDS.has(body.kind as MemoryKind) ||
      typeof body.content !== "string" ||
      !body.content.trim()
    ) {
      return NextResponse.json(
        { error: "kind and non-empty content are required" },
        { status: 400 },
      );
    }
    const parsedTags = body.tags === undefined ? [] : tags(body.tags);
    if (!parsedTags) return NextResponse.json({ error: "tags must be strings" }, { status: 400 });
    if (body.importance !== undefined && typeof body.importance !== "number") {
      return NextResponse.json({ error: "importance must be a number" }, { status: 400 });
    }
    if (body.confidence !== undefined && typeof body.confidence !== "number") {
      return NextResponse.json({ error: "confidence must be a number" }, { status: 400 });
    }

    const memory = await createMemory({
      userId: user.id,
      companionId: companion.id,
      kind: body.kind as MemoryKind,
      content: body.content.trim(),
      tags: parsedTags,
      importance:
        typeof body.importance === "number" ? Math.max(0, Math.min(body.importance, 1)) : 0.5,
      confidence:
        typeof body.confidence === "number" ? Math.max(0, Math.min(body.confidence, 1)) : 0.7,
    });
    await createEvent({
      userId: user.id,
      companionId: companion.id,
      type: "memory.write",
      source: "admin",
      payloadJson: { memoryId: memory.id, kind: memory.kind, reason: "manual" },
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error("Failed to update admin memory", error);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Memory id is required" }, { status: 400 });
    const { user, companion } = await getRuntimeContext();
    const deleted = await deleteMemory(id, companion.id);
    if (!deleted) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    await createEvent({
      userId: user.id,
      companionId: companion.id,
      type: "memory.delete",
      source: "admin",
      payloadJson: { memoryId: id },
    });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Failed to delete admin memory", error);
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
