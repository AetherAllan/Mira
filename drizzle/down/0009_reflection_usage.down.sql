DROP TABLE IF EXISTS "llm_usage_logs";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "relationship_summary";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "place_preference_updates_json";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "interest_updates_json";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "character_updates_json";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "weekly_summary";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "evolution_applied_at";
