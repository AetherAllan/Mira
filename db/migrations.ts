import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export async function ensureDatabaseExtensions() {
  // pgvector must exist before Drizzle creates vector columns (Railway pgvector / Neon).
  await getDb().execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
}
