import "server-only";
import type { Row } from "@libsql/client";
import { db } from "./db";
import type { PowerLevel, PricePeriod } from "./parser";
import { getPreferences, blockedSet, type Preferences } from "./preferences";
import { STRONG_MATCH_MAX, evaluate, type HideReason } from "./rules";
import type { InboxItem, InboxResponse, ListingStatus } from "./types";

export const STRONG_MATCH_SCORE = 70;
const DAY_MS = 86_400_000;

interface Scored {
  item: InboxItem;
  score: number;
  hiddenBy: HideReason | null;
}

/** Maps a listings row to an InboxItem, evaluating flags with the given preferences. */
export function scoreRow(r: Row, prefs: Preferences, blocked: Set<string>, now: Date): Scored {
  const firstSeen = (r.first_seen_at as string | null) ?? now.toISOString();
  const base = {
    id: r.id as string,
    tag: r.tag as string,
    url: r.url as string,
    author: r.author as string,
    caption: r.caption as string,
    posted_at: (r.posted_at as string | null) ?? null,
    likes: r.likes === null ? null : Number(r.likes),
    price_raw: (r.price_raw as string | null) ?? null,
    price_ngn: r.price_ngn === null ? null : Number(r.price_ngn),
    price_period: (r.price_period as PricePeriod | null) ?? null,
    area: (r.area as string | null) ?? null,
    bedrooms: r.bedrooms === null ? null : Number(r.bedrooms),
    phone: (r.phone as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    seen_before: false, // the Inbox is cross-run
    status: r.status as ListingStatus,
    power_level: r.power_level as PowerLevel,
    power_raw: (r.power_raw as string | null) ?? null,
    total_package_ngn: r.total_package_ngn === null ? null : Number(r.total_package_ngn),
    first_seen_at: firstSeen,
  };
  const ev = evaluate(base, prefs, blocked, now);
  const item: InboxItem = {
    ...base,
    checkManually: ev.checkManually,
    probablyTaken: ev.probablyTaken,
    strongMatch: false,
  };
  return { item, score: ev.score, hiddenBy: ev.hiddenBy };
}

async function loadScored(now: Date): Promise<Scored[]> {
  const [prefs, blocked, res] = await Promise.all([
    getPreferences(),
    blockedSet(),
    db().then((c) => c.execute("SELECT * FROM listings WHERE status = 'new' AND archived = 0")),
  ]);
  return res.rows.map((r) => scoreRow(r, prefs, blocked, now));
}

export async function getInbox(now: Date = new Date()): Promise<InboxResponse> {
  const all = await loadScored(now);
  const visible = all.filter((s) => s.hiddenBy === null);
  visible.sort(
    (a, b) =>
      Number(a.item.checkManually) - Number(b.item.checkManually) ||
      b.score - a.score ||
      (a.item.first_seen_at < b.item.first_seen_at ? 1 : a.item.first_seen_at > b.item.first_seen_at ? -1 : 0),
  );
  let strong = 0;
  for (const s of visible) {
    if (strong >= STRONG_MATCH_MAX) break;
    if (!s.item.checkManually && s.score >= STRONG_MATCH_SCORE) {
      s.item.strongMatch = true;
      strong++;
    }
  }
  const cutoff = now.getTime() - DAY_MS;
  return {
    items: visible.map((s) => s.item),
    newToday: visible.filter((s) => new Date(s.item.first_seen_at).getTime() >= cutoff).length,
    matchCount: visible.length,
    hiddenCount: all.length - visible.length,
  };
}

export async function getHidden(now: Date = new Date()): Promise<Array<{ item: InboxItem; reason: HideReason }>> {
  const all = await loadScored(now);
  return all
    .filter((s): s is Scored & { hiddenBy: HideReason } => s.hiddenBy !== null)
    .sort((a, b) => (a.item.first_seen_at < b.item.first_seen_at ? 1 : -1))
    .map((s) => ({ item: s.item, reason: s.hiddenBy }));
}
