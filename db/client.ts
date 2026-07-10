import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

let database: NeonHttpDatabase<typeof schema> | undefined;

export function getDb() {
  if (database) return database;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  database = drizzle({ client: neon(url), schema });
  return database;
}
