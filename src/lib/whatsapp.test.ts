import { describe, expect, it } from "vitest";
import { firstMessage, nudgeMessage, waLink } from "./whatsapp";

const base = { bedrooms: 2, area: "Yaba", price_ngn: 1_500_000, price_period: "year" as const };

describe("whatsapp", () => {
  it("firstMessage exact copy", () => {
    expect(firstMessage(base)).toBe(
      "Hi, is the 2-bed in Yaba (₦1.5m/yr) from your TikTok still available? What's the power situation — which band and how many hours a day?",
    );
  });
  it("omits parenthesis without price and defaults area/beds", () => {
    expect(firstMessage({ bedrooms: null, area: null, price_ngn: null, price_period: null })).toBe(
      "Hi, is the place in the area from your TikTok still available? What's the power situation — which band and how many hours a day?",
    );
  });
  it("beds wording", () => {
    const m = (b: number) => nudgeMessage({ ...base, bedrooms: b });
    expect(m(0)).toContain("the studio in");
    expect(m(1)).toContain("the mini flat in");
    expect(m(3)).toContain("the 3-bed in");
    expect(m(5)).toContain("the 4-bed in");
  });
  it("nudgeMessage", () => {
    expect(nudgeMessage(base)).toBe("Hi again, following up on the 2-bed in Yaba. Is it still available?");
  });
  it("waLink uses first phone and round-trips text", () => {
    const text = "Hi ₦1.5m — what's\nup";
    const url = waLink("+2348031234567, +2347031234567", text)!;
    expect(url.startsWith("https://wa.me/2348031234567?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(text);
  });
  it("waLink null cases", () => {
    expect(waLink(null, "x")).toBeNull();
    expect(waLink("", "x")).toBeNull();
    expect(waLink(" , abc", "x")).toBeNull();
    expect(waLink(", +2348031234567", "x")).toContain("wa.me/2348031234567");
  });
});
