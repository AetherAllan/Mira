import assert from "node:assert/strict";
import test from "node:test";
import { GDELT_ARTICLE_RESPONSE } from "@/tests/fixtures/provider-responses";
import { GdeltProvider } from "@/world/providers/gdelt";
import type { ProviderFetch } from "@/world/providers/types";

test("GDELT requests article JSON and returns canonical source facts", async () => {
  let requestedUrl = "";
  const fetcher: ProviderFetch = async (input) => {
    requestedUrl = String(input);
    return Response.json(GDELT_ARTICLE_RESPONSE);
  };
  const provider = new GdeltProvider({ fetcher });

  const articles = await provider.searchArticles({
    query: "北京 降雨",
    timespan: "12h",
    maxRecords: 20,
  });

  const request = new URL(requestedUrl);
  assert.equal(request.searchParams.get("mode"), "artlist");
  assert.equal(request.searchParams.get("format"), "json");
  assert.equal(request.searchParams.get("maxrecords"), "20");
  assert.deepEqual(articles[0], {
    provider: "gdelt",
    sourceUrl: "https://example.cn/beijing-rain",
    title: "北京发布降雨提示",
    sourceDomain: "example.cn",
    publishedAt: "2026-07-11T01:00:00.000Z",
    language: "Chinese",
    sourceCountry: "China",
    imageUrl: "https://example.cn/rain.jpg",
  });
});
