/** Pure helpers for the My criteria screen: which card owns which preference, and what changed. */

import type { Preferences } from "./preferences";

// Type-only import above: this module stays pure (no server-only, no DB).

export type Editable = Pick<
  Preferences,
  "budgetMin" | "budgetMax" | "beds" | "preferredAreas" | "excludedAreas" | "powerMode"
>;
export type CardId = "budget" | "beds" | "areas" | "power";

/** The preference keys each card edits. Budget min/max and both area lists save together, as the server validates them together. */
export const CARD_KEYS: Record<CardId, (keyof Editable)[]> = {
  budget: ["budgetMin", "budgetMax"],
  beds: ["beds"],
  areas: ["preferredAreas", "excludedAreas"],
  power: ["powerMode"],
};

export const CARD_ORDER: CardId[] = ["budget", "beds", "areas", "power"];

export function pickEditable(p: Preferences | Editable): Editable {
  return {
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    beds: p.beds,
    preferredAreas: p.preferredAreas,
    excludedAreas: p.excludedAreas,
    powerMode: p.powerMode,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keys whose value in `draft` differs from the last saved value. */
export function changedKeys(draft: Editable, saved: Editable): (keyof Editable)[] {
  return (Object.keys(CARD_KEYS) as CardId[])
    .flatMap((c) => CARD_KEYS[c])
    .filter((k) => !same(draft[k], saved[k]));
}

/**
 * One PUT body per card with unsaved changes, limited to `cards`. A card's body carries all of its keys
 * that changed, so a rejected card never rides along with (or blocks) another card's save.
 */
export function cardPatches(
  draft: Editable,
  saved: Editable,
  cards: Iterable<CardId>,
): Array<{ card: CardId; patch: Partial<Editable> }> {
  const changed = new Set(changedKeys(draft, saved));
  const wanted = new Set(cards);
  const out: Array<{ card: CardId; patch: Partial<Editable> }> = [];
  for (const card of CARD_ORDER) {
    if (!wanted.has(card)) continue;
    const keys = CARD_KEYS[card].filter((k) => changed.has(k));
    if (keys.length === 0) continue;
    const patch: Partial<Editable> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = draft[k];
    out.push({ card, patch });
  }
  return out;
}
