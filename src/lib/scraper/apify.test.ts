import { afterEach, describe, expect, it, vi } from "vitest";
import { ApifyScraper, toRawVideo, webhooksParam } from "./apify";
import { ScraperError } from "./types";

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.APIFY_WEBHOOK_SECRET;
});

describe("webhooksParam", () => {
  it("is empty unless both APP_URL and the secret are set", () => {
    expect(webhooksParam()).toBe("");
    process.env.APP_URL = "https://app.example.com";
    expect(webhooksParam()).toBe("");
  });
  it("encodes a base64 JSON webhook for the four terminal events", () => {
    process.env.APP_URL = "https://app.example.com/";
    process.env.APIFY_WEBHOOK_SECRET = "a b";
    const p = webhooksParam();
    expect(p.startsWith("&webhooks=")).toBe(true);
    const hooks = JSON.parse(Buffer.from(decodeURIComponent(p.slice(10)), "base64").toString());
    expect(hooks[0].eventTypes).toEqual(["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"]);
    expect(hooks[0].requestUrl).toBe("https://app.example.com/api/webhooks/apify?secret=a%20b");
  });
});

describe("toRawVideo", () => {
  const base = { id: 1, authorMeta: { name: "a" } };
  it("prefers videoMeta.coverUrl, then originalCoverUrl, else null", () => {
    expect(toRawVideo({ ...base, videoMeta: { coverUrl: "c", originalCoverUrl: "o" } })?.coverUrl).toBe("c");
    expect(toRawVideo({ ...base, videoMeta: { originalCoverUrl: "o" } })?.coverUrl).toBe("o");
    expect(toRawVideo(base)?.coverUrl).toBeNull();
  });
  it("skips error items and items without an author", () => {
    expect(toRawVideo({ ...base, errorCode: "x" })).toBeNull();
    expect(toRawVideo({ id: 2 })).toBeNull();
  });
});

describe("ApifyScraper request time limit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives up on a hung request instead of waiting forever", async () => {
    // A fetch that never answers unless its signal aborts.
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
    );
    const scraper = new ApifyScraper("token", { timeoutMs: 20, retryBaseMs: 1 });
    const t0 = Date.now();
    const err = await scraper.status({ jobId: "run1", datasetId: "ds1" }).catch((e) => e);
    expect(err).toBeInstanceOf(ScraperError);
    expect((err as ScraperError).code).toBe("PROVIDER");
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
