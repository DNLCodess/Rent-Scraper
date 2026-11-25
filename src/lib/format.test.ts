import { describe, expect, it } from "vitest";
import { formatAge, formatHomeTitle, formatPeriod, formatPosted } from "./format";

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
