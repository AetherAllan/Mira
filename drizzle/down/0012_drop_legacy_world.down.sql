ALTER TABLE "world_states" ADD COLUMN "energy" real DEFAULT 0.65 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "boredom" real DEFAULT 0.15 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "curiosity" real DEFAULT 0.72 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "loneliness" real DEFAULT 0.12 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "irritation" real DEFAULT 0 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "disappointment" real DEFAULT 0 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "attachment" real DEFAULT 0.18 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "share_desire" real DEFAULT 0.3 NOT NULL;
ALTER TABLE "world_states" ADD COLUMN "emotion_reasons_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "proactive_logs" ADD COLUMN "selected_seed_json" jsonb;

CREATE TABLE "event_seeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "companion_id" uuid NOT NULL REFERENCES "companions"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "text" text NOT NULL,
  "tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "weight" real DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "event_seeds_companion_enabled_idx" ON "event_seeds" ("companion_id", "enabled");
CREATE UNIQUE INDEX "event_seeds_companion_text_idx" ON "event_seeds" ("companion_id", "text");
ALTER TABLE "world_events" ADD COLUMN "seed_id" uuid REFERENCES "event_seeds"("id") ON DELETE set null;
