ALTER TABLE "llm_usage_logs" DROP COLUMN IF EXISTS "generation_id";
ALTER TABLE "llm_usage_logs" DROP COLUMN IF EXISTS "request_json";
ALTER TABLE "llm_usage_logs" DROP COLUMN IF EXISTS "response_json";
