import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export async function ensureDatabaseExtensions() {
  // Neon supports pgvector, but the extension must exist before Drizzle creates vector columns.
  await getDb().execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
}
