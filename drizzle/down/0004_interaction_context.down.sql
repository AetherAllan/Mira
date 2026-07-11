DROP TABLE IF EXISTS "conversation_working_memories";
DROP TABLE IF EXISTS "shared_knowledge";

-- Relationship JSON keys are backward-compatible and may contain progress
-- written after migration, so the test-only down migration intentionally keeps them.
