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
}

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
const RENT_HINT = /\b(rent|price|amount|cost|annual|yearly|per annum|total)\b/i;
const FEE_HINT = /\b(caution|agency|agent|agreement|legal|service\s*charge|inspection|deposit|commission|fees?)\b/i;

function detectPeriod(after: string): PricePeriod | null {
  // Only look until the next number so we don't borrow another figure's period.
  const window = after.slice(0, 30).split(/\d/)[0];
  for (const [period, re] of PERIOD_PATTERNS) if (re.test(window)) return period;
  return null;
}

/** Returns the most likely rent figure in the text, or null. */
export function parsePrice(text: string): ParsedPrice | null {
  let best: (ParsedPrice & { score: number }) | null = null;

  for (const m of text.matchAll(PRICE_RE)) {
    const { cur, num, suf } = m.groups ?? {};
    const hasComma = num.includes(",");
    // A bare number like "2" or "08031234567" is not a price.
    if (!cur && !suf && !hasComma) continue;

    const ngn = Math.round(parseFloat(num.replace(/,/g, "")) * (suf ? MULTIPLIER[suf.toLowerCase()] : 1));
    if (ngn < MIN_PRICE || ngn > MAX_PRICE) continue;

    const start = m.index ?? 0;
    const end = start + m[0].length;
    // Context before the figure, cut at the previous number or clause break.
    const before = text.slice(Math.max(0, start - 30), start).split(/[\d.,;|\n]/).pop() ?? "";
    let score = 0;
    if (RENT_HINT.test(before)) score += 2;
    if (FEE_HINT.test(before)) score -= 3;

    if (!best || score > best.score) {
      best = { raw: m[0].trim(), ngn, period: detectPeriod(text.slice(end)), score };
    }
  }

  if (!best) return null;
  return { raw: best.raw, ngn: best.ngn, period: best.period };
}

// ---------------------------------------------------------------------------
// Bedrooms
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** Number of bedrooms; 0 = studio / self contain. Null if not stated. */
export function parseBedrooms(text: string): number | null {
  const digit = text.match(/(?<![a-z0-9])(\d{1,2})\s*-?\s*(?:bedroom|bdrm|bdr|bed|br\b)/i);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 10) return n;
  }
  const word = text.match(/\b(one|two|three|four|five|six|seven)\s*-?\s*(?:bedroom|bed\b)/i);
  if (word) return WORD_NUMBERS[word[1].toLowerCase()];
  if (/mini\s*-?\s*flat|room\s*(?:and|&|n)\s*parlou?r/i.test(text)) return 1;
  if (/self\s*-?\s*con(?:tain(?:ed)?)?\b|\bstudio\b/i.test(text)) return 0;
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

function findEarliest(text: string, matchers: AreaMatcher[]): string | null {
  const hashtags = [...text.matchAll(/#(\w+)/g)].map((h) => ({ tag: h[1].toLowerCase(), index: h.index ?? 0 }));
  let best: { name: string; index: number; len: number } | null = null;

  for (const m of matchers) {
    let index = text.search(m.re);
    // "#ajahapartments" style hashtags: match on prefix (aliases of 4+ chars only).
    if (index < 0 && m.tag.length >= 4) {
      const h = hashtags.find((h) => h.tag.startsWith(m.tag));
      if (h) index = h.index;
    }
    if (index < 0) continue;
    // Earliest mention wins; at the same position the longer, more specific alias wins.
    if (!best || index < best.index || (index === best.index && m.tag.length > best.len)) {
      best = { name: m.name, index, len: m.tag.length };
    }
  }
  return best?.name ?? null;
}

/** Most specific known area mentioned in the text, falling back to the city. */
export function parseArea(text: string): string | null {
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
  return {
    price_raw: price?.raw ?? null,
    price_ngn: price?.ngn ?? null,
    price_period: price?.period ?? null,
    area: parseArea(caption),
    bedrooms: parseBedrooms(caption),
    phone: contact.length ? contact.join(", ") : null,
  };
}
