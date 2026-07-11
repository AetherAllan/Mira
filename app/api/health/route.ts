export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { companions } from "@/db/schema";
import { getWorldHealth } from "@/world/health";

export async function GET() {
  const required = [
    "API_KEY",
    "DATABASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ALLOWED_USER_ID",
    "TELEGRAM_WEBHOOK_SECRET",
    "CRON_SECRET",
    "ADMIN_PASSWORD",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());

  // Railway's deployment healthcheck verifies that the web process is ready.
  // Configuration readiness remains visible without exposing any secret values.
  const companionRows = await getDb()
    .select({ id: companions.id, configJson: companions.configJson })
    .from(companions)
    .orderBy(asc(companions.createdAt));
  const worlds = await Promise.all(
    companionRows.map((companion) =>
      getWorldHealth(
        companion.id,
        companion.configJson.character.profile.timeZone,
      ),
    ),
  );
  const worldHealthy = worlds.length > 0 && worlds.every((health) => health.cronHealthy);

  return Response.json({
    status: missing.length === 0 && worldHealthy ? "ok" : "degraded",
    service: "mira",
    configured: missing.length === 0,
    world: {
      status: worldHealthy ? "healthy" : "unhealthy",
      companionCount: worlds.length,
      healthyCount: worlds.filter((health) => health.cronHealthy).length,
      companions: worlds,
    },
  });
}
