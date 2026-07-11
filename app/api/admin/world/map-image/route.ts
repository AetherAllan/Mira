import { NextResponse } from "next/server";
import { ensureCompanionContext } from "@/db/repo";
import { requireAdminApi } from "@/lib/auth";
import { AMapProvider } from "@/world/providers/amap";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const apiKey = process.env.AMAP_WEB_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "AMap is not configured" }, { status: 404 });
  try {
    const context = await ensureCompanionContext();
    const points = context.world.places
      .filter((place) => place.latitude != null && place.longitude != null)
      .sort((left, right) => right.visitCount - left.visitCount || right.familiarity - left.familiarity)
      .slice(0, 10)
      .map((place) => ({ latitude: place.latitude!, longitude: place.longitude! }));
    const current = context.world.state.currentLocationId
      ? context.world.places.find((place) => place.id === context.world.state.currentLocationId)
      : undefined;
    const center = current?.latitude != null && current.longitude != null
      ? { latitude: current.latitude, longitude: current.longitude }
      : points[0];
    if (!center) return NextResponse.json({ error: "No mapped places" }, { status: 404 });
    const url = new AMapProvider({ apiKey }).buildStaticMapUrl({ center, markers: points, zoom: 10 });
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`AMap static map returned ${response.status}`);
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/png",
        "Cache-Control": "private, max-age=1800",
      },
    });
  } catch (error) {
    console.error("Failed to load AMap static image", error);
    return NextResponse.json({ error: "Failed to load map" }, { status: 502 });
  }
}
