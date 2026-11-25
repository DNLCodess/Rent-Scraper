import { afterEach, describe, expect, it } from "vitest";
import { webhooksParam } from "./apify";

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
