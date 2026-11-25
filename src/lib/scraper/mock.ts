import type { JobState, RawVideo, Scraper, SearchTerm, StartedJob } from "./types";

/**
 * Offline provider for development and demos (SCRAPER_PROVIDER=mock).
 * Simulates a ~8 second job and returns realistic sample captions, at no cost.
 */

const DURATION_MS = 8000;

const SAMPLES: { caption: string; author: string; bio: string }[] = [
  { caption: "2 bedroom flat in Yaba ₦1.5m per annum. Call 08031234567 #lagosapartments", author: "yabahomes", bio: "Agent in Yaba" },
  { caption: "Mini flat at Akoka N800k yearly 🏠 #houseforrent", author: "akokarentals", bio: "WhatsApp 07031234567" },
  { caption: "3 bedroom duplex Lekki Phase 1, rent 7.5m, caution 500k #lekkiapartments", author: "lekkiliving", bio: "Realtor | 08161234567" },
  { caption: "Self contain at Bodija Ibadan #350k/yr 📍", author: "ibadanhomes", bio: "Ibadan properties" },
  { caption: "Shortlet in Ikoyi ₦85,000 per night. DM to book", author: "ikoyistays", bio: "Bookings: +234 905 123 4567" },
  { caption: "Room and parlour Surulere 450k per annum #surulere", author: "surulererent", bio: "" },
  { caption: "Beautiful 4 bedroom terrace for rent in Ikeja GRA, 6m. Inspection 10k", author: "ikejaproperties", bio: "0802 123 4567" },
  { caption: "Two bedroom flat Gbagada ₦2,200,000 annual. Agency 10% legal 10%", author: "gbagadahomes", bio: "Gbagada agent" },
  { caption: "Newly built 2bed in Ajah. DM for price 🙏 #ajahapartments", author: "ajahhomes", bio: "WhatsApp only 09031234567" },
  { caption: "Studio apartment Victoria Island N3.5m/yr serviced", author: "vihomes", bio: "" },
  { caption: "1 bedroom apartment Magodo 1.8 million naira per year", author: "magodorent", bio: "Call 08091234567" },
  { caption: "House tour 🏡 #fyp #lagos", author: "lagosvlogs", bio: "Lifestyle" },
];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export class MockScraper implements Scraper {
  async start(term: SearchTerm, count: number): Promise<StartedJob> {
    const jobId = ["mock", Date.now(), count, encodeURIComponent(term.value)].join(":");
    return { jobId, datasetId: jobId };
  }

  async status(job: StartedJob): Promise<JobState> {
    const [, startedAt, count] = job.jobId.split(":");
    const progress = Math.min(1, (Date.now() - Number(startedAt)) / DURATION_MS);
    return { status: progress >= 1 ? "succeeded" : "running", itemCount: Math.floor(progress * Number(count)) };
  }

  async items(job: StartedJob): Promise<RawVideo[]> {
    const [, , count, term] = job.jobId.split(":");
    const seed = hash(decodeURIComponent(term));
    return Array.from({ length: Number(count) }, (_, i) => {
      const s = SAMPLES[(seed + i) % SAMPLES.length];
      // Stable IDs per term + index so repeated runs exercise de-duplication.
      const id = `7300${String(seed % 100_000).padStart(5, "0")}${String(i).padStart(10, "0")}`;
      return {
        id,
        url: `https://www.tiktok.com/@${s.author}/video/${id}`,
        author: s.author,
        caption: s.caption,
        postedAt: new Date(Date.now() - ((seed + i * 7919) % 120) * 86_400_000).toISOString(),
        likes: (seed + i * 104729) % 25_000,
        bio: s.bio || null,
        coverUrl: null,
      };
    });
  }
}
