CREATE TABLE "prompt_context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"message_id" uuid,
	"purpose" text NOT NULL,
	"context_json" jsonb NOT NULL,
	"selected_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"token_budget" integer NOT NULL,
	"context_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_context_snapshots" ADD CONSTRAINT "prompt_context_snapshots_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_context_snapshots" ADD CONSTRAINT "prompt_context_snapshots_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_context_snapshots_correlation_purpose_idx" ON "prompt_context_snapshots" USING btree ("correlation_id","purpose");--> statement-breakpoint
CREATE INDEX "prompt_context_snapshots_companion_created_idx" ON "prompt_context_snapshots" USING btree ("companion_id","created_at");