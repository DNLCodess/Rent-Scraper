/**
 * Caption parser: pulls price, area, bedrooms and phone numbers out of
 * free-text Nigerian rental captions using regexes and keyword lists.
 * Pure functions, no I/O, so it is easy to unit-test.
 */

export type PricePeriod = "year" | "month" | "night";

export interface ParsedPrice {
  raw: string;
  ngn: number;
  period: PricePeriod | null;
}

export interface ParsedListing {
  price_raw: string | null;
  price_ngn: number | null;
  price_period: PricePeriod | null;
  area: string | null;
  bedrooms: number | null;
  phone: string | null;
  power_level: PowerLevel;
  power_raw: string | null;
  total_package_ngn: number | null;
}

export type PowerLevel = "strong" | "mentioned" | "unknown";

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

// Optional currency, a number (plain or comma-grouped), optional k/m suffix.
// The currency "N" must not be glued to a preceding letter ("in 800k").
const PRICE_RE =
  /(?<![a-z0-9])(?<cur>₦|ngn|n|#)?\s?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?<suf>million|mil|m|thousand|k)?(?![a-z0-9])/gi;

const MULTIPLIER: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mil: 1e6,
  million: 1e6,
};

// Anything outside this range is almost certainly not a rent figure
// (likes counts, years, phone fragments, ...).
const MIN_PRICE = 20_000;
const MAX_PRICE = 5_000_000_000;

const PERIOD_PATTERNS: [PricePeriod, RegExp][] = [
  ["year", /per\s*annum|p\.?\s?a\b|\/\s*annum|annum|yearly|annual|per\s*year|a\s*year|\/\s*y(ea)?r/i],
  ["month", /per\s*month|monthly|\/\s*month|\/\s*mo\b|a\s*month/i],
  ["night", /per\s*night|\/\s*night|nightly|a\s*night|per\s*day|daily/i],
];

// Words right before a figure that make it more / less likely to be the rent.
const RENT_HINT = /\b(rent|price|amount|cost|annual|yearly|per annum)\b/i;
const PACKAGE_LABEL_BEFORE = /(?:total\s*package|package|total)\W*(?:(?:is|of)\s+)?$/i;
const PACKAGE_LABEL_AFTER = /^\s*(?:total\s*)?package(?![a-z])/i;
const PACKAGE_HINT = /\b(total|package)\b/i;
const FEE_HINT = /\b(caution|agency|agent|agreement|legal|service\s*charge|inspection|deposit|commission|fees?)\b/i;

interface Span {
  start: number;
  end: number;
}

