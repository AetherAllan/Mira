import "dotenv/config";
import { ensureDatabaseExtensions } from "@/db/migrations";

await ensureDatabaseExtensions();
console.log("pgvector extension is ready; applying Drizzle schema next.");
