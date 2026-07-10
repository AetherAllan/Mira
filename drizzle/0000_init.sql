CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "companion_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"traits_json" jsonb NOT NULL,
	"mood_json" jsonb NOT NULL,
	"drives_json" jsonb NOT NULL,
	"relationship_json" jsonb NOT NULL,
	"active_arcs_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'Mira' NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "critic_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"approved" boolean NOT NULL,
	"too_repetitive" real NOT NULL,
	"too_customer_service" real NOT NULL,
	"too_intimate" real NOT NULL,
	"too_random" real NOT NULL,
	"too_user_fitted" real NOT NULL,
	"boundary_risk" real DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"rewrite_instruction" text,
	"draft_text" text,
	"final_text" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"companion_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"date" date NOT NULL,
	"summary" text NOT NULL,
	"reflection" text NOT NULL,
	"trait_updates_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"belief_updates_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"arc_updates_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"companion_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"importance" real DEFAULT 0.5 NOT NULL,
	"confidence" real DEFAULT 0.7 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"daily_use_count" integer DEFAULT 0 NOT NULL,
	"daily_use_date" date,
	"last_used_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"topics_json" jsonb NOT NULL,
	"emotion" text NOT NULL,
	"intent" text NOT NULL,
	"importance" real NOT NULL,
	"novelty" real NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"companion_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"raw_json" jsonb,
	"telegram_message_id" integer,
	"chat_id" text,
	"memory_candidate_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proactive_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"companion_id" uuid NOT NULL,
	"should_send" boolean NOT NULL,
	"reason" text NOT NULL,
	"selected_mode" text,
	"selected_seed_json" jsonb,
	"sent_message_id" uuid,
	"sent_text" text,
	"quiet_hours_blocked" boolean DEFAULT false NOT NULL,
	"daily_limit_blocked" boolean DEFAULT false NOT NULL,
	"interval_blocked" boolean DEFAULT false NOT NULL,
	"critic_blocked" boolean DEFAULT false NOT NULL,
	"score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"target_path" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"delta_json" jsonb,
	"reason" text NOT NULL,
	"caused_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_name" text NOT NULL,
	"args_json" jsonb NOT NULL,
	"result_json" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"seed_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"mood_impact_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"arc_impact_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companion_states" ADD CONSTRAINT "companion_states_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companions" ADD CONSTRAINT "companions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critic_reviews" ADD CONSTRAINT "critic_reviews_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seeds" ADD CONSTRAINT "event_seeds_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD CONSTRAINT "internal_journals_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_annotations" ADD CONSTRAINT "message_annotations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD CONSTRAINT "proactive_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD CONSTRAINT "proactive_logs_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD CONSTRAINT "proactive_logs_sent_message_id_messages_id_fk" FOREIGN KEY ("sent_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_changes" ADD CONSTRAINT "state_changes_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_seed_id_event_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."event_seeds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companion_states_companion_id_idx" ON "companion_states" USING btree ("companion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companions_user_id_idx" ON "companions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "critic_reviews_created_idx" ON "critic_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_seeds_companion_enabled_idx" ON "event_seeds" USING btree ("companion_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "event_seeds_companion_text_idx" ON "event_seeds" USING btree ("companion_id","text");--> statement-breakpoint
CREATE INDEX "events_companion_created_idx" ON "events" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_journals_companion_date_idx" ON "internal_journals" USING btree ("companion_id","date");--> statement-breakpoint
CREATE INDEX "memories_companion_kind_idx" ON "memories" USING btree ("companion_id","kind");--> statement-breakpoint
CREATE INDEX "memories_companion_importance_idx" ON "memories" USING btree ("companion_id","importance");--> statement-breakpoint
CREATE UNIQUE INDEX "message_annotations_message_id_idx" ON "message_annotations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_companion_created_idx" ON "messages" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_telegram_idempotency_idx" ON "messages" USING btree ("companion_id","role","telegram_message_id");--> statement-breakpoint
CREATE INDEX "proactive_logs_companion_created_idx" ON "proactive_logs" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE INDEX "state_changes_companion_created_idx" ON "state_changes" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_calls_companion_created_idx" ON "tool_calls" USING btree ("companion_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_user_id_idx" ON "users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "world_events_companion_created_idx" ON "world_events" USING btree ("companion_id","created_at");
