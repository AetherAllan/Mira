import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

let database: PostgresJsDatabase<typeof schema> | undefined;
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (database) return database;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  // Railway private network and TCP proxy both work without TLS for this stack.
  client = postgres(url, {
    max: 10,
    prepare: false,
    ssl: url.includes(".railway.internal") || url.includes("proxy.rlwy.net") ? false : undefined,
  });
  database = drizzle(client, { schema });
  return database;
}
