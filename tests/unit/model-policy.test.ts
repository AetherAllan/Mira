import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  isFreeModel,
  requireFreeModel,
  resolveFreeChatModel,
} from "@/llm/models";

test("all built-in models are explicit free variants", () => {
  assert.equal(DEFAULT_CHAT_MODEL.endsWith(":free"), true);
  assert.equal(DEFAULT_EMBEDDING_MODEL.endsWith(":free"), true);
});

test("paid or ambiguous model ids cannot pass validation", () => {
  assert.equal(isFreeModel("openai/gpt-4.1-mini"), false);
  assert.throws(
    () => requireFreeModel("openai/gpt-4.1-mini"),
    /Model must end with :free/,
  );
});

test("runtime falls back to the free default for stale config", () => {
  assert.equal(resolveFreeChatModel("openai/gpt-4.1-mini"), DEFAULT_CHAT_MODEL);
  assert.equal(
    resolveFreeChatModel(" nvidia/nemotron-3-super-120b-a12b:free "),
    DEFAULT_CHAT_MODEL,
  );
});
