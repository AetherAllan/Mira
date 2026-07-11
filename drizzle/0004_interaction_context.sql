CREATE TABLE "conversation_working_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"current_topic" text,
	"recent_summary" text DEFAULT '' NOT NULL,
	"unresolved_questions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_commitments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mira_commitments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emotional_context" text,
	"last_correlation_id" uuid,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"source_message_id" uuid,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"expires_at" timestamp with time zone,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_working_memories" ADD CONSTRAINT "conversation_working_memories_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_knowledge" ADD CONSTRAINT "shared_knowledge_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_knowledge" ADD CONSTRAINT "shared_knowledge_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_working_memories_companion_idx" ON "conversation_working_memories" USING btree ("companion_id");--> statement-breakpoint
CREATE INDEX "conversation_working_memories_updated_idx" ON "conversation_working_memories" USING btree ("last_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_knowledge_companion_idempotency_idx" ON "shared_knowledge" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "shared_knowledge_companion_subject_idx" ON "shared_knowledge" USING btree ("companion_id","subject");--> statement-breakpoint
CREATE INDEX "shared_knowledge_companion_status_updated_idx" ON "shared_knowledge" USING btree ("companion_id","verification_status","updated_at");--> statement-breakpoint
UPDATE "companion_states"
SET
	"relationship_json" = jsonb_set(
		jsonb_set(
			jsonb_set(
				"relationship_json",
				'{friendshipAffinity}',
				COALESCE("relationship_json" -> 'friendshipAffinity', '0.2'::jsonb),
				true
			),
			'{romanticAffinity}',
			COALESCE("relationship_json" -> 'romanticAffinity', '0.05'::jsonb),
			true
		),
		'{stage}',
		COALESCE("relationship_json" -> 'stage', '"new"'::jsonb),
		true
	),
	"updated_at" = now();
