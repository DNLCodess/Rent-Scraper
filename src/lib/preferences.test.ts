import { beforeEach, describe, expect, it } from "vitest";
import { db, useTestDb } from "./db";
import {
  DEFAULT_PREFERENCES,
  blockAuthor,
  blockedSet,
  getPreferences,
  listBlocked,
  unblockAuthor,
  updatePreferences,
} from "./preferences";
import { InputError } from "./runs";

beforeEach(async () => {
  await useTestDb();
});

async function insertListing(id: string, author: string) {
  await (await db()).execute({
    sql: "INSERT INTO listings (id, run_id, tag, url, author, caption, updated_at) VALUES (?, 'r', 't', 'u', ?, 'c', 'now')",
    args: [id, author],
  });
}

describe("preferences", () => {
  it("returns defaults on a fresh db", async () => {
    expect(await getPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("persists a partial update", async () => {
    await updatePreferences({ budgetMax: 2_000_000 });
    const p = await getPreferences();
    expect(p.budgetMax).toBe(2_000_000);
    expect(p.powerMode).toBe("rank");
  });

  it("rejects min above max", async () => {
    await expect(updatePreferences({ budgetMin: 3e6, budgetMax: 2e6 })).rejects.toBeInstanceOf(InputError);
  });

  it("rejects min above the stored max", async () => {
    await updatePreferences({ budgetMax: 1e6 });
    await expect(updatePreferences({ budgetMin: 2e6 })).rejects.toBeInstanceOf(InputError);
  });

  it("rejects invalid values", async () => {
    await expect(updatePreferences({ beds: ["5"] as never })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ powerMode: "x" as never })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ nudgeDays: 0 })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ nudgeDays: 31 })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ nudgeDays: 2.5 })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ huntState: "x" as never })).rejects.toBeInstanceOf(InputError);
    await expect(updatePreferences({ budgetMax: -1 })).rejects.toBeInstanceOf(InputError);
  });

  it("normalises area names to the parser's canonical names", async () => {
    const p = await updatePreferences({ excludedAreas: ["ajah", "Nowhere Estate"] });
    expect(p.excludedAreas).toEqual(["Ajah", "Nowhere Estate"]);
    expect((await getPreferences()).excludedAreas).toEqual(["Ajah", "Nowhere Estate"]);
  });
});

describe("blocked agents", () => {
  it("blocks case-insensitively without the @", async () => {
    await blockAuthor("@LekkiLiving");
    expect((await blockedSet()).has("lekkiliving")).toBe(true);
  });

  it("counts posts hidden per blocked agent", async () => {
    await insertListing("1", "LekkiLiving");
    await insertListing("2", "lekkiliving");
    await insertListing("3", "other");
    await blockAuthor("@lekkiliving");
    const list = await listBlocked();
    expect(list).toHaveLength(1);
    expect(list[0].handle).toBe("lekkiliving");
    expect(list[0].hiddenCount).toBe(2);
  });

  it("unblocks and rejects empty handles", async () => {
    await blockAuthor("a");
    await unblockAuthor("@A");
    expect((await listBlocked())).toEqual([]);
    await expect(blockAuthor("  @ ")).rejects.toBeInstanceOf(InputError);
  });
});
