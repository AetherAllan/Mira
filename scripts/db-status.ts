import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";

const db = getDb();
try {
  const migrations = await db.execute(sql`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5
  `).catch((error) => [{ error: error instanceof Error ? error.message : String(error) }]);
  const columns = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('companion_states', 'world_states', 'daily_life_plans', 'planned_world_events')
    ORDER BY table_name, ordinal_position
  `);
  console.log(JSON.stringify({ migrations, columns }, null, 2));
} finally {
  await closeDb();
}
