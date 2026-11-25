/** WhatsApp message templates and wa.me links. Pure; safe for client components. */

import { formatPrice } from "./format";
import type { PricePeriod } from "./parser";

export interface MessageListing {
  bedrooms: number | null;
  area: string | null;
  price_ngn: number | null;
  price_period: PricePeriod | null;
}

function bedsWord(n: number | null): string {
  if (n === null) return "place";
  if (n === 0) return "studio";
  if (n === 1) return "mini flat";
  return `${Math.min(n, 4)}-bed`;
}

export function firstMessage(l: MessageListing): string {
  const price = formatPrice(l);
  const priceText = price ? ` (${price})` : "";
  return `Hi, is the ${bedsWord(l.bedrooms)} in ${l.area ?? "the area"}${priceText} from your TikTok still available? What's the power situation — which band and how many hours a day?`;
}

export function nudgeMessage(l: MessageListing): string {
  return `Hi again, following up on the ${bedsWord(l.bedrooms)} in ${l.area ?? "the area"}. Is it still available?`;
}

/** Uses the first non-empty phone; null when no digits are available. */
export function waLink(phones: string | null, text: string): string | null {
  if (!phones) return null;
  for (const p of phones.split(",")) {
    const digits = p.replace(/\D/g, "");
    if (digits) return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
  return null;
}
