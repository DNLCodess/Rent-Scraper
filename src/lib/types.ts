/** Types shared by the API routes and the client UI. */

import type { PowerLevel } from "./parser";

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

export type ListingStatus =
  | "new"
  | "dismissed"
  | "shortlisted"
  | "messaged"
  | "inspection_booked"
  | "inspected"
  | "negotiating"
  | "got_it"
  | "dropped";

export interface InboxItem extends Listing {
  status: ListingStatus;
  power_level: PowerLevel;
  /** The caption's power phrase, e.g. "24/7 light, Band A"; null when none was found. */
  power_raw: string | null;
  total_package_ngn: number | null;
  first_seen_at: string;
  checkManually: boolean;
  probablyTaken: boolean;
  strongMatch: boolean;
}

export interface InboxResponse {
  items: InboxItem[];
  newToday: number;
  matchCount: number;
  hiddenCount: number;
}

export type HideReasonCode =
  | "excluded_area"
  | "blocked_author"
  | "over_budget"
  | "under_budget"
  | "bedrooms"
  | "shortlet"
  | "power_required";

export type DropReason = "too_expensive" | "bad_area" | "agent_ghosted" | "fake_listing" | "taken" | "other";

export const DROP_REASONS: DropReason[] = [
  "too_expensive",
  "bad_area",
  "agent_ghosted",
  "fake_listing",
  "taken",
  "other",
];

export type ListingAction =
  | { type: "dismiss" }
  | { type: "shortlist" }
  | { type: "messaged" }
  | { type: "replied" }
  | { type: "book_inspection"; at: string }
  | {
      type: "log_inspection";
      powerConfirmed: string;
      note?: string;
      next: "negotiating" | "dropped";
      dropReason?: DropReason;
    }
  | { type: "offer"; offer: number | null; counter: number | null }
  | { type: "drop"; reason: DropReason }
  | { type: "got_it" }
  | { type: "undo" };

export interface Note {
  id: string;
  listing_id: string;
  body: string;
  created_at: string;
}

export interface ListingDetail extends InboxItem {
  notes: Note[];
  status_changed_at: string | null;
  inspection_at: string | null;
  offer_ngn: number | null;
  counter_ngn: number | null;
  power_confirmed: string | null;
  replied_at: string | null;
  drop_reason: DropReason | null;
  highlights: Array<{ start: number; end: number }>;
}

export type TrackerStage = "shortlisted" | "messaged" | "inspection_booked" | "inspected" | "negotiating";

export interface TrackerView {
  activeCount: number;
  thisWeek: { inspections: ListingDetail[]; nudges: ListingDetail[] };
  stages: Record<TrackerStage, ListingDetail[]>;
}
