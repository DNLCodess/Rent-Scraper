import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, useTestDb } from "./db";
import { updatePreferences } from "./preferences";
import { advanceRun, advanceRunByJobId, InputError } from "./runs";
import { setSetting } from "./settings";
import { createSearch, deleteSearch, listSearches, runDailySearches, runSavedSearch, updateSearch } from "./searches";

process.env.SCRAPER_PROVIDER = "mock";

beforeEach(async () => {
  await useTestDb();
});
afterEach(() => vi.useRealTimers());

const count = async (sql: string) => Number((await (await db()).execute(sql)).rows[0].n);

describe("saved searches", () => {
  it("round-trips create / list / update / delete", async () => {
    const s = await createSearch({ terms: ["#lekki"], count: 20, daily: true });
    expect(s).toMatchObject({ terms: ["#lekki"], count: 20, daily: true });
    // seeded default is absent because a search already exists
    expect((await listSearches()).map((x) => x.id)).toEqual([s.id]);
    const u = await updateSearch(s.id, { count: 10, daily: false });
    expect(u).toMatchObject({ count: 10, daily: false, terms: ["#lekki"] });
    await deleteSearch(s.id);
    await setSetting("default_tags", "[]");
    expect(await listSearches()).toEqual([]);
  });
  it("rejects count outside 1-100 and empty terms", async () => {
    await expect(createSearch({ terms: ["a"], count: 0, daily: false })).rejects.toBeInstanceOf(InputError);
    await expect(createSearch({ terms: ["a"], count: 101, daily: false })).rejects.toBeInstanceOf(InputError);
    await expect(createSearch({ terms: [], count: 5, daily: false })).rejects.toBeInstanceOf(InputError);
    const s = await createSearch({ terms: ["a"], count: 5, daily: false });
    await expect(updateSearch(s.id, { count: 500 })).rejects.toBeInstanceOf(InputError);
  });
  it("seeds one search from legacy default_tags when none exist", async () => {
    await setSetting("default_tags", JSON.stringify(["lagosapartments"]));
    const l = await listSearches();
    expect(l).toHaveLength(1);
    expect(l[0].terms).toEqual(["#lagosapartments"]);
    expect(await listSearches()).toHaveLength(1);
  });
});

describe("runs from searches", () => {
  it("runDailySearches starts one scheduled run per daily search", async () => {
    await createSearch({ terms: ["a"], count: 3, daily: true });
    await createSearch({ terms: ["b"], count: 3, daily: false });
    await createSearch({ terms: ["c"], count: 3, daily: true });
    const { started } = await runDailySearches();
    expect(started).toHaveLength(2);
    expect(await count("SELECT COUNT(*) AS n FROM runs WHERE source = 'scheduled'")).toBe(2);
  });
  it("does nothing when the hunt is done", async () => {
    await createSearch({ terms: ["a"], count: 3, daily: true });
    await updatePreferences({ huntState: "done" });
    expect(await runDailySearches()).toEqual({ started: [] });
    expect(await count("SELECT COUNT(*) AS n FROM runs")).toBe(0);
  });
  it("runSavedSearch starts a manual run", async () => {
    const s = await createSearch({ terms: ["a"], count: 3, daily: false });
    const run = await runSavedSearch(s.id);
    expect(run.tags).toEqual(["#a"]);
    await expect(runSavedSearch("nope")).rejects.toBeInstanceOf(InputError);
  });
});

describe("advanceRunByJobId", () => {
  it("returns null for an unknown job", async () => {
    expect(await advanceRunByJobId("nope")).toBeNull();
  });
  it("is idempotent: twice after finish leaves the same listings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
    const s = await createSearch({ terms: ["a"], count: 5, daily: false });
    const run = await runSavedSearch(s.id);
    const jobs = JSON.parse(
      String((await (await db()).execute({ sql: "SELECT jobs FROM runs WHERE id = ?", args: [run.id] })).rows[0].jobs),
    );
    vi.setSystemTime(new Date("2026-11-25T10:00:20Z"));
    const a = await advanceRunByJobId(jobs[0].jobId);
    const n1 = await count("SELECT COUNT(*) AS n FROM listings");
    const b = await advanceRunByJobId(jobs[0].jobId);
    expect(a?.status).toBe("done");
    expect(b?.status).toBe("done");
    expect(n1).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) AS n FROM listings")).toBe(n1);
  });
  it("keeps status and tracker fields when a later run re-finds a listing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
    const s = await createSearch({ terms: ["a"], count: 5, daily: false });
    const r1 = await runSavedSearch(s.id);
    vi.setSystemTime(new Date("2026-11-25T10:00:20Z"));
    await advanceRun(r1.id);
    const c = await db();
    const ids = (await c.execute("SELECT id FROM listings ORDER BY id")).rows.map((r) => r.id as string);
    await c.execute({ sql: "UPDATE listings SET status = 'dismissed', drop_reason = 'too far' WHERE id = ?", args: [ids[0]] });
    await c.execute({
      sql: "UPDATE listings SET status = 'negotiating', offer_ngn = 900000, counter_ngn = 1100000, archived = 1 WHERE id = ?",
      args: [ids[1]],
    });
    const before = (await c.execute("SELECT first_seen_at FROM listings WHERE id = ?")).rows;
    void before;
    const seen = (await c.execute({ sql: "SELECT first_seen_at FROM listings WHERE id = ?", args: [ids[0]] })).rows[0].first_seen_at;

    vi.setSystemTime(new Date("2026-11-26T10:00:00Z"));
    const r2 = await runSavedSearch(s.id);
    vi.setSystemTime(new Date("2026-11-26T10:00:20Z"));
    await advanceRun(r2.id);

    const row = async (id: string) => (await c.execute({ sql: "SELECT * FROM listings WHERE id = ?", args: [id] })).rows[0];
    const d = await row(ids[0]);
    expect(d.status).toBe("dismissed");
    expect(d.drop_reason).toBe("too far");
    expect(d.first_seen_at).toBe(seen);
    const n = await row(ids[1]);
    expect(n).toMatchObject({ status: "negotiating", offer_ngn: 900000, counter_ngn: 1100000, archived: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM listings")).toBe(ids.length);
  });
});

describe("cron and webhook routes", () => {
  it("cron requires the bearer secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import("@/app/api/cron/daily/route");
    expect((await GET(new Request("http://x/api/cron/daily"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const ok = await GET(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer s3cret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("started");
  });
  it("cron is closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/daily/route");
    expect((await GET(new Request("http://x", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
  });
  it("webhook rejects a wrong secret and answers 200 on a known one", async () => {
    process.env.APIFY_WEBHOOK_SECRET = "hook";
    const { POST } = await import("@/app/api/webhooks/apify/route");
    const body = JSON.stringify({ resource: { id: "unknown" } });
    expect((await POST(new Request("http://x/api/webhooks/apify?secret=bad", { method: "POST", body }))).status).toBe(401);
    expect((await POST(new Request("http://x/api/webhooks/apify", { method: "POST", body }))).status).toBe(401);
    expect((await POST(new Request("http://x/api/webhooks/apify?secret=hook", { method: "POST", body }))).status).toBe(200);
    expect((await POST(new Request("http://x/api/webhooks/apify?secret=hook", { method: "POST", body: "garbage" }))).status).toBe(200);
  });
});
