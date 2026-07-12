ALTER TABLE "llm_usage_logs" ADD COLUMN "generation_id" text;--> statement-breakpoint
ALTER TABLE "llm_usage_logs" ADD COLUMN "request_json" jsonb;--> statement-breakpoint
ALTER TABLE "llm_usage_logs" ADD COLUMN "response_json" jsonb;