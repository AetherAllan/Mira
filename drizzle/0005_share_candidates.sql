CREATE TABLE "inner_thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"content" text NOT NULL,
	"topic" text NOT NULL,
	"emotional_intensity" real NOT NULL,
	"relevance_to_user" real NOT NULL,
	"novelty" real NOT NULL,
	"intimacy" real NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"content_summary" text NOT NULL,
	"reason_to_share" text NOT NULL,
	"emotional_intensity" real NOT NULL,
	"relevance_to_user" real NOT NULL,
	"novelty" real NOT NULL,
	"intimacy" real NOT NULL,
	"urgency" real NOT NULL,
	"interruption_cost" real NOT NULL,
	"event_importance" real NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"shared_message_id" uuid,
	"suppression_reason" text,
	"expires_at" timestamp with time zone,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inner_thoughts" ADD CONSTRAINT "inner_thoughts_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_candidates" ADD CONSTRAINT "share_candidates_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_candidates" ADD CONSTRAINT "share_candidates_shared_message_id_messages_id_fk" FOREIGN KEY ("shared_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inner_thoughts_companion_idempotency_idx" ON "inner_thoughts" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "inner_thoughts_companion_status_created_idx" ON "inner_thoughts" USING btree ("companion_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_candidates_companion_idempotency_idx" ON "share_candidates" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "share_candidates_companion_status_priority_idx" ON "share_candidates" USING btree ("companion_id","status","priority","created_at");--> statement-breakpoint
CREATE INDEX "share_candidates_status_lease_idx" ON "share_candidates" USING btree ("status","lease_expires_at");