CREATE TABLE "known_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"canonical_key" text NOT NULL,
	"provider" text NOT NULL,
	"provider_poi_id" text,
	"status" text DEFAULT 'known' NOT NULL,
	"coordinate_system" text DEFAULT 'unknown' NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"district" text,
	"address" text,
	"latitude" real,
	"longitude" real,
	"first_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_visited_at" timestamp with time zone,
	"last_visited_at" timestamp with time zone,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"familiarity" real DEFAULT 0 NOT NULL,
	"mira_impression" text,
	"source" text NOT NULL,
	"last_verified_at" timestamp with time zone,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text,
	"owner" text NOT NULL,
	"topic" text NOT NULL,
	"description" text NOT NULL,
	"expected_at" timestamp with time zone,
	"emotional_weight" real DEFAULT 0.3 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"next_action" text,
	"resolution" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_world_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text,
	"mutation_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"reason" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"validation_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rejection_reason" text,
	"correlation_id" uuid,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"location_id" uuid,
	"flexibility" real DEFAULT 0.5 NOT NULL,
	"interruption_tolerance" real DEFAULT 0.5 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"source" text NOT NULL,
	"change_reason" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_blocks_valid_interval" CHECK ("schedule_blocks"."end_at" > "schedule_blocks"."start_at")
);
--> statement-breakpoint
CREATE TABLE "world_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"relationship_type" text NOT NULL,
	"personality_traits_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_score" real DEFAULT 0.5 NOT NULL,
	"current_situation" text,
	"last_interaction_at" timestamp with time zone,
	"active_open_loops_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_fictional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"current_time" timestamp with time zone DEFAULT now() NOT NULL,
	"current_location_id" uuid,
	"current_activity_id" text,
	"current_schedule_block_id" uuid,
	"energy" real DEFAULT 0.65 NOT NULL,
	"boredom" real DEFAULT 0.15 NOT NULL,
	"curiosity" real DEFAULT 0.72 NOT NULL,
	"loneliness" real DEFAULT 0.12 NOT NULL,
	"irritation" real DEFAULT 0 NOT NULL,
	"disappointment" real DEFAULT 0 NOT NULL,
	"attachment" real DEFAULT 0.18 NOT NULL,
	"share_desire" real DEFAULT 0.3 NOT NULL,
	"emotion_reasons_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_change_reason" text,
	"last_correlation_id" uuid,
	"last_world_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_daily_plan_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_tick_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"random_seed" text NOT NULL,
	"engine_version" text DEFAULT 'world-v1' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_tick_runs_valid_interval" CHECK ("world_tick_runs"."window_end" > "world_tick_runs"."window_start")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "internal_journals" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "state_changes" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "type" text DEFAULT 'thought' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "reality_layer" text DEFAULT 'inner' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "cause_type" text;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "cause_id" text;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "emotional_impact_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "character_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "consequences_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "importance" real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "share_potential" real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "random_seed" text;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "world_events" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "world_events"
SET
	"type" = 'thought',
	"reality_layer" = 'inner',
	"occurred_at" = "created_at",
	"emotional_impact_json" = "mood_impact_json";--> statement-breakpoint
UPDATE "companions"
SET
	"config_json" = jsonb_set(
		"config_json",
		'{policy,quietHours,timeZone}',
		'"Asia/Shanghai"'::jsonb,
		false
	),
	"updated_at" = now()
WHERE NOT ("config_json" ? 'schemaVersion')
	AND "config_json" #>> '{policy,quietHours,start}' = '02:00'
	AND "config_json" #>> '{policy,quietHours,end}' = '09:30'
	AND "config_json" #>> '{policy,quietHours,timeZone}' = 'Asia/Tokyo';--> statement-breakpoint
UPDATE "companions"
SET
	"config_json" = jsonb_set(
		jsonb_set(
			"config_json",
			'{character,profile}',
			CASE
				WHEN jsonb_typeof("config_json" #> '{character,profile}') = 'object'
					THEN "config_json" #> '{character,profile}'
				ELSE '{
					"city": "北京",
					"timeZone": "Asia/Shanghai",
					"education": "中国科学技术大学毕业",
					"lifeStage": "刚毕业的应届生",
					"housing": "在回龙观附近租房合租",
					"company": "某某某工作室",
					"jobTitle": "初级程序员",
					"workHours": {"start": "10:00", "end": "18:00", "flexible": true},
					"workPressure": "整体较低，偶尔有项目节点和临时修改",
					"incomeLevel": "普通北京应届生",
					"commuteModes": ["地铁", "步行", "共享单车"],
					"interests": ["科技", "游戏", "咖啡", "书店", "酒", "二次元", "展览", "城市散步", "互联网文化"],
					"homePlaceKey": "seed:beijing:home:huilongguan",
					"workPlaceKey": "seed:beijing:work:wangjing-studio"
				}'::jsonb
			END,
			true
		),
		'{schemaVersion}',
		'2'::jsonb,
		true
	),
	"updated_at" = now()
