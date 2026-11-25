/** Types shared by the API routes and the client UI. */

export type RunStatus = "queued" | "running" | "done" | "failed";

export interface Run {
  id: string;
  tags: string[];
  count: number;
  status: RunStatus;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  error_code: string | null;
  scraped: number; // videos collected so far
  target: number; // count * number of tags
  result_count: number;
}

export interface Listing {
  id: string;
  tag: string;
  url: string;
  author: string;
  caption: string;
  posted_at: string | null;
  likes: number | null;
  price_raw: string | null;
  price_ngn: number | null;
  price_period: "year" | "month" | "night" | null;
  area: string | null;
  bedrooms: number | null;
  phone: string | null;
  bio: string | null;
  seen_before: boolean; // first found by an earlier run
}

export interface ListingFilters {
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  area?: string;
  beds?: string; // "0".."3" or "4+"
  maxAgeDays?: number;
  hasPrice?: boolean;
}

export interface ListingsResponse {
  listings: Listing[];
  total: number; // unfiltered count for this run
  areas: string[]; // distinct areas in this run, for the filter
}

export interface SettingsView {
  provider: "apify" | "mock";
  tokenSet: boolean;
  tokenSource: "settings" | "env" | null;
  tokenPreview: string | null; // masked, e.g. "••••a1b2"
  defaultCount: number;
  defaultTags: string[];
}

export const MAX_COUNT = 100;
export const MAX_TAGS = 5;
export const COUNT_OPTIONS = [10, 30, 50, 100];
