/** UI filter state for the results table, and conversion to API query strings. */

export interface FilterState {
  q: string;
  minPrice: string; // free text, e.g. "500k", "1.5m", "800000"
  maxPrice: string;
  area: string; // "any" or an area name
  beds: string; // "any" | "0".."3" | "4+"
  age: string; // "any" | days
}

export const EMPTY_FILTERS: FilterState = { q: "", minPrice: "", maxPrice: "", area: "any", beds: "any", age: "any" };

/** "1.5m" -> 1500000, "800k" -> 800000, "650,000" -> 650000. Invalid -> undefined. */
export function parseAmount(input: string): number | undefined {
  const m = input.trim().toLowerCase().replace(/[₦,\s]|ngn/g, "").match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return undefined;
  return Math.round(parseFloat(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
}

export function toQuery(f: FilterState): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  const min = parseAmount(f.minPrice);
  const max = parseAmount(f.maxPrice);
  if (min !== undefined) p.set("minPrice", String(min));
  if (max !== undefined) p.set("maxPrice", String(max));
  if (f.area !== "any") p.set("area", f.area);
  if (f.beds !== "any") p.set("beds", f.beds);
  if (f.age !== "any") p.set("maxAgeDays", f.age);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeFilterCount(f: FilterState): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof FilterState)[]).filter((k) => f[k].trim() !== EMPTY_FILTERS[k]).length;
}
