import { describe, expect, it } from "vitest";
import { formatLagos, lagosDayKey, startOfLagosDay } from "./time";

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
