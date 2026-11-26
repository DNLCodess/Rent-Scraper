import { describe, expect, it } from "vitest";
import { cardPatches, changedKeys, type Editable } from "./criteria";

const base: Editable = {
  budgetMin: null,
  budgetMax: 2_000_000,
  beds: ["1", "2"],
  preferredAreas: ["Yaba"],
  excludedAreas: [],
  powerMode: "rank",
};

describe("changedKeys", () => {
  it("is empty when nothing changed", () => {
    expect(changedKeys({ ...base, beds: ["1", "2"] }, base)).toEqual([]);
  });
  it("lists only the keys that differ, including array contents", () => {
    expect(changedKeys({ ...base, budgetMax: 1_000_000, excludedAreas: ["Lekki"] }, base)).toEqual([
      "budgetMax",
      "excludedAreas",
    ]);
  });
  it("treats null versus a number as a change", () => {
    expect(changedKeys({ ...base, budgetMax: null }, base)).toEqual(["budgetMax"]);
  });
});

describe("cardPatches", () => {
  it("sends one patch per dirty card with only its changed keys", () => {
    const draft: Editable = { ...base, budgetMin: 500_000, beds: ["0"], powerMode: "require" };
    expect(cardPatches(draft, base, ["budget", "beds", "power"])).toEqual([
      { card: "budget", patch: { budgetMin: 500_000 } },
      { card: "beds", patch: { beds: ["0"] } },
      { card: "power", patch: { powerMode: "require" } },
    ]);
  });
  it("leaves out a card that still holds a rejected value when it wasn't changed again", () => {
    // Budget was rejected earlier (min above max) and stays unsaved in the draft; the user now edits beds.
    const draft: Editable = { ...base, budgetMin: 3_000_000, beds: ["3"] };
    expect(cardPatches(draft, base, ["beds"])).toEqual([{ card: "beds", patch: { beds: ["3"] } }]);
  });
  it("skips a dirty card whose value went back to the saved one", () => {
    expect(cardPatches(base, base, ["budget", "areas"])).toEqual([]);
  });
  it("moves an area between lists in one patch, so both lists save together", () => {
    const draft: Editable = { ...base, preferredAreas: [], excludedAreas: ["Yaba"] };
    expect(cardPatches(draft, base, ["areas"])).toEqual([
      { card: "areas", patch: { preferredAreas: [], excludedAreas: ["Yaba"] } },
    ]);
  });
});
