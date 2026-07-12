import assert from "node:assert/strict";
import test from "node:test";
import { runCron } from "@/app/api/cron/run";
import { parseTelegramTextMessage } from "@/telegram/webhook";

test("cron helper authenticates before running a task", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    let calls = 0;
    const task = async () => ({ count: ++calls });
    const denied = await runCron(new Request("https://mira.test/cron"), "Test", task);
    assert.equal(denied.status, 401);
    assert.equal(calls, 0);

    const accepted = await runCron(
      new Request("https://mira.test/cron", {
        headers: { authorization: "Bearer test-secret" },
      }),
      "Test",
      task,
    );
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { ok: true, count: 1 });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

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
