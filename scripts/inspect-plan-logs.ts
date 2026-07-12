import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { llmUsageLogs } from "@/db/schema";

const db = getDb();
try {
  const rows = await db.select({
    generationId: llmUsageLogs.generationId,
    usedFallback: llmUsageLogs.usedFallback,
    error: llmUsageLogs.error,
    response: llmUsageLogs.responseJson,
    createdAt: llmUsageLogs.createdAt,
  }).from(llmUsageLogs).where(eq(llmUsageLogs.category, "world_planning"))
    .orderBy(desc(llmUsageLogs.createdAt)).limit(4);
  console.log(JSON.stringify(rows.map((row) => {
    const response = row.response as { choices?: Array<{ message?: { content?: string } }> } | null;
    return { ...row, response: undefined, content: response?.choices?.[0]?.message?.content ?? null };
  }), null, 2));
} finally {
  await closeDb();
}
