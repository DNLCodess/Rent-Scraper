import { describe, expect, it } from "vitest";
import { parseArea, parseBedrooms, parseListing, parsePhones, parsePrice } from "./parser";

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
    ["NGN 2.2M total package", 2_200_000, null],
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
