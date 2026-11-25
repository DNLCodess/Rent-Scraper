import { describe, expect, it } from "vitest";
import {
  areaLineage,
  findHighlights,
  isCity,
  parseArea,
  parseBedrooms,
  parseListing,
  parsePhones,
  parsePower,
  parsePrice,
  parseTotalPackage,
  yearlyRent,
  type PowerLevel,
  type PricePeriod,
} from "./parser";

describe("parsePrice", () => {
  const cases: [string, number | null, string | null][] = [
    ["2 bedroom flat in Yaba ₦1.5m per annum", 1_500_000, "year"],
    ["Mini flat N800k", 800_000, null],
    ["Rent: N 650,000 yearly", 650_000, "year"],
    ["Self contain at Akoka #350k/yr", 350_000, "year"],
    ["3 bedroom duplex Lekki 7.5 million naira per year", 7_500_000, "year"],
    ["Price: 4,500,000 annual rent. Agency 10%", 4_500_000, "year"],
    ["Shortlet in Ikoyi ₦85,000 per night", 85_000, "night"],
    ["Room and parlour Ibadan Bodija 250k", 250_000, null],
    ["NGN 2.2M total package", null, null], // package, not rent (R4)
    ["₦1,200,000/annum 2bed Gbagada", 1_200_000, "year"],
    ["Rent 1.8m, caution 200k, agency 180k", 1_800_000, null],
    ["Caution fee 300k. Rent N2.5m per annum", 2_500_000, "year"],
    ["monthly rent ₦150k per month in Ikeja", 150_000, "month"],
    ["4 bedroom terrace for rent 6m", 6_000_000, null],
    ["1.5mil per annum", 1_500_000, "year"],
    // No price
    ["Beautiful 2 bedroom flat, DM for price", null, null],
    ["#lagosapartments #2bedroom #fyp", null, null],
    ["Call 08031234567 for inspection", null, null],
    ["5k likes thank you", null, null],
  ];

  it.each(cases)("%s", (caption, ngn, period) => {
    const p = parsePrice(caption);
    expect(p?.ngn ?? null).toBe(ngn);
    if (ngn !== null) expect(p?.period ?? null).toBe(period);
  });

  it("keeps the raw matched text", () => {
    expect(parsePrice("Mini flat N800k in Yaba")?.raw).toBe("N800k");
  });
});

describe("parseBedrooms", () => {
  const cases: [string, number | null][] = [
    ["2 bedroom flat in Yaba", 2],
    ["3bedroom duplex", 3],
    ["4-bedroom terrace", 4],
    ["Spacious 2 bed apartment", 2],
    ["3br in Lekki", 3],
    ["two bedroom flat", 2],
    ["Three Bedroom Bungalow", 3],
    ["Self contain in Akoka", 0],
    ["selfcon available", 0],
    ["Studio apartment VI", 0],
    ["Mini flat in Surulere", 1],
    ["Room and parlour Ibadan", 1],
    ["#2bedroomflat #lagos", 2],
    ["Lovely home for rent", null],
  ];
  it.each(cases)("%s", (caption, beds) => {
    expect(parseBedrooms(caption)).toBe(beds);
  });
});

describe("parseArea", () => {
  const cases: [string, string | null][] = [
    ["2 bedroom flat in Yaba", "Yaba"],
    ["Mini flat at Lekki Phase 1", "Lekki Phase 1"],
    ["Ikoyi shortlet", "Ikoyi"],
    ["Duplex in Victoria Island", "Victoria Island"],
    ["Self con at Bodija Ibadan", "Bodija"],
    ["House for rent #ajahapartments", "Ajah"],
    ["Apartment in GRA Ikeja", "Ikeja GRA"],
    ["Flat in Ikeja", "Ikeja"],
    ["#lagosapartments nice place", "Lagos"],
    ["Beautiful home for rent", null],
  ];
  it.each(cases)("%s", (caption, area) => {
    expect(parseArea(caption)).toBe(area);
  });
});

describe("parsePhones", () => {
  it("normalises local and international numbers", () => {
    expect(parsePhones("Call 08031234567")).toEqual(["+2348031234567"]);
    expect(parsePhones("WhatsApp +234 803 123 4567")).toEqual(["+2348031234567"]);
    expect(parsePhones("wa.me/2349051234567")).toEqual(["+2349051234567"]);
    expect(parsePhones("0703-123-4567 or 0816 123 4567")).toEqual([
      "+2347031234567",
      "+2348161234567",
    ]);
  });
  it("dedupes and ignores prices", () => {
    expect(parsePhones("08031234567 08031234567 rent 1,500,000")).toEqual(["+2348031234567"]);
    expect(parsePhones("Rent N800,000")).toEqual([]);
  });
});

