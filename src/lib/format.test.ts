import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatBedCount,
  formatHomeTitle,
  formatPeriod,
  formatPhone,
  formatPosted,
  formatRelative,
  powerLabel,
} from "./format";

const now = new Date("2026-11-26T12:00:00Z");

describe("inbox card labels", () => {
  it("formats ages", () => {
    expect(formatAge("2026-11-26T08:00:00Z", now)).toBe("today");
    expect(formatAge("2026-11-25T08:00:00Z", now)).toBe("yesterday");
    expect(formatAge("2026-11-24T08:00:00Z", now)).toBe("2 days ago");
    expect(formatAge("2026-11-05T08:00:00Z", now)).toBe("3 weeks ago");
    expect(formatAge("2026-07-26T08:00:00Z", now)).toBe("4 months ago");
  });

  it("falls back to the first-seen date when there is no post date", () => {
    expect(formatPosted({ posted_at: null, first_seen_at: "2026-11-26T08:00:00Z" }, now)).toBe("Found today");
  });

  it("builds titles from what is known", () => {
    expect(formatHomeTitle({ bedrooms: 2, area: "Yaba" })).toBe("2-bed in Yaba");
    expect(formatHomeTitle({ bedrooms: 0, area: "Yaba" })).toBe("Studio in Yaba");
    expect(formatHomeTitle({ bedrooms: null, area: "Ajah" })).toBe("Home in Ajah");
    expect(formatHomeTitle({ bedrooms: 2, area: null })).toBe("2-bed, area not given");
  });

  it("treats a missing period as yearly", () => {
    expect(formatPeriod(null)).toBe("/ year");
    expect(formatPeriod("month")).toBe("/ month");
    expect(formatPeriod(null, true)).toBe("/yr");
  });
});

describe("powerLabel", () => {
  it("uses the caption phrase, capitalised with whitespace collapsed", () => {
    expect(powerLabel("strong", "24/7 light,  Band A")).toBe("24/7 light, Band A");
    expect(powerLabel("strong", "constant\n power")).toBe("Constant power");
    expect(powerLabel("mentioned", "  band b ")).toBe("Band b");
  });

  it("caps long phrases at 24 characters with an ellipsis", () => {
    const label = powerLabel("strong", "uninterrupted power supply all day and night");
    expect(label).toBe("Uninterrupted power sup…");
    expect(label).toHaveLength(24);
    expect(powerLabel("strong", "a".repeat(24))).toBe("A" + "a".repeat(23));
  });

  it("falls back to the generic label without a phrase", () => {
    expect(powerLabel("strong", null)).toBe("Constant power");
    expect(powerLabel("mentioned", "   ")).toBe("Power mentioned");
    expect(powerLabel("unknown", undefined)).toBe("");
  });
});

describe("listing detail labels", () => {
  it("counts beds", () => {
    expect(formatBedCount(null)).toBeNull();
    expect(formatBedCount(0)).toBe("Studio");
    expect(formatBedCount(1)).toBe("1 bed");
    expect(formatBedCount(2)).toBe("2 beds");
  });

  it("shows the first phone, spaced", () => {
    expect(formatPhone("+2348031234567, +2347031234567")).toBe("+234 803 123 4567");
    expect(formatPhone(" , +2349051234567")).toBe("+234 905 123 4567");
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone(null)).toBeNull();
    expect(formatPhone("")).toBeNull();
  });

  it("formats note times relative to now", () => {
    expect(formatRelative("2026-11-26T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-11-26T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelative("2026-11-26T09:00:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-11-25T08:00:00Z", now)).toBe("yesterday");
  });
});
