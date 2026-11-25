import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "./preferences";
import { evaluate, type RuleInput } from "./rules";

const now = new Date("2026-11-25T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const base: RuleInput = {
  author: "agent1",
  area: "Yaba",
  price_ngn: 1_500_000,
  price_period: "year",
  bedrooms: 2,
  power_level: "unknown",
  posted_at: daysAgo(1),
  first_seen_at: daysAgo(0.5),
};
const prefs: Preferences = {
  ...DEFAULT_PREFERENCES,
  budgetMax: 2e6,
  beds: ["1", "2"],
  excludedAreas: ["Lekki"],
  preferredAreas: ["Yaba"],
};
const ev = (l: Partial<RuleInput>, p: Partial<Preferences> = {}, blocked = new Set<string>()) =>
  evaluate({ ...base, ...l }, { ...prefs, ...p }, blocked, now);

describe("hiddenBy", () => {
  it.each([
    ["base", {}, null],
    ["excluded area via lineage", { area: "Lekki Phase 1" }, "excluded_area"],
    ["Ibeju-Lekki is not Lekki", { area: "Ibeju-Lekki" }, null],
    ["over budget yearly", { price_ngn: 2_500_000 }, "over_budget"],
    ["150k/month within", { price_ngn: 150_000, price_period: "month" }, null],
    ["200k/month over", { price_ngn: 200_000, price_period: "month" }, "over_budget"],
    ["shortlet", { price_ngn: 85_000, price_period: "night" }, "shortlet"],
    ["3 beds", { bedrooms: 3 }, "bedrooms"],
    ["bedrooms null", { bedrooms: null }, null],
    ["price null", { price_ngn: null, price_period: null }, null],
    ["area null", { area: null }, null],
    ["city area", { area: "Lagos" }, null],
  ] as const)("%s", (_n, l, expected) => {
    expect(ev(l as Partial<RuleInput>).hiddenBy).toBe(expected);
  });

  it("blocked author", () => {
    expect(ev({ author: "Agent1" }, {}, new Set(["agent1"])).hiddenBy).toBe("blocked_author");
  });
  it("under budget", () => {
    expect(ev({ price_ngn: 500_000 }, { budgetMin: 1e6 }).hiddenBy).toBe("under_budget");
  });
  it("4+ beds maps from 5", () => {
    expect(ev({ bedrooms: 5 }, { beds: ["4+"] }).hiddenBy).toBeNull();
  });
  it("power require hides unknown power", () => {
    expect(ev({}, { powerMode: "require" }).hiddenBy).toBe("power_required");
    expect(ev({ power_level: "mentioned" }, { powerMode: "require" }).hiddenBy).toBeNull();
  });
  it("first rule in order wins", () => {
    expect(ev({ area: "Lekki", bedrooms: 3 }).hiddenBy).toBe("excluded_area");
  });

  it("never hides on unknown fields", () => {
    const nulls = [true, false];
    for (const p of nulls) for (const a of nulls) for (const b of nulls) {
      for (const powerMode of ["ignore", "rank"] as const) {
        const l: Partial<RuleInput> = {};
        if (p) Object.assign(l, { price_ngn: null, price_period: null });
        if (a) l.area = null;
        if (b) l.bedrooms = null;
        expect(ev(l, { powerMode }).hiddenBy).toBeNull();
      }
    }
  });
});

describe("checkManually", () => {
  it("false for base", () => expect(ev({}).checkManually).toBe(false));
  it.each([
    [{ price_ngn: null, price_period: null }],
    [{ bedrooms: null }],
    [{ area: null }],
    [{ area: "Lagos" }],
  ])("true for %j", (l) => expect(ev(l).checkManually).toBe(true));
});

describe("probablyTaken", () => {
  it("22 days posted", () => expect(ev({ posted_at: daysAgo(22) }).probablyTaken).toBe(true));
  it("20 days posted", () => expect(ev({ posted_at: daysAgo(20) }).probablyTaken).toBe(false));
  it("falls back to first_seen_at", () =>
    expect(ev({ posted_at: null, first_seen_at: daysAgo(22) }).probablyTaken).toBe(true));
});

describe("score", () => {
  it("preferred area ranks higher", () => {
    expect(ev({}).score).toBeGreaterThan(ev({ area: "Surulere" }).score);
  });
  it("preferred area matches via lineage", () => {
    expect(ev({ area: "Sabo Yaba" }, { preferredAreas: ["Yaba"] }).score).toBeGreaterThanOrEqual(0);
  });
  it("ignore mode: power does not change score", () => {
    const a = ev({ power_level: "strong" }, { powerMode: "ignore" }).score;
    const b = ev({ power_level: "unknown" }, { powerMode: "ignore" }).score;
    expect(a).toBe(b);
  });
  it("rank mode: strong power adds 30, mentioned 15", () => {
    const u = ev({}, { powerMode: "rank" }).score;
    expect(ev({ power_level: "strong" }, { powerMode: "rank" }).score - u).toBe(30);
    expect(ev({ power_level: "mentioned" }, { powerMode: "rank" }).score - u).toBe(15);
  });
  it("freshness decays to 0 at 7 days", () => {
    const fresh = ev({ first_seen_at: daysAgo(0.5) }).score;
    const mid = ev({ first_seen_at: daysAgo(4) }).score;
    const old = ev({ first_seen_at: daysAgo(8) }).score;
    expect(fresh - old).toBe(10);
    expect(mid).toBeGreaterThan(old);
    expect(mid).toBeLessThan(fresh);
  });
});