WHERE NOT ("config_json" ? 'schemaVersion');--> statement-breakpoint
ALTER TABLE "known_places" ADD CONSTRAINT "known_places_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_world_mutations" ADD CONSTRAINT "proposed_world_mutations_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_location_id_known_places_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."known_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_characters" ADD CONSTRAINT "world_characters_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_states" ADD CONSTRAINT "world_states_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_states" ADD CONSTRAINT "world_states_current_location_id_known_places_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."known_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_states" ADD CONSTRAINT "world_states_current_schedule_block_id_schedule_blocks_id_fk" FOREIGN KEY ("current_schedule_block_id") REFERENCES "public"."schedule_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_tick_runs" ADD CONSTRAINT "world_tick_runs_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "known_places_companion_canonical_key_idx" ON "known_places" USING btree ("companion_id","canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "known_places_provider_poi_idx" ON "known_places" USING btree ("companion_id","provider","provider_poi_id");--> statement-breakpoint
CREATE INDEX "known_places_companion_name_idx" ON "known_places" USING btree ("companion_id","name");--> statement-breakpoint
CREATE INDEX "known_places_companion_visited_idx" ON "known_places" USING btree ("companion_id","last_visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "open_loops_companion_idempotency_idx" ON "open_loops" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "open_loops_companion_status_expected_idx" ON "open_loops" USING btree ("companion_id","status","expected_at");--> statement-breakpoint
CREATE INDEX "open_loops_companion_topic_idx" ON "open_loops" USING btree ("companion_id","topic");--> statement-breakpoint
CREATE UNIQUE INDEX "proposed_world_mutations_companion_idempotency_idx" ON "proposed_world_mutations" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "proposed_world_mutations_companion_status_idx" ON "proposed_world_mutations" USING btree ("companion_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_blocks_companion_idempotency_idx" ON "schedule_blocks" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "schedule_blocks_companion_start_idx" ON "schedule_blocks" USING btree ("companion_id","start_at");--> statement-breakpoint
CREATE INDEX "schedule_blocks_companion_local_date_idx" ON "schedule_blocks" USING btree ("companion_id","local_date");--> statement-breakpoint
CREATE INDEX "schedule_blocks_companion_status_start_idx" ON "schedule_blocks" USING btree ("companion_id","status","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_characters_companion_stable_key_idx" ON "world_characters" USING btree ("companion_id","stable_key");--> statement-breakpoint
CREATE INDEX "world_characters_companion_type_idx" ON "world_characters" USING btree ("companion_id","relationship_type");--> statement-breakpoint
CREATE UNIQUE INDEX "world_states_companion_id_idx" ON "world_states" USING btree ("companion_id");--> statement-breakpoint
CREATE INDEX "world_states_last_tick_idx" ON "world_states" USING btree ("last_world_tick_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_tick_runs_companion_window_idx" ON "world_tick_runs" USING btree ("companion_id","window_start");--> statement-breakpoint
CREATE INDEX "world_tick_runs_status_lease_idx" ON "world_tick_runs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "world_tick_runs_companion_created_idx" ON "world_tick_runs" USING btree ("companion_id","created_at");--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_location_id_known_places_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."known_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_companion_correlation_idx" ON "events" USING btree ("companion_id","correlation_id");--> statement-breakpoint
CREATE INDEX "internal_journals_companion_correlation_idx" ON "internal_journals" USING btree ("companion_id","correlation_id");--> statement-breakpoint
CREATE INDEX "proactive_logs_companion_correlation_idx" ON "proactive_logs" USING btree ("companion_id","correlation_id");--> statement-breakpoint
CREATE INDEX "state_changes_companion_correlation_idx" ON "state_changes" USING btree ("companion_id","correlation_id");--> statement-breakpoint
CREATE INDEX "world_events_companion_occurred_idx" ON "world_events" USING btree ("companion_id","occurred_at");--> statement-breakpoint
CREATE INDEX "world_events_location_occurred_idx" ON "world_events" USING btree ("location_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_events_companion_idempotency_idx" ON "world_events" USING btree ("companion_id","idempotency_key");