describe("parseListing", () => {
  it("falls back to the creator bio for contact", () => {
    const r = parseListing("2 bedroom flat in Yaba ₦1.5m per annum", "Agent | WhatsApp 08031234567");
    expect(r).toMatchObject({
      price_ngn: 1_500_000,
      price_period: "year",
      area: "Yaba",
      bedrooms: 2,
      phone: "+2348031234567",
    });
  });
  it("prefers caption contact over bio", () => {
    const r = parseListing("Call 07031234567", "08031234567");
    expect(r.phone).toBe("+2347031234567");
  });
});

describe("parsePower", () => {
  const cases: [string, PowerLevel][] = [
    ["24/7 light, Band A", "strong"],
    ["24hrs power", "strong"],
    ["constant light", "strong"],
    ["estate power", "strong"],
    ["dedicated transformer", "strong"],
    ["prepaid meter", "mentioned"],
    ["solar and inverter", "mentioned"],
    ["Beautiful flat", "unknown"],
    ["Band Aid", "unknown"],
    ["24/7 security", "unknown"],
    ["24hrs water supply", "unknown"],
    ["within 24 hours", "unknown"],
    ["plenty of natural light", "unknown"],
    ["light blue tiles", "unknown"],
    ["power of attorney", "unknown"],
    ["gen set and meter", "unknown"],
  ];
  it.each(cases)("%s -> %s", (text, level) => {
    const r = parsePower(text);
    expect(r.level).toBe(level);
    if (level === "unknown") expect(r.raw).toBeNull();
    else expect(text.toLowerCase()).toContain(r.raw!.toLowerCase());
  });
  it("returns the matched phrase", () => {
    expect(parsePower("Nice flat, 24/7 light, Band A").raw).toBe("24/7 light");
  });
});

describe("parseTotalPackage", () => {
  const cases: [string, number | null][] = [
    ["Total package ₦1.95m", 1_950_000],
    ["package: 2.2m", 2_200_000],
    ["total: ₦2m", 2_000_000],
    ["Rent 1.5m, agency 10%, legal 10%", null],
    ["NGN 2.2M total package", 2_200_000],
  ];
  it.each(cases)("%s -> %s", (text, want) => {
    expect(parseTotalPackage(text)).toBe(want);
  });
});

describe("yearlyRent", () => {
  const cases: [number | null, PricePeriod | null, number | null][] = [
    [1_500_000, "year", 1_500_000],
    [150_000, "month", 1_800_000],
    [85_000, "night", null],
    [800_000, null, 800_000],
    [null, "year", null],
  ];
  it.each(cases)("%s %s -> %s", (n, p, want) => {
    expect(yearlyRent(n, p)).toBe(want);
  });
});

describe("areaLineage / isCity", () => {
  it("walks to parents", () => {
    expect(areaLineage("Lekki Phase 1")).toEqual(["Lekki Phase 1", "Lekki"]);
    expect(areaLineage("Ibeju-Lekki")).toEqual(["Ibeju-Lekki"]);
    expect(areaLineage("Yaba")).toEqual(["Yaba"]);
    expect(areaLineage("Nowhere")).toEqual(["Nowhere"]);
  });
  it("knows cities", () => {
    expect(isCity("Lagos")).toBe(true);
    expect(isCity("Yaba")).toBe(false);
  });
});

describe("findHighlights", () => {
  it("returns sorted spans for the key facts", () => {
    const c = "2 bedroom flat in Yaba, 24/7 light. Rent ₦1.5m per annum";
    const spans = findHighlights(c);
    const texts = spans.map((s) => c.slice(s.start, s.end));
    expect(texts.slice(0, 3)).toEqual(["2 bedroom", "Yaba", "24/7 light"]);
    expect(texts[3]).toContain("₦1.5m");
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
  });
  it("is empty when nothing is found", () => {
    expect(findHighlights("hello")).toEqual([]);
  });
});

describe("total package in parseListing", () => {
  it("captures the package without changing rent", () => {
    const r = parseListing("2 bedroom Yaba. Rent 1.5m per annum. Total package ₦1.95m");
    expect(r.price_ngn).toBe(1_500_000);
    expect(r.total_package_ngn).toBe(1_950_000);
  });
  it("package-only caption has no rent", () => {
    const r = parseListing("Yaba flat. Total package ₦1.95m");
    expect(r.price_ngn).toBeNull();
    expect(r.price_raw).toBeNull();
    expect(r.price_period).toBeNull();
    expect(r.total_package_ngn).toBe(1_950_000);
  });
  it("is null when not stated", () => {
    expect(parseListing("Rent ₦1.5m").total_package_ngn).toBeNull();
  });
  it("carries power fields", () => {
    expect(parseListing("Yaba 24/7 light").power_level).toBe("strong");
    expect(parseListing("Yaba flat").power_raw).toBeNull();
  });
});
