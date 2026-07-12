CREATE TABLE "daily_life_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"day_type" text NOT NULL,
	"weekend_mode" text,
	"theme" text NOT NULL,
	"summary" text NOT NULL,
	"sampling_seed" integer NOT NULL,
	"fingerprint_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"generation_attempt" integer DEFAULT 1 NOT NULL,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_world_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"slot" text NOT NULL,
	"weight" real DEFAULT 0.5 NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"location_id" uuid,
	"character_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emotional_impact_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consequences_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inner_narrative" text NOT NULL,
	"loop_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"importance" real NOT NULL,
	"share_potential" real NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"selection_reason" text,
	"occurred_event_id" uuid,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_world_events_valid_window" CHECK ("planned_world_events"."window_end" > "planned_world_events"."window_start")
);
--> statement-breakpoint
ALTER TABLE "companion_states" ADD COLUMN "state_reasons_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "companion_states" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "companions" SET "config_json" = jsonb_set("config_json", '{schemaVersion}', '3'::jsonb, true);--> statement-breakpoint
UPDATE "companion_states" AS cs
SET
  "mood_json" = jsonb_build_object(
    'valence', COALESCE((cs."mood_json"->>'valence')::real, 0.12),
    'energy', COALESCE(ws."energy", (cs."mood_json"->>'energy')::real, 0.55),
    'curiosity', COALESCE(ws."curiosity", (cs."mood_json"->>'curiosity')::real, 0.74),
    'concern', COALESCE((cs."mood_json"->>'concern')::real, 0.28),
    'playfulness', COALESCE((cs."mood_json"->>'playfulness')::real, 0.44),
    'boredom', COALESCE(ws."boredom", (cs."mood_json"->>'boredom')::real, 0.18),
    'loneliness', COALESCE(ws."loneliness", 0.12),
    'irritation', COALESCE(ws."irritation", 0),
    'disappointment', COALESCE(ws."disappointment", 0)
  ),
  "drives_json" = jsonb_build_object(
    'affection', COALESCE((cs."drives_json"->>'affection')::real, 0.35),
    'aestheticUrge', COALESCE((cs."drives_json"->>'aestheticUrge')::real, 0.64),
    'noveltySeeking', COALESCE((cs."drives_json"->>'noveltySeeking')::real, 0.58),
    'shareDesire', COALESCE(ws."share_desire", 0.3)
  )
FROM "world_states" AS ws
WHERE ws."companion_id" = cs."companion_id";--> statement-breakpoint
ALTER TABLE "daily_life_plans" ADD CONSTRAINT "daily_life_plans_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_world_events" ADD CONSTRAINT "planned_world_events_plan_id_daily_life_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_life_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_world_events" ADD CONSTRAINT "planned_world_events_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_world_events" ADD CONSTRAINT "planned_world_events_location_id_known_places_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."known_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_life_plans_companion_date_idx" ON "daily_life_plans" USING btree ("companion_id","local_date");--> statement-breakpoint
CREATE INDEX "daily_life_plans_status_date_idx" ON "daily_life_plans" USING btree ("status","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_world_events_companion_key_idx" ON "planned_world_events" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "planned_world_events_plan_window_idx" ON "planned_world_events" USING btree ("plan_id","window_start");--> statement-breakpoint
CREATE INDEX "planned_world_events_companion_status_window_idx" ON "planned_world_events" USING btree ("companion_id","status","window_start");--> statement-breakpoint
