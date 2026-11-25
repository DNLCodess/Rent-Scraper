import { areaLineage, isCity, yearlyRent } from "./parser";
import type { PowerLevel, PricePeriod } from "./parser";
import type { BedOption, Preferences } from "./preferences";

// Type-only import above: this module stays pure (no server-only, no DB).

export type HideReason =
  | "excluded_area"
  | "blocked_author"
  | "over_budget"
  | "under_budget"
  | "bedrooms"
  | "shortlet"
  | "power_required";

export interface RuleInput {
  author: string;
  area: string | null;
  price_ngn: number | null;
  price_period: PricePeriod | null;
  bedrooms: number | null;
  power_level: PowerLevel;
  posted_at: string | null;
  first_seen_at: string;
}

export interface Evaluation {
  hiddenBy: HideReason | null;
  score: number;
  checkManually: boolean;
  probablyTaken: boolean;
}

export const STRONG_MATCH_MAX = 3;
export const STALE_DAYS = 21;

const DAY_MS = 86_400_000;

function bedOption(bedrooms: number): BedOption {
  return bedrooms >= 4 ? "4+" : (String(bedrooms) as BedOption);
}

/** The first hard rule that applies, in HideReason order. Unknown fields never hide. */
function hiddenBy(l: RuleInput, prefs: Preferences, blocked: Set<string>): HideReason | null {
  if (l.area) {
    const excluded = new Set(prefs.excludedAreas.map((a) => a.toLowerCase()));
    if (areaLineage(l.area).some((a) => excluded.has(a.toLowerCase()))) return "excluded_area";
  }
  if (blocked.has(l.author.trim().replace(/^@+/, "").toLowerCase())) return "blocked_author";

  const yearly = yearlyRent(l.price_ngn, l.price_period);
  if (yearly !== null) {
    if (prefs.budgetMax !== null && yearly > prefs.budgetMax) return "over_budget";
    if (prefs.budgetMin !== null && yearly < prefs.budgetMin) return "under_budget";
  }
  if (prefs.beds.length > 0 && l.bedrooms !== null && !prefs.beds.includes(bedOption(l.bedrooms))) {
    return "bedrooms";
  }
  if (l.price_period === "night") return "shortlet";
  if (prefs.powerMode === "require" && l.power_level === "unknown") return "power_required";
  return null;
}

function score(l: RuleInput, prefs: Preferences, now: Date): number {
  let s = 0;
  if (l.area) {
    const preferred = new Set(prefs.preferredAreas.map((a) => a.toLowerCase()));
    if (areaLineage(l.area).some((a) => preferred.has(a.toLowerCase()))) s += 40;
  }
  if (prefs.powerMode === "rank") {
    if (l.power_level === "strong") s += 30;
    else if (l.power_level === "mentioned") s += 15;
  }
  const yearly = yearlyRent(l.price_ngn, l.price_period);
  if (
    yearly !== null &&
    (prefs.budgetMax === null || yearly <= prefs.budgetMax) &&
    (prefs.budgetMin === null || yearly >= prefs.budgetMin)
  ) {
    s += 20;
  }
  const ageDays = (now.getTime() - new Date(l.first_seen_at).getTime()) / DAY_MS;
  if (ageDays <= 1) s += 10;
  else if (ageDays < 7) s += (10 * (7 - ageDays)) / 6;
  return s;
}

export function evaluate(l: RuleInput, prefs: Preferences, blocked: Set<string>, now: Date): Evaluation {
  const posted = new Date(l.posted_at ?? l.first_seen_at).getTime();
  return {
    hiddenBy: hiddenBy(l, prefs, blocked),
    score: score(l, prefs, now),
    checkManually:
      l.price_ngn === null || l.bedrooms === null || l.area === null || isCity(l.area),
    probablyTaken: (now.getTime() - posted) / DAY_MS > STALE_DAYS,
  };
}
