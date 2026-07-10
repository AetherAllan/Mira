DROP TABLE "critic_reviews" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_status" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proactive_logs" DROP COLUMN "critic_blocked";