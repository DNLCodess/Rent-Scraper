import { describe, expect, it } from "vitest";
import { checkRequest } from "./request-guard";

const h = (o: Record<string, string>) => new Headers(o);
const JSON_H = { "content-type": "application/json", host: "app.example.com" };

describe("checkRequest", () => {
  it("blocks a cross-site POST", () => {
    expect(checkRequest("POST", "/api/listings/1", h({ ...JSON_H, "sec-fetch-site": "cross-site" }))).toEqual({
      status: 403, error: "Cross-site request blocked.",
    });
  });
  it("blocks same-site (sibling subdomain) POST", () => {
    expect(checkRequest("POST", "/api/x", h({ ...JSON_H, "sec-fetch-site": "same-site" }))?.status).toBe(403);
  });
  it("allows same-origin and none POST with JSON", () => {
    expect(checkRequest("POST", "/api/x", h({ ...JSON_H, "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(checkRequest("PUT", "/api/x", h({ ...JSON_H, "sec-fetch-site": "none" }))).toBeNull();
  });
  it("returns 415 for text/plain same-origin POST", () => {
    expect(
      checkRequest("POST", "/api/x", h({ "content-type": "text/plain", host: "a.com", "sec-fetch-site": "same-origin" })),
    ).toEqual({ status: 415, error: "Send JSON." });
  });
  it("falls back to Origin host when Sec-Fetch-Site is absent", () => {
    expect(checkRequest("DELETE", "/api/x", h({ ...JSON_H, origin: "https://app.example.com" }))).toBeNull();
    expect(checkRequest("DELETE", "/api/x", h({ ...JSON_H, origin: "https://evil.com" }))?.status).toBe(403);
    expect(checkRequest("DELETE", "/api/x", h({ ...JSON_H, origin: "not a url" }))?.status).toBe(403);
  });
  it("blocks when neither Sec-Fetch-Site nor Origin is present", () => {
    expect(checkRequest("POST", "/api/x", h(JSON_H))?.status).toBe(403);
  });
  it("allows GET, HEAD, OPTIONS cross-site", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(checkRequest(m, "/api/x", h({ "sec-fetch-site": "cross-site" }))).toBeNull();
    }
  });
  it("skips cron and webhook paths", () => {
    expect(checkRequest("POST", "/api/webhooks/apify", h({ "sec-fetch-site": "cross-site", "content-type": "text/plain" }))).toBeNull();
    expect(checkRequest("POST", "/api/cron/daily", h({}))).toBeNull();
  });
  it("ignores non-API paths", () => {
    expect(checkRequest("POST", "/inbox", h({ "sec-fetch-site": "cross-site" }))).toBeNull();
  });
});
