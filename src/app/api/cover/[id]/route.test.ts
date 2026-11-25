import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, useTestDb } from "@/lib/db";
import { clearThumbnailCache } from "@/lib/tiktok";
import { GET } from "./route";

async function insert(id: string, coverUrl: string | null) {
  await (await db()).execute({
    sql: `INSERT INTO listings (id, run_id, tag, url, author, caption, updated_at, cover_url)
          VALUES (?, 'r', 't', ?, 'a', 'c', 'now', ?)`,
    args: [id, `https://www.tiktok.com/@a/video/${id}`, coverUrl],
  });
}
const call = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) } as never);

beforeEach(async () => {
  await useTestDb();
  clearThumbnailCache();
  vi.unstubAllGlobals();
});

describe("GET /api/cover/[id]", () => {
  it("redirects to the stored cover_url without calling oEmbed", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await insert("1", "https://img/stored.jpg");
    const res = await call("1");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://img/stored.jpg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=1800");
    expect(f).not.toHaveBeenCalled();
  });
  it("falls back to oEmbed when no cover_url is stored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ thumbnail_url: "https://img/oembed.jpg" })));
    await insert("2", null);
    const res = await call("2");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://img/oembed.jpg");
  });
  it("404s for unknown listings and when nothing is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 404 })));
    await insert("3", null);
    expect((await call("3")).status).toBe(404);
    expect((await call("nope")).status).toBe(404);
  });
});
