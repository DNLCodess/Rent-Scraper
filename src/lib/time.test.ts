import { describe, expect, it } from "vitest";
import { formatLagos, lagosDayKey, lagosLocalToIso, nextSearchLabel, startOfLagosDay } from "./time";

describe("Lagos time", () => {
  it("keeps 23:30 WAT on the same day", () => {
    expect(lagosDayKey(new Date("2026-11-28T22:30:00Z"))).toBe("2026-11-28");
  });
  it("rolls to the next day after midnight WAT", () => {
    expect(lagosDayKey(new Date("2026-11-28T23:30:00Z"))).toBe("2026-11-29");
  });
  it("finds the start of the Lagos day", () => {
    expect(startOfLagosDay(new Date("2026-11-28T23:30:00Z")).toISOString()).toBe("2026-11-28T23:00:00.000Z");
    expect(startOfLagosDay(new Date("2026-11-28T22:30:00Z")).toISOString()).toBe("2026-11-27T23:00:00.000Z");
  });
  it("formats in Lagos time", () => {
    const d = new Date("2026-11-28T23:30:00Z"); // Sun 29 Nov, 00:30 WAT
    expect(formatLagos(d, "time")).toBe("00:30");
    expect(formatLagos(d, "dayNum")).toBe("29");
    expect(formatLagos(d, "dayShort")).toBe("Sun");
    expect(formatLagos(d, "date")).toContain("29");
  });
});

describe("nextSearchLabel", () => {
  it("says today before 07:00 Lagos and tomorrow from 07:00", () => {
    expect(nextSearchLabel(new Date("2026-11-26T05:59:00Z"))).toBe("Next search 7:00 today"); // 06:59 WAT
    expect(nextSearchLabel(new Date("2026-11-26T06:00:00Z"))).toBe("Next search 7:00 tomorrow"); // 07:00 WAT
    expect(nextSearchLabel(new Date("2026-11-26T23:30:00Z"))).toBe("Next search 7:00 today"); // 00:30 WAT next day
  });
});

describe("lagosLocalToIso", () => {
  it("builds Lagos wall time with a +01:00 offset", () => {
    expect(lagosLocalToIso("2026-11-29", "10:00")).toBe("2026-11-29T10:00:00+01:00");
    expect(new Date(lagosLocalToIso("2026-11-29", "10:00")!).toISOString()).toBe("2026-11-29T09:00:00.000Z");
  });
  it("keeps 23:30 Lagos on the chosen day", () => {
    const iso = lagosLocalToIso("2026-11-28", "23:30")!;
    expect(new Date(iso).toISOString()).toBe("2026-11-28T22:30:00.000Z");
    expect(lagosDayKey(new Date(iso))).toBe("2026-11-28");
  });
  it("puts 00:30 Lagos on the chosen day, the previous UTC day", () => {
    const iso = lagosLocalToIso("2026-11-29", "00:30")!;
    expect(new Date(iso).toISOString()).toBe("2026-11-28T23:30:00.000Z");
    expect(lagosDayKey(new Date(iso))).toBe("2026-11-29");
  });
  it("rejects missing or impossible values", () => {
    expect(lagosLocalToIso("", "10:00")).toBeNull();
    expect(lagosLocalToIso("2026-11-29", "")).toBeNull();
    expect(lagosLocalToIso("2026-02-30", "10:00")).toBeNull();
    expect(lagosLocalToIso("2026-11-29", "24:00")).toBeNull();
    expect(lagosLocalToIso("29/11/2026", "10:00")).toBeNull();
  });
});
