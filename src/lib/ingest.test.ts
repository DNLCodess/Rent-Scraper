import { beforeEach, describe, expect, it } from "vitest";
import { db, useTestDb } from "./db";
import { ingest } from "./runs";
import type { RawVideo } from "./scraper/types";

const video = (coverUrl: string | null): RawVideo => ({
  id: "v1", url: "https://www.tiktok.com/@a/video/v1", author: "a", caption: "2 bedroom Yaba 1.5m per annum",
  postedAt: null, likes: 1, bio: null, coverUrl,
});
const cover = async () =>
  (await (await db()).execute("SELECT cover_url, status FROM listings WHERE id = 'v1'")).rows[0];

beforeEach(async () => {
  await useTestDb();
});

describe("ingest cover_url", () => {
  it("stores cover_url, keeps it on a null re-ingest, refreshes it on a new value, never touches status", async () => {
    await ingest("r", "t", [video("https://img/1.jpg")]);
    expect((await cover()).cover_url).toBe("https://img/1.jpg");
    await (await db()).execute("UPDATE listings SET status = 'shortlisted' WHERE id = 'v1'");
    await ingest("r", "t", [video(null)]);
    expect((await cover()).cover_url).toBe("https://img/1.jpg");
    await ingest("r", "t", [video("https://img/2.jpg")]);
    const row = await cover();
    expect(row.cover_url).toBe("https://img/2.jpg");
    expect(row.status).toBe("shortlisted");
  });
});
