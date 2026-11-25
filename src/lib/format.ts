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
