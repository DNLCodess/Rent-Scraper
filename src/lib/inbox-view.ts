/** Client-side Inbox state helpers. Pure, so the Inbox screen and its tests share them. */

import type { InboxResponse } from "./types";

const DAY_MS = 86_400_000;

/**
 * The Inbox without the given listings, with matchCount and newToday ("first seen in the last
 * 24 hours") lowered to match. Returns the same object when none of the ids are present.
 */
export function withoutListings(d: InboxResponse, ids: Iterable<string>, now: Date = new Date()): InboxResponse {
  const gone = new Set(ids);
  const removed = d.items.filter((i) => gone.has(i.id));
  if (removed.length === 0) return d;
  const since = now.getTime() - DAY_MS;
  const fresh = removed.filter((i) => new Date(i.first_seen_at).getTime() >= since).length;
  return {
    ...d,
    items: d.items.filter((i) => !gone.has(i.id)),
    matchCount: Math.max(0, d.matchCount - removed.length),
    newToday: Math.max(0, d.newToday - fresh),
  };
}
