/** Display helpers shared by UI components. */

import type { Listing, ListingStatus, RunStatus } from "./types";

/** ₦1.5m, ₦800k, ₦85,000 */
export function formatNaira(n: number | null): string {
  if (n === null) return "";
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(2)}m`;
  if (n >= 100_000) return `₦${+(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString("en-NG")}`;
}

const PERIOD_SUFFIX: Record<NonNullable<Listing["price_period"]>, string> = {
  year: "/yr",
  month: "/mo",
  night: "/night",
};

export function formatPrice(l: Pick<Listing, "price_ngn" | "price_period">): string {
  if (l.price_ngn === null) return "";
  return formatNaira(l.price_ngn) + (l.price_period ? PERIOD_SUFFIX[l.price_period] : "");
}

export function formatBeds(n: number | null): string {
  if (n === null) return "";
  return n === 0 ? "Studio" : String(n);
}

export function formatCount(n: number | null): string {
  if (n === null) return "";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** wa.me link for a normalised +234 number. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

const DAY_MS = 86_400_000;

/** "today", "yesterday", "3 days ago", "2 weeks ago", "4 months ago". */
export function formatAge(iso: string, now: Date = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** "Posted 2 days ago", or "Found …" when TikTok gave no post date. */
export function formatPosted(l: { posted_at: string | null; first_seen_at: string }, now: Date = new Date()): string {
  return l.posted_at ? `Posted ${formatAge(l.posted_at, now)}` : `Found ${formatAge(l.first_seen_at, now)}`;
}

/** "Studio", "2-bed", or null when unknown. */
export function formatBedsShort(n: number | null): string | null {
  if (n === null) return null;
  return n === 0 ? "Studio" : `${n}-bed`;
}

/** Card title: "2-bed in Yaba", "Home in Ajah", "2-bed, area not given". */
export function formatHomeTitle(l: Pick<Listing, "bedrooms" | "area">): string {
  const beds = formatBedsShort(l.bedrooms);
  if (l.area) return `${beds ?? "Home"} in ${l.area}`;
  return beds ? `${beds}, area not given` : "Home, details not given";
}

/** Price period as shown under the reel price. No period means yearly (spec §7). */
export function formatPeriod(p: Listing["price_period"], short = false): string {
  const period = p ?? "year";
  if (!short) return `/ ${period}`;
  return PERIOD_SUFFIX[period];
}

/** Text inside the brass power tag. */
export function formatPower(level: "strong" | "mentioned" | "unknown"): string {
  if (level === "strong") return "Constant power";
  if (level === "mentioned") return "Power mentioned";
  return "";
}

const POWER_LABEL_MAX = 24;

/**
 * Power tag text: the caption's own phrase when there is one ("24/7 light, Band A"),
 * first letter capitalised, whitespace collapsed, capped at 24 characters; otherwise the generic label.
 */
export function powerLabel(level: "strong" | "mentioned" | "unknown", raw: string | null | undefined): string {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return formatPower(level);
  const capped = text.length > POWER_LABEL_MAX ? `${text.slice(0, POWER_LABEL_MAX - 1).trimEnd()}…` : text;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/** "Studio", "1 bed", "2 beds", or null when unknown (detail facts row). */
export function formatBedCount(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return "Studio";
  return n === 1 ? "1 bed" : `${n} beds`;
}

/** First number of a comma-separated phone list, spaced for reading: "+234 803 123 4567". */
export function formatPhone(phones: string | null): string | null {
  const first = phones
    ?.split(",")
    .map((p) => p.trim())
    .find(Boolean);
  if (!first) return null;
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(first.replace(/\s+/g, ""));
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : first;
}

/** "just now", "5 min ago", "3 h ago", then the day-level formatAge ("yesterday", "3 days ago"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return formatAge(iso, now);
}

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  new: "New",
  dismissed: "Dismissed",
  shortlisted: "Shortlisted",
  messaged: "Messaged",
  inspection_booked: "Inspection booked",
  inspected: "Inspected",
  negotiating: "Negotiating",
  got_it: "Got it",
  dropped: "Dropped",
};
