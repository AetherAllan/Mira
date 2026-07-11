CREATE TABLE "awaiting_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_at" timestamp with time zone,
	"expectation" real NOT NULL,
	"emotional_weight" real NOT NULL,
	"explicit_question" boolean DEFAULT false NOT NULL,
	"vulnerable_disclosure" boolean DEFAULT false NOT NULL,
	"user_commitment" boolean DEFAULT false NOT NULL,
	"user_said_busy" boolean DEFAULT false NOT NULL,
	"message_kind" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"consequence_applied_at" timestamp with time zone,
	"dissatisfaction_expressed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_message_id" uuid,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "awaiting_replies" ADD CONSTRAINT "awaiting_replies_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awaiting_replies" ADD CONSTRAINT "awaiting_replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awaiting_replies" ADD CONSTRAINT "awaiting_replies_resolved_by_message_id_messages_id_fk" FOREIGN KEY ("resolved_by_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "awaiting_replies_message_idx" ON "awaiting_replies" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "awaiting_replies_companion_status_started_idx" ON "awaiting_replies" USING btree ("companion_id","status","started_at");--> statement-breakpoint
CREATE INDEX "awaiting_replies_companion_kind_status_idx" ON "awaiting_replies" USING btree ("companion_id","message_kind","status");