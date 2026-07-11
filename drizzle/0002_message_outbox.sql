CREATE TABLE "message_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"chat_id" text NOT NULL,
	"bubble_index" integer NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"telegram_message_id" integer,
	"last_error" text,
	"last_response_json" jsonb,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proactive_logs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_outbox_idempotency_idx" ON "message_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_outbox_message_bubble_idx" ON "message_outbox" USING btree ("message_id","bubble_index");--> statement-breakpoint
CREATE INDEX "message_outbox_status_available_idx" ON "message_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "message_outbox_message_idx" ON "message_outbox" USING btree ("message_id","bubble_index");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_reply_to_message_idx" ON "messages" USING btree ("reply_to_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proactive_logs_idempotency_idx" ON "proactive_logs" USING btree ("idempotency_key");