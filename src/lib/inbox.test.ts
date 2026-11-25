import { beforeEach, describe, expect, it } from "vitest";
import { db, useTestDb } from "./db";
import { getHidden, getInbox } from "./inbox";
import { blockAuthor, updatePreferences } from "./preferences";

const now = new Date("2026-11-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
let n = 0;

async function insertListing(p: Record<string, unknown> = {}) {
  const row = {
    id: `v${++n}`,
    run_id: "r",
    tag: "t",
    url: "u",
    author: "agent",
    caption: "c",
    area: "Yaba",
    price_ngn: 1_500_000,
    price_period: "year",
    bedrooms: 2,
    status: "new",
    archived: 0,
    first_seen_at: hoursAgo(1),
    posted_at: hoursAgo(2),
    updated_at: "now",
    ...p,
  };
  const keys = Object.keys(row);
  await (await db()).execute({
    sql: `INSERT INTO listings (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    args: Object.values(row) as never[],
  });
  return row.id;
}

beforeEach(async () => {
  await useTestDb();
  n = 0;
  await updatePreferences({ budgetMax: 2e6, beds: ["1", "2"], preferredAreas: ["Yaba"], excludedAreas: ["Lekki"] });
});

describe("getInbox", () => {
  it("excludes dismissed, archived and hidden; check-manually last", async () => {
    const good = await insertListing();
    const manual = await insertListing({ bedrooms: null, area: "Yaba", first_seen_at: hoursAgo(0.1) });
    await insertListing({ status: "dismissed" });
    await insertListing({ archived: 1 });
    await insertListing({ area: "Lekki Phase 1" });
    const r = await getInbox(now);
    expect(r.items.map((i) => i.id)).toEqual([good, manual]);
    expect(r.items[0].seen_before).toBe(false);
    expect(r.items[1].checkManually).toBe(true);
  });

  it("strongMatch on at most 3 items", async () => {
    for (let i = 0; i < 5; i++) await insertListing({ first_seen_at: hoursAgo(1 + i) });
    const r = await getInbox(now);
    expect(r.items.filter((i) => i.strongMatch)).toHaveLength(3);
    expect(r.items.slice(0, 3).every((i) => i.strongMatch)).toBe(true);
  });

  it("check-manually items are never strongMatch", async () => {
    await insertListing({ bedrooms: null });
    expect((await getInbox(now)).items[0].strongMatch).toBe(false);
  });

  it("newToday counts first_seen_at within 24h", async () => {
    await insertListing({ first_seen_at: hoursAgo(2) });
    await insertListing({ first_seen_at: hoursAgo(23) });
    await insertListing({ first_seen_at: hoursAgo(30) });
    expect((await getInbox(now)).newToday).toBe(2);
  });

  it("hiddenCount + matchCount equals new non-archived", async () => {
    await insertListing();
    await insertListing();
    await insertListing({ area: "Lekki" });
    await insertListing({ price_ngn: 9e6 });
    await insertListing({ author: "bad" });
    await insertListing({ status: "shortlisted" });
    await insertListing({ archived: 1 });
    await blockAuthor("bad");
    const r = await getInbox(now);
    expect(r.matchCount).toBe(2);
    expect(r.hiddenCount).toBe(3);
    expect(r.matchCount + r.hiddenCount).toBe(5);
  });
});

describe("getHidden", () => {
  it("returns hidden items with reason", async () => {
    await insertListing();
    const id = await insertListing({ area: "Lekki" });
    const h = await getHidden(now);
    expect(h).toHaveLength(1);
    expect(h[0].item.id).toBe(id);
    expect(h[0].reason).toBe("excluded_area");
  });
});
