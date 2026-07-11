DROP INDEX IF EXISTS "world_events_companion_idempotency_idx";
DROP INDEX IF EXISTS "world_events_location_occurred_idx";
DROP INDEX IF EXISTS "world_events_companion_occurred_idx";
DROP INDEX IF EXISTS "state_changes_companion_correlation_idx";
DROP INDEX IF EXISTS "proactive_logs_companion_correlation_idx";
DROP INDEX IF EXISTS "internal_journals_companion_correlation_idx";
DROP INDEX IF EXISTS "events_companion_correlation_idx";

ALTER TABLE "world_events" DROP CONSTRAINT IF EXISTS "world_events_location_id_known_places_id_fk";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "correlation_id";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "idempotency_key";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "random_seed";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "share_potential";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "importance";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "consequences_json";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "character_ids_json";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "emotional_impact_json";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "cause_id";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "cause_type";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "occurred_at";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "reality_layer";
ALTER TABLE "world_events" DROP COLUMN IF EXISTS "type";

ALTER TABLE "state_changes" DROP COLUMN IF EXISTS "correlation_id";
ALTER TABLE "proactive_logs" DROP COLUMN IF EXISTS "source_id";
ALTER TABLE "proactive_logs" DROP COLUMN IF EXISTS "source_type";
ALTER TABLE "proactive_logs" DROP COLUMN IF EXISTS "correlation_id";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "source_id";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "source_type";
ALTER TABLE "internal_journals" DROP COLUMN IF EXISTS "correlation_id";
ALTER TABLE "events" DROP COLUMN IF EXISTS "correlation_id";

DROP TABLE IF EXISTS "proposed_world_mutations";
DROP TABLE IF EXISTS "world_tick_runs";
DROP TABLE IF EXISTS "open_loops";
DROP TABLE IF EXISTS "world_states";
DROP TABLE IF EXISTS "schedule_blocks";
DROP TABLE IF EXISTS "world_characters";
DROP TABLE IF EXISTS "known_places";

-- Config/profile normalization is intentionally retained. It is backward-compatible JSON,
-- and reverting it could overwrite administrator changes made after the migration.
