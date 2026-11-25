import { describe, expect, it } from "vitest";
import { withoutListings } from "./inbox-view";
import type { InboxItem, InboxResponse } from "./types";

const now = new Date("2026-11-26T12:00:00Z");
const item = (id: string, firstSeen: string) => ({ id, first_seen_at: firstSeen }) as InboxItem;

const inbox: InboxResponse = {
  items: [item("a", "2026-11-26T08:00:00Z"), item("b", "2026-11-20T08:00:00Z"), item("c", "2026-11-26T09:00:00Z")],
  newToday: 2,
  matchCount: 3,
  hiddenCount: 4,
};

describe("withoutListings", () => {
  it("drops the listings and lowers both counts", () => {
    const out = withoutListings(inbox, ["a", "b"], now);
    expect(out.items.map((i) => i.id)).toEqual(["c"]);
    expect(out.matchCount).toBe(1);
    expect(out.newToday).toBe(1); // only "a" was new today
    expect(out.hiddenCount).toBe(4);
  });

  it("returns the same object when nothing matches", () => {
    expect(withoutListings(inbox, ["zzz"], now)).toBe(inbox);
  });

  it("never goes below zero", () => {
    const out = withoutListings({ ...inbox, matchCount: 0, newToday: 0 }, ["a", "c"], now);
    expect(out.matchCount).toBe(0);
    expect(out.newToday).toBe(0);
  });
});
