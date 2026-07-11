CREATE TABLE "external_information" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"title" text NOT NULL,
	"factual_summary" text NOT NULL,
	"category" text NOT NULL,
	"facts_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beijing_relevance" real DEFAULT 0 NOT NULL,
	"personal_relevance" real DEFAULT 0 NOT NULL,
	"reliability" real DEFAULT 0.5 NOT NULL,
	"novelty" real DEFAULT 0.5 NOT NULL,
	"duplicate_group_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"expires_at" timestamp with time zone,
	"embedding" vector(1024),
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companion_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"cache_key" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_information" ADD CONSTRAINT "external_information_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cache" ADD CONSTRAINT "provider_cache_companion_id_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_information_companion_idempotency_idx" ON "external_information" USING btree ("companion_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "external_information_companion_status_fetched_idx" ON "external_information" USING btree ("companion_id","status","fetched_at");--> statement-breakpoint
CREATE INDEX "external_information_companion_category_published_idx" ON "external_information" USING btree ("companion_id","category","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cache_companion_provider_key_idx" ON "provider_cache" USING btree ("companion_id","provider","cache_key");--> statement-breakpoint
CREATE INDEX "provider_cache_expires_idx" ON "provider_cache" USING btree ("expires_at");