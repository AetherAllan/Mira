DROP TABLE "planned_world_events";
DROP TABLE "daily_life_plans";
ALTER TABLE "companion_states" DROP COLUMN "state_reasons_json";
ALTER TABLE "companion_states" DROP COLUMN "version";
UPDATE "companions" SET "config_json" = jsonb_set("config_json", '{schemaVersion}', '2'::jsonb, true);
