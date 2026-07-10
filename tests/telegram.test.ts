import assert from "node:assert/strict";
import test from "node:test";
import { parseTelegramTextMessage } from "@/telegram/webhook";

test("accepts a private Telegram text message", () => {
  const parsed = parseTelegramTextMessage({
    update_id: 1,
    message: {
      message_id: 7,
      text: " hello ",
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "A" },
    },
  });

  assert.equal(parsed?.text, "hello");
  assert.equal(parsed?.chatId, "42");
});

test("ignores group Telegram messages", () => {
  const parsed = parseTelegramTextMessage({
    update_id: 2,
    message: {
      message_id: 7,
      text: "hello",
      chat: { id: -100, type: "group" },
      from: { id: 42 },
    },
  });

  assert.equal(parsed, null);
});
