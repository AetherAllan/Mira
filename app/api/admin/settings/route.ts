import {
  createEvent,
  getAdminSettings,
  getRuntimeContext,
  updateRuntimeConfig,
} from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { companion } = await getRuntimeContext();
    return NextResponse.json(await getAdminSettings(companion.id));
  } catch (error) {
    console.error("Failed to load admin settings", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid settings body" }, { status: 400 });
    }
    const { user, companion } = await getRuntimeContext();
    const updated = await updateRuntimeConfig(companion.id, body);
    await createEvent({
      userId: user.id,
      companionId: companion.id,
      type: "settings.update",
      source: "admin",
      payloadJson: { fields: Object.keys(body) },
    });
    return NextResponse.json({ companion: updated, config: updated?.configJson });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Invalid time zone", "Model must end with :free"].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to update admin settings", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
