import { beforeEach, describe, expect, it } from "vitest";
import { db, useTestDb } from "./db";
import { updatePreferences } from "./preferences";
import { getTracker } from "./tracker";

async function insert(id: string, p: Record<string, unknown> = {}) {
  const row = {
    id, run_id: "r", tag: "t", url: "u", author: "agent", caption: "c", area: "Yaba",
    status: "new", archived: 0, first_seen_at: "2026-11-20T10:00:00Z", updated_at: "now", ...p,
  };
  const keys = Object.keys(row);
  await (await db()).execute({
    sql: `INSERT INTO listings (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    args: Object.values(row) as never[],
  });
}
const NOW = new Date("2026-11-25T09:00:00Z");
const ids = (l: Array<{ id: string }>) => l.map((x) => x.id);

beforeEach(async () => {
  await useTestDb();
});

describe("getTracker inspections", () => {
  it("includes inspections within 7 days, ascending, and excludes later ones", async () => {
    await insert("late", { status: "inspection_booked", inspection_at: "2026-11-29T10:00:00+01:00" });
    await insert("soon", { status: "inspection_booked", inspection_at: "2026-11-26T10:00:00+01:00" });
    await insert("far", { status: "inspection_booked", inspection_at: "2026-12-03T10:00:00+01:00" });
    const t = await getTracker(NOW);
    expect(ids(t.thisWeek.inspections)).toEqual(["soon", "late"]);
    expect(ids(t.stages.inspection_booked).sort()).toEqual(["far", "late", "soon"]);
  });
  it("still shows an inspection earlier today in Lagos", async () => {
    await insert("early", { status: "inspection_booked", inspection_at: "2026-11-25T00:30:00+01:00" });
    expect(ids((await getTracker(NOW)).thisWeek.inspections)).toEqual(["early"]);
  });
  it("uses the Lagos day at the window edges, not UTC", async () => {
    // now = 00:30 WAT on the 26th (23:30Z on the 25th)
    const now = new Date("2026-11-25T23:30:00Z");
    await insert("yesterday", { status: "inspection_booked", inspection_at: "2026-11-25T23:30:00+01:00" });
    await insert("today", { status: "inspection_booked", inspection_at: "2026-11-26T00:10:00+01:00" });
    await insert("edge-in", { status: "inspection_booked", inspection_at: "2026-12-02T23:30:00+01:00" });
    await insert("edge-out", { status: "inspection_booked", inspection_at: "2026-12-03T00:00:00+01:00" });
    expect(ids((await getTracker(now)).thisWeek.inspections)).toEqual(["today", "edge-in"]);
  });
  it("skips booked listings with no inspection time", async () => {
    await insert("x", { status: "inspection_booked", inspection_at: null });
    expect((await getTracker(NOW)).thisWeek.inspections).toEqual([]);
  });
});

describe("getTracker nudges", () => {
  it("nudges messaged listings older than nudgeDays with no reply", async () => {
    await updatePreferences({ nudgeDays: 3 });
    await insert("old", { status: "messaged", status_changed_at: "2026-11-21T08:00:00Z" });
    await insert("fresh", { status: "messaged", status_changed_at: "2026-11-23T08:00:00Z" });
    await insert("replied", { status: "messaged", status_changed_at: "2026-11-20T08:00:00Z", replied_at: "2026-11-21T08:00:00Z" });
    await insert("nodate", { status: "messaged", status_changed_at: null });
    expect(ids((await getTracker(NOW)).thisWeek.nudges)).toEqual(["old"]);
  });
});

describe("getTracker stages", () => {
  it("counts the five stages, excludes archived and other statuses, orders newest first", async () => {
    await insert("a", { status: "shortlisted", status_changed_at: "2026-11-20T00:00:00Z" });
    await insert("b", { status: "shortlisted", status_changed_at: "2026-11-22T00:00:00Z" });
    await insert("c", { status: "messaged", status_changed_at: "2026-11-22T00:00:00Z" });
    await insert("d", { status: "negotiating", status_changed_at: "2026-11-22T00:00:00Z" });
    await insert("e", { status: "inspected", status_changed_at: "2026-11-22T00:00:00Z" });
    await insert("f", { status: "shortlisted", archived: 1 });
    await insert("g", { status: "new" });
    await insert("h", { status: "dropped" });
    const t = await getTracker(NOW);
    expect(t.activeCount).toBe(5);
    expect(ids(t.stages.shortlisted)).toEqual(["b", "a"]);
    expect(t.stages.inspection_booked).toEqual([]);
    expect(Object.keys(t.stages).sort()).toEqual(["inspected", "inspection_booked", "messaged", "negotiating", "shortlisted"]);
  });
});
