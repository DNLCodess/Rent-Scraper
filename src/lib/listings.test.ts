import { beforeEach, describe, expect, it } from "vitest";
import { db, useTestDb } from "./db";
import { addNote, applyAction, batchAction, dismissWhere, getListing, reopenHunt } from "./listings";
import { getPreferences } from "./preferences";
import { InputError } from "./runs";

async function insert(id: string, p: Record<string, unknown> = {}) {
  const row = {
    id,
    run_id: "r",
    tag: "t",
    url: "u",
    author: "agent",
    caption: "c",
    area: "Yaba",
    status: "new",
    archived: 0,
    first_seen_at: "2026-11-24T10:00:00Z",
    updated_at: "now",
    ...p,
  };
  const keys = Object.keys(row);
  await (await db()).execute({
    sql: `INSERT INTO listings (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    args: Object.values(row) as never[],
  });
}
const statusOf = async (id: string) => (await getListing(id))!.status;

beforeEach(async () => {
  await useTestDb();
});

describe("applyAction", () => {
  it("walks the full path to got_it", async () => {
    await insert("a");
    expect((await applyAction("a", { type: "shortlist" })).status).toBe("shortlisted");
    expect((await applyAction("a", { type: "messaged" })).status).toBe("messaged");
    const booked = await applyAction("a", { type: "book_inspection", at: "2026-11-28T10:00:00+01:00" });
    expect(booked.status).toBe("inspection_booked");
    expect(booked.inspection_at).toBe("2026-11-28T10:00:00+01:00");
    const insp = await applyAction("a", {
      type: "log_inspection",
      powerConfirmed: "24h",
      note: "Clean flat",
      next: "negotiating",
    });
    expect(insp.status).toBe("negotiating");
    expect(insp.power_confirmed).toBe("24h");
    expect(insp.notes.map((n) => n.body)).toEqual(["Clean flat"]);
    const off = await applyAction("a", { type: "offer", offer: 1_800_000, counter: 2_000_000 });
    expect(off.status).toBe("negotiating");
    expect(off.offer_ngn).toBe(1_800_000);
    expect(off.counter_ngn).toBe(2_000_000);
    const got = await applyAction("a", { type: "got_it" });
    expect(got.status).toBe("got_it");
    expect((await getPreferences()).huntState).toBe("done");
  });

  it("rejects skipping stages", async () => {
    await insert("a");
    await expect(
      applyAction("a", { type: "log_inspection", powerConfirmed: "x", next: "negotiating" }),
    ).rejects.toBeInstanceOf(InputError);
    await expect(applyAction("a", { type: "got_it" })).rejects.toBeInstanceOf(InputError);
    await expect(applyAction("a", { type: "replied" })).rejects.toBeInstanceOf(InputError);
    await expect(applyAction("a", { type: "drop", reason: "other" })).rejects.toBeInstanceOf(InputError);
    await expect(applyAction("nope", { type: "dismiss" })).rejects.toThrow("Listing not found");
  });

  it("requires valid drop reasons", async () => {
    await insert("a", { status: "shortlisted" });
    await expect(applyAction("a", { type: "drop", reason: "bogus" as never })).rejects.toBeInstanceOf(InputError);
    const d = await applyAction("a", { type: "drop", reason: "taken" });
    expect(d.status).toBe("dropped");
    expect(d.drop_reason).toBe("taken");
  });

  it("log_inspection can drop with a reason", async () => {
    await insert("a", { status: "inspection_booked" });
    await expect(
      applyAction("a", { type: "log_inspection", powerConfirmed: "x", next: "dropped" }),
    ).rejects.toBeInstanceOf(InputError);
    const d = await applyAction("a", { type: "log_inspection", powerConfirmed: "x", next: "dropped", dropReason: "bad_area" });
    expect(d.status).toBe("dropped");
    expect(d.drop_reason).toBe("bad_area");
  });

  it("undo restores previous status", async () => {
    await insert("a");
    await applyAction("a", { type: "shortlist" });
    await applyAction("a", { type: "messaged" });
    expect((await applyAction("a", { type: "undo" })).status).toBe("shortlisted");
    await expect(applyAction("a", { type: "undo" })).rejects.toBeInstanceOf(InputError);
  });

  it("replied stops nudge eligibility", async () => {
    await insert("a", { status: "messaged" });
    const d = await applyAction("a", { type: "replied" }, new Date("2026-11-25T09:00:00Z"));
    expect(d.replied_at).toBe("2026-11-25T09:00:00.000Z");
    expect(d.status).toBe("messaged");
  });

  it("got_it archives the other active tracker listings; reopenHunt restores them", async () => {
    await insert("win", { status: "negotiating" });
    await insert("s", { status: "shortlisted" });
    await insert("m", { status: "messaged" });
    await insert("n", { status: "new" });
    await insert("d", { status: "dropped" });
    await applyAction("win", { type: "got_it" });
    const arch = async (id: string) =>
      Number((await (await db()).execute({ sql: "SELECT archived FROM listings WHERE id=?", args: [id] })).rows[0].archived);
    expect([await arch("win"), await arch("s"), await arch("m"), await arch("n"), await arch("d")]).toEqual([0, 1, 1, 0, 0]);
    await reopenHunt();
    expect([await arch("s"), await arch("m")]).toEqual([0, 0]);
    expect(await statusOf("s")).toBe("shortlisted");
    expect(await statusOf("m")).toBe("messaged");
    expect((await getPreferences()).huntState).toBe("active");
  });
});

describe("batch actions", () => {
  it("only touches new listings and reports the count", async () => {
    await insert("a");
    await insert("b", { status: "shortlisted" });
    await insert("c");
    expect(await batchAction(["a", "b", "c"], "dismiss")).toEqual({ changed: 2 });
    expect(await statusOf("a")).toBe("dismissed");
    expect(await statusOf("b")).toBe("shortlisted");
    expect(await batchAction(["a", "c"], "shortlist")).toEqual({ changed: 0 });
    expect(await batchAction([], "dismiss")).toEqual({ changed: 0 });
  });

  it("dismissWhere area uses lineage", async () => {
    await insert("l1", { area: "Lekki Phase 1" });
    await insert("l2", { area: "Ibeju-Lekki" });
    await insert("y", { area: "Yaba" });
    expect(await dismissWhere({ area: "lekki" })).toEqual({ changed: 1 });
    expect(await statusOf("l1")).toBe("dismissed");
    expect(await statusOf("l2")).toBe("new");
    expect(await statusOf("y")).toBe("new");
  });

  it("dismissWhere author ignores case and @", async () => {
    await insert("a", { author: "Agent_X" });
    await insert("b", { author: "other" });
    await insert("c", { author: "agent_x", status: "shortlisted" });
    expect(await dismissWhere({ author: "@AGENT_x" })).toEqual({ changed: 1 });
    expect(await statusOf("b")).toBe("new");
    expect(await statusOf("c")).toBe("shortlisted");
  });
});

describe("notes and detail", () => {
  it("adds notes and rejects empty", async () => {
    await insert("a", { caption: "2 bedroom flat in Yaba N1.5m per year" });
    const n = await addNote("a", "  call back  ");
    expect(n.body).toBe("call back");
    await expect(addNote("a", "   ")).rejects.toBeInstanceOf(InputError);
    await expect(addNote("zzz", "x")).rejects.toThrow("Listing not found");
    const d = await getListing("a");
    expect(d!.notes).toHaveLength(1);
    expect(d!.highlights.length).toBeGreaterThan(0);
    expect(await getListing("zzz")).toBeNull();
  });
});
