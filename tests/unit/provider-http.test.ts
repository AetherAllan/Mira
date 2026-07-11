import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, ProviderHttpError } from "@/world/providers/http";
import type { ProviderFetch } from "@/world/providers/types";

test("provider HTTP retries one 429/5xx response", async () => {
  for (const retryableStatus of [429, 503]) {
    let calls = 0;
    const fetcher: ProviderFetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: retryableStatus })
        : Response.json({ ok: true });
    };

    const body = await fetchJson("https://provider.test/data", {
      fetcher,
      retryDelayMs: 0,
    });
    assert.deepEqual(body, { ok: true });
    assert.equal(calls, 2);
  }
});

test("provider HTTP does not retry a client error", async () => {
  let calls = 0;
  const fetcher: ProviderFetch = async () => {
    calls += 1;
    return new Response("bad request", { status: 400 });
  };

  await assert.rejects(
    () => fetchJson("https://provider.test/data", { fetcher, retryDelayMs: 0 }),
    (error) => error instanceof ProviderHttpError && error.status === 400,
  );
  assert.equal(calls, 1);
});

test("provider HTTP attaches an aborting timeout signal", async () => {
  const fetcher: ProviderFetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });

  await assert.rejects(() => fetchJson("https://provider.test/slow", {
    fetcher,
    timeoutMs: 5,
  }));
});
