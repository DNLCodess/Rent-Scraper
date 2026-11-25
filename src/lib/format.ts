/** Display helpers shared by UI components. */

import type { Listing, RunStatus } from "./types";

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

export function statusVariant(s: RunStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "done") return "secondary";
  if (s === "failed") return "destructive";
  return "outline";
}

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