function detectPeriod(after: string): (Span & { period: PricePeriod }) | null {
  // Only look until the next number so we don't borrow another figure's period.
  const window = after.slice(0, 30).split(/\d/)[0];
  for (const [period, re] of PERIOD_PATTERNS) {
    const m = re.exec(window);
    if (m) return { period, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/** Figure in ngn from a PRICE_RE match, or null if it is not price-like. */
function figureNgn(groups: Record<string, string | undefined> | undefined): number | null {
  const { cur, num, suf } = groups ?? {};
  if (!num) return null;
  // A bare number like "2" or "08031234567" is not a price.
  if (!cur && !suf && !num.includes(",")) return null;
  const ngn = Math.round(parseFloat(num.replace(/,/g, "")) * (suf ? MULTIPLIER[suf.toLowerCase()] : 1));
  return ngn < MIN_PRICE || ngn > MAX_PRICE ? null : ngn;
}

interface PriceHit extends ParsedPrice {
  start: number;
  end: number; // end of the figure
  periodSpan: Span | null; // absolute offsets of the period phrase
}

function findPrice(text: string): PriceHit | null {
  let best: (PriceHit & { score: number }) | null = null;

  for (const m of text.matchAll(PRICE_RE)) {
    const ngn = figureNgn(m.groups);
    if (ngn === null) continue;

    const start = m.index ?? 0;
    const end = start + m[0].length;
    // Context before the figure, cut at the previous number or clause break.
    const before = text.slice(Math.max(0, start - 30), start).split(/[\d.,;|\n]/).pop() ?? "";
    let score = 0;
    if (RENT_HINT.test(before)) score += 2;
    if (FEE_HINT.test(before)) score -= 3;
    // A figure labelled as the package ("total package 2m", "2m total package") is not rent.
    if (PACKAGE_LABEL_BEFORE.test(before) || PACKAGE_LABEL_AFTER.test(text.slice(end))) continue;
    if (PACKAGE_HINT.test(before)) score -= 3;

    if (!best || score > best.score) {
      const p = detectPeriod(text.slice(end));
      best = {
        raw: m[0].trim(),
        ngn,
        period: p?.period ?? null,
        start,
        end,
        periodSpan: p ? { start: end + p.start, end: end + p.end } : null,
        score,
      };
    }
  }
  return best;
}

/** Returns the most likely rent figure in the text, or null. */
export function parsePrice(text: string): ParsedPrice | null {
  const hit = findPrice(text);
  return hit ? { raw: hit.raw, ngn: hit.ngn, period: hit.period } : null;
}

// ---------------------------------------------------------------------------
// Total package (only when the caption states it)
// ---------------------------------------------------------------------------

const PACKAGE_KEY_RE = /(?<![a-z])(?:total\s*package|package|total)(?![a-z])/gi;
const PACKAGE_FIGURE_RE = new RegExp(`^[\\s:=\\-]*(?:(?:is|of)\\s+)?(?:${PRICE_RE.source})`, "i");

function findPackage(text: string): (Span & { ngn: number }) | null {
  for (const k of text.matchAll(PACKAGE_KEY_RE)) {
    const keyEnd = (k.index ?? 0) + k[0].length;
    const m = PACKAGE_FIGURE_RE.exec(text.slice(keyEnd));
    if (!m) continue;
    const ngn = figureNgn(m.groups);
    if (ngn !== null) return { ngn, start: k.index ?? 0, end: keyEnd + m[0].length };
  }
  // Trailing label: "NGN 2.2M total package".
  for (const m of text.matchAll(PRICE_RE)) {
    const ngn = figureNgn(m.groups);
    if (ngn === null) continue;
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const label = PACKAGE_LABEL_AFTER.exec(text.slice(end));
    if (label) return { ngn, start, end: end + label[0].length };
  }
  return null;
}

/** The all-in figure when the caption states one ("total package ₦1.95m"). Never computed. */
export function parseTotalPackage(text: string): number | null {
  return findPackage(text)?.ngn ?? null;
}

/** Rent per year: yearly as is, monthly x12, nightly unknown. */
export function yearlyRent(ngn: number | null, period: PricePeriod | null): number | null {
  if (ngn === null) return null;
  if (period === "night") return null;
  return period === "month" ? ngn * 12 : ngn;
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

const POWER_WORD = String.raw`\s+(?:light|power|electricity)`;
const STRONG_POWER: RegExp[] = [
  new RegExp(String.raw`(?<![a-z0-9])24\s*/\s*7${POWER_WORD}(?![a-z0-9])`, "i"),
  new RegExp(String.raw`(?<![a-z0-9])24\s*-?\s*(?:hrs?|hours?)${POWER_WORD}(?![a-z0-9])`, "i"),
  /\b(?:constant|uninterrupted|steady|stable)\s+(?:light|power|electricity)\b/i,
  /\bestate\s+power\b/i,
  /\bdedicated\s+transformer\b/i,
  /\bband\s*-?\s*a\b/i,
];
const MENTIONED_POWER: RegExp[] = [/\bprepaid\s+meter\b/i, /\bsolar\b/i, /\binverter\b/i,
];

function findPower(text: string): (Span & { level: PowerLevel }) | null {
  for (const [level, list] of [
    ["strong", STRONG_POWER],
    ["mentioned", MENTIONED_POWER],
  ] as const) {
    let best: Span | null = null;
    for (const re of list) {
      const m = re.exec(text);
      if (m && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length };
    }
    if (best) return { level, ...best };
  }
  return null;
}

/** How firmly the caption promises electricity; unknown when it says nothing. */
export function parsePower(text: string): { level: PowerLevel; raw: string | null } {
  const hit = findPower(text);
  return hit ? { level: hit.level, raw: text.slice(hit.start, hit.end) } : { level: "unknown", raw: null };
}

// ---------------------------------------------------------------------------
// Bedrooms
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** Number of bedrooms; 0 = studio / self contain. Null if not stated. */
export function parseBedrooms(text: string): number | null {
  return findBedrooms(text)?.n ?? null;
}

function findBedrooms(text: string): (Span & { n: number }) | null {
  const span = (m: RegExpMatchArray) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  const digit = text.match(/(?<![a-z0-9])(\d{1,2})\s*-?\s*(?:bedroom|bdrm|bdr|bed|br\b)/i);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 10) return { n, ...span(digit) };
  }
  const word = text.match(/\b(one|two|three|four|five|six|seven)\s*-?\s*(?:bedroom|bed\b)/i);
  if (word) return { n: WORD_NUMBERS[word[1].toLowerCase()], ...span(word) };
  const mini = text.match(/mini\s*-?\s*flat|room\s*(?:and|&|n)\s*parlou?r/i);
  if (mini) return { n: 1, ...span(mini) };
  const studio = text.match(/self\s*-?\s*con(?:tain(?:ed)?)?\b|\bstudio\b/i);
  if (studio) return { n: 0, ...span(studio) };
  return null;
}

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

// Canonical name -> extra aliases. The canonical name is always an alias too.
// Ambiguous short names (VI, UI, Ado, Challenge, ...) are left out on purpose.
const AREAS: Record<string, string[]> = {
  // Lagos
  "Lekki Phase 1": ["lekki phase one", "lekki ph 1"],
  "Lekki Phase 2": ["lekki phase two"],
  Lekki: [],
  "Ibeju-Lekki": ["ibeju lekki"],
  Ajah: [],
  Sangotedo: [],
  Awoyaya: [],
  Lakowe: [],
  Badore: [],
  "Abraham Adesanya": [],
  Ikota: [],
  Osapa: ["osapa london"],
  Agungi: [],
  Ikate: [],
  Jakande: [],
  Chevron: [],
  Oniru: [],
  Ilasan: [],
  Ikoyi: [],
  "Banana Island": [],
  Parkview: ["park view estate"],
  "Victoria Island": ["v.i", "v/i"],
  "Lagos Island": [],
  Obalende: [],
  Yaba: [],
  Akoka: [],
  Bariga: [],
  Shomolu: ["somolu"],
  "Ebute Metta": ["ebute-metta"],
  Surulere: [],
  Ojuelegba: [],
  Gbagada: [],
  Ogudu: [],
  Magodo: [],
  Ojota: [],
  Ketu: [],
  Maryland: [],
  "Anthony Village": [],
  Ilupeju: [],
  Palmgrove: ["palm grove"],
  Onipanu: [],
  Mushin: [],
  Oshodi: [],
  Isolo: [],
  "Ajao Estate": [],
  Ejigbo: [],
  "Ikeja GRA": ["gra ikeja"],
  Ikeja: [],
  Opebi: [],
  "Allen Avenue": ["allen"],
  Alausa: [],
  Oregun: [],
  Ogba: [],
  Omole: [],
  Ojodu: [],
  Berger: [],
  Agege: [],
  Ifako: [],
  Egbeda: [],
  Ipaja: [],
  Ikotun: [],
  Idimu: [],
  Alimosho: [],
  Festac: ["festac town"],
  "Amuwo Odofin": ["amuwo-odofin"],
  "Satellite Town": [],
  Ikorodu: [],
  Badagry: [],
  Epe: [],
  // Ibadan
  Bodija: [],
  Akobo: [],
  Jericho: [],
  Oluyole: [],
  "Ring Road": [],
  Agodi: [],
  Samonda: [],
  Ojoo: [],
  Moniya: [],
  Apata: [],
  "Iwo Road": [],
  Mokola: [],
  Dugbe: [],
  Eleyele: [],
  Alalubosa: [],
  "Idi-Ape": ["idi ape"],
  Felele: [],
  Odogbo: [],
  Basorun: [],
  Iyaganku: [],
  "Akala Express": [],
  Elebu: [],
  // Abuja
  Gwarinpa: ["gwarimpa"],
  Wuse: [],
  Maitama: [],
  Asokoro: [],
  Jabi: [],
  Lugbe: [],
  Kubwa: [],
  Garki: [],
  Katampe: [],
  "Life Camp": [],
  Lokogoma: [],
  Galadimawa: [],
  Utako: [],
  Guzape: [],
};

// Child -> parent. Anything not listed has no parent.
const AREA_PARENTS: Record<string, string> = {
  "Lekki Phase 1": "Lekki",
  "Lekki Phase 2": "Lekki",
  Ikate: "Lekki",
  Agungi: "Lekki",
  Osapa: "Lekki",
  Jakande: "Lekki",
  Chevron: "Lekki",
  Ikota: "Lekki",
  "Ikeja GRA": "Ikeja",
  "Allen Avenue": "Ikeja",
  Opebi: "Ikeja",
  Alausa: "Ikeja",
  Oregun: "Ikeja",
  "Banana Island": "Ikoyi",
  Parkview: "Ikoyi",
};

/** The area followed by its ancestors, most specific first. */
export function areaLineage(area: string): string[] {
  const out = [area];
  for (let p = AREA_PARENTS[area]; p && !out.includes(p); p = AREA_PARENTS[p]) out.push(p);
  return out;
}

/** True when the name is a city rather than a neighbourhood. */
export function isCity(area: string): boolean {
  return Object.hasOwn(CITIES, area);
}

// Cities are only used when no specific area is found.
const CITIES: Record<string, string[]> = {
  Lagos: [],
  Ibadan: [],
  Abuja: [],
  "Port Harcourt": ["portharcourt", "ph city"],
  Abeokuta: [],
};

interface AreaMatcher {
  name: string;
  re: RegExp;
  tag: string; // alias with spaces removed, for hashtag prefix matching
}

function buildMatchers(table: Record<string, string[]>): AreaMatcher[] {
  const out: AreaMatcher[] = [];
  for (const [name, aliases] of Object.entries(table)) {
    for (const alias of [name.toLowerCase(), ...aliases]) {
      const pattern = alias
        .replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
        .replace(/[\s-]+/g, "[\\s-]*");
      out.push({
        name,
        re: new RegExp(`(?<![a-z])${pattern}(?![a-z])`, "i"),
        tag: alias.replace(/[^a-z0-9]/g, ""),
      });
    }
  }
  return out;
}

const AREA_MATCHERS = buildMatchers(AREAS);
const CITY_MATCHERS = buildMatchers(CITIES);

function findEarliest(text: string, matchers: AreaMatcher[]): (Span & { name: string }) | null {
  const hashtags = [...text.matchAll(/#(\w+)/g)].map((h) => ({ tag: h[1].toLowerCase(), index: h.index ?? 0 }));
  let best: { name: string; index: number; len: number; end: number } | null = null;

  for (const m of matchers) {
    const hit = m.re.exec(text);
    let index = hit ? hit.index : -1;
    let end = hit ? hit.index + hit[0].length : -1;
    // "#ajahapartments" style hashtags: match on prefix (aliases of 4+ chars only).
    if (index < 0 && m.tag.length >= 4) {
      const h = hashtags.find((h) => h.tag.startsWith(m.tag));
      if (h) {
        index = h.index;
        end = h.index + 1 + h.tag.length;
      }
    }
    if (index < 0) continue;
    // Earliest mention wins; at the same position the longer, more specific alias wins.
    if (!best || index < best.index || (index === best.index && m.tag.length > best.len)) {
      best = { name: m.name, index, len: m.tag.length, end };
    }
  }
  return best ? { name: best.name, start: best.index, end: best.end } : null;
}

/** Most specific known area mentioned in the text, falling back to the city. */
export function parseArea(text: string): string | null {
  return findAreaHit(text)?.name ?? null;
}

function findAreaHit(text: string) {
  return findEarliest(text, AREA_MATCHERS) ?? findEarliest(text, CITY_MATCHERS);
}

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

// Nigerian mobiles: 0803 123 4567, +234 803 123 4567, 2348031234567, wa.me/234...
const PHONE_RE = /(?<!\d)(?:\+?\s?234[\s-]?|0)([789][01]\d)[\s-]?(\d{3})[\s-]?(\d{4})(?!\d)/g;

/** All Nigerian mobile numbers in the text, normalised to +234XXXXXXXXXX, deduped. */
export function parsePhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) found.add(`+234${m[1]}${m[2]}${m[3]}`);
  return [...found];
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

/** Parse a caption, using the creator bio as a fallback source of contact info. */
export function parseListing(caption: string, bio = ""): ParsedListing {
  const price = parsePrice(caption);
  const phones = parsePhones(caption);
  const contact = phones.length ? phones : parsePhones(bio);
  const power = parsePower(caption);
  return {
    price_raw: price?.raw ?? null,
    price_ngn: price?.ngn ?? null,
    price_period: price?.period ?? null,
    area: parseArea(caption),
    bedrooms: parseBedrooms(caption),
    phone: contact.length ? contact.join(", ") : null,
    power_level: power.level,
    power_raw: power.raw,
    total_package_ngn: parseTotalPackage(caption),
  };
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

/** Character spans of the facts the parser found, sorted and non-overlapping (overlaps merge). */
export function findHighlights(caption: string): Span[] {
  const spans: Span[] = [];
  const price = findPrice(caption);
  if (price) spans.push({ start: price.start, end: price.periodSpan?.end ?? price.end });
  const area = findAreaHit(caption);
  if (area) spans.push({ start: area.start, end: area.end });
  const beds = findBedrooms(caption);
  if (beds) spans.push({ start: beds.start, end: beds.end });
  const power = findPower(caption);
  if (power) spans.push({ start: power.start, end: power.end });
  const pkg = findPackage(caption);
  if (pkg) spans.push({ start: pkg.start, end: pkg.end });
  for (const m of caption.matchAll(PHONE_RE)) spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });

  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}
