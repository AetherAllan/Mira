CREATE TABLE "llm_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"correlation_id" uuid,
	"category" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real,
	"latency_ms" integer NOT NULL,
	"used_fallback" boolean DEFAULT false NOT NULL,
	"error" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "relationship_summary" text;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "place_preference_updates_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "interest_updates_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "character_updates_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "weekly_summary" text;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "evolution_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_usage_logs" ADD CONSTRAINT "llm_usage_logs_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_logs_companion_created_idx" ON "llm_usage_logs" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_logs_companion_category_created_idx" ON "llm_usage_logs" USING btree ("companion_id","category","created_at");