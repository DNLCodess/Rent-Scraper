import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearThumbnailCache, embedUrl, fetchThumbnail } from "./tiktok";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => clearThumbnailCache());

describe("fetchThumbnail", () => {
  it("returns thumbnail_url from a 200 JSON and queries oEmbed", async () => {
    const f = vi.fn((_u: string) => json({ thumbnail_url: "https://img/x.jpg" }));
    expect(await fetchThumbnail("https://www.tiktok.com/@a/video/1", f as never)).toBe("https://img/x.jpg");
    expect(f.mock.calls[0][0]).toBe(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent("https://www.tiktok.com/@a/video/1")}`,
    );
  });
  it("returns null on 404", async () => {
    const f = vi.fn(() => json({}, 404));
    expect(await fetchThumbnail("u1", f as never)).toBeNull();
  });
  it("returns null on invalid JSON", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("nope", { status: 200 })));
    expect(await fetchThumbnail("u2", f as never)).toBeNull();
  });
  it("returns null when fetch throws", async () => {
    const f = vi.fn(() => Promise.reject(new Error("net")));
    expect(await fetchThumbnail("u3", f as never)).toBeNull();
  });
  it("caches hits: one fetch for two calls", async () => {
    const f = vi.fn(() => json({ thumbnail_url: "t" }));
    await fetchThumbnail("u4", f as never);
    await fetchThumbnail("u4", f as never);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("caches misses too, but only for 5 minutes", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn(() => json({}, 404));
      await fetchThumbnail("u5", f as never);
      await fetchThumbnail("u5", f as never);
      expect(f).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5 * 60_000 + 1);
      await fetchThumbnail("u5", f as never);
      expect(f).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("embedUrl", () => {
  it("builds the embed URL", () => {
    expect(embedUrl("123")).toBe("https://www.tiktok.com/embed/v2/123");
  });
});
