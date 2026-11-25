/**
 * Scraper interface. The app only talks to TikTok through this, so the
 * provider (Apify today, something else tomorrow) can be swapped freely.
 * Jobs are asynchronous: start one, poll its status, then fetch its items.
 * This fits serverless hosting, where nothing can run in the background.
 */

/** A search term: "#lagosapartments" / "lagosapartments" is a hashtag, "2 bedroom yaba" is a keyword search. */
export interface SearchTerm {
  kind: "hashtag" | "keyword";
  value: string;
}

export type JobStatus = "running" | "succeeded" | "failed";

export interface JobState {
  status: JobStatus;
  itemCount: number;
  error?: ScraperError;
}

export interface StartedJob {
  jobId: string;
  datasetId: string;
}

/** One TikTok video, normalised. */
export interface RawVideo {
  id: string;
  url: string;
  author: string;
  caption: string;
  postedAt: string | null; // ISO
  likes: number | null;
  bio: string | null;
  coverUrl: string | null;
}

export interface Scraper {
  start(term: SearchTerm, count: number): Promise<StartedJob>;
  status(job: StartedJob): Promise<JobState>;
  items(job: StartedJob): Promise<RawVideo[]>;
}

export type ScraperErrorCode = "TOKEN_MISSING" | "TOKEN_INVALID" | "QUOTA" | "BLOCKED" | "PROVIDER";

/** Error with a code the UI can turn into a clear, actionable message. */
export class ScraperError extends Error {
  constructor(
    public code: ScraperErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

/** Parse user input like "#LagosApartments" or "2 bedroom yaba". */
export function toSearchTerm(input: string): SearchTerm | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith("#") || !/\s/.test(raw)) {
    const value = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
    return value ? { kind: "hashtag", value } : null;
  }
  return { kind: "keyword", value: raw.replace(/\s+/g, " ") };
}

/** Display label for a term, e.g. "#lagosapartments". */
export function termLabel(term: SearchTerm): string {
  return term.kind === "hashtag" ? `#${term.value}` : term.value;
}
