import { describe, expect, it } from "vitest";
import { findHighlights } from "@/lib/parser";
import { captionSegments } from "./caption";

const join = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("captionSegments", () => {
  it("marks the given spans and keeps all text", () => {
    const text = "2 bedroom flat in Yaba, ₦1.5m per annum";
    const segs = captionSegments(text, [
      { start: 0, end: 9 },
      { start: 18, end: 22 },
    ]);
    expect(segs).toEqual([
      { text: "2 bedroom", marked: true },
      { text: " flat in ", marked: false },
      { text: "Yaba", marked: true },
      { text: ", ₦1.5m per annum", marked: false },
    ]);
  });

  it("merges overlaps, clamps bad offsets and ignores empty spans", () => {
    const text = "abcdefghij";
    const segs = captionSegments(text, [
      { start: 6, end: 40 },
      { start: 1, end: 4 },
      { start: 3, end: 5 },
      { start: 2, end: 2 },
      { start: -3, end: 0 },
    ]);
    expect(join(segs)).toBe(text);
    expect(segs.filter((s) => s.marked).map((s) => s.text)).toEqual(["bcd", "e", "ghij"]);
  });

  it("returns the whole caption unmarked without highlights", () => {
    expect(captionSegments("Yaba flat", [])).toEqual([{ text: "Yaba flat", marked: false }]);
  });

  it("lines up with the parser's highlights", () => {
    const text = "Newly renovated 2 bedroom flat in Yaba. 24/7 light, Band A. Rent ₦1.5m per annum. Call 08031234567";
    const marked = captionSegments(text, findHighlights(text))
      .filter((s) => s.marked)
      .map((s) => s.text);
    expect(marked).toContain("Yaba");
    expect(marked.some((m) => m.includes("1.5m"))).toBe(true);
    expect(marked).toContain("08031234567");
    expect(join(captionSegments(text, findHighlights(text)))).toBe(text);
  });
});
