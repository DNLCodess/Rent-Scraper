import "server-only";
import { ScraperError, type JobState, type RawVideo, type Scraper, type SearchTerm, type StartedJob } from "./types";

/**
 * Apify provider using the "clockworks/tiktok-scraper" actor over the REST API.
 * Docs: https://docs.apify.com/api/v2 and https://apify.com/clockworks/tiktok-scraper
 */

const API = "https://api.apify.com/v2";
const ACTOR = process.env.APIFY_ACTOR || "clockworks~tiktok-scraper";

// Subset of the actor's output item that we use.
interface ApifyItem {
  id?: string | number;
  text?: string;
  createTime?: number;
  createTimeISO?: string;
  diggCount?: number;
  webVideoUrl?: string;
  authorMeta?: { name?: string; signature?: string };
  videoMeta?: { coverUrl?: string; originalCoverUrl?: string };
  errorCode?: string;
}

/**
 * Ad-hoc webhook (docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks): a `webhooks`
 * query parameter holding a base64 JSON array. Only added when APP_URL and APIFY_WEBHOOK_SECRET
 * are set; polling still works without it.
 */
export function webhooksParam(): string {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!base || !secret) return "";
  const hooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: `${base}/api/webhooks/apify?secret=${encodeURIComponent(secret)}`,
    },
  ];
  return `&webhooks=${encodeURIComponent(Buffer.from(JSON.stringify(hooks)).toString("base64"))}`;
}

/** Normalises one actor item; null for error items and non-video results (e.g. profiles from keyword search). */
export function toRawVideo(it: ApifyItem): RawVideo | null {
  if (it.errorCode || !it.id || !it.authorMeta?.name) return null;
  const author = it.authorMeta.name;
  const id = String(it.id);
  return {
    id,
    url: it.webVideoUrl || `https://www.tiktok.com/@${author}/video/${id}`,
    author,
    caption: it.text ?? "",
    postedAt: it.createTimeISO ?? (it.createTime ? new Date(it.createTime * 1000).toISOString() : null),
    likes: it.diggCount ?? null,
    bio: it.authorMeta.signature || null,
    coverUrl: it.videoMeta?.coverUrl ?? it.videoMeta?.originalCoverUrl ?? null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-request limit: a hung Apify request is abandoned (and retried) instead of blocking the caller. */
export const REQUEST_TIMEOUT_MS = 15_000;

export class ApifyScraper implements Scraper {
  constructor(
    private token: string,
    private opts: { timeoutMs?: number; retryBaseMs?: number } = {},
  ) {}

  /** fetch with retries + exponential backoff on network errors, 429 and 5xx. */
  private async call<T>(path: string, init: RequestInit = {}, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      const base = this.opts.retryBaseMs ?? 1000;
      if (i > 0) await sleep(base * 2 ** (i - 1) + Math.random() * (base / 2));
      let res: Response;
      try {
        res = await fetch(`${API}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init.headers },
          cache: "no-store",
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        lastError = e;
        continue;
      }
      let body: string;
      try {
        if (res.ok) return (await res.json()) as T;
        body = await res.text();
      } catch (e) {
        lastError = e; // body read timed out or was cut off
        continue;
      }
      if (res.status === 401) {
        throw new ScraperError("TOKEN_INVALID", "Your Apify API token is invalid or expired. Update it in Settings.");
      }
      if (res.status === 402 || res.status === 403 || (res.status === 400 && /usage|credit/i.test(body))) {
        throw new ScraperError(
          "QUOTA",
          "Apify refused the run: the account is out of credit or over its usage limit. Check your Apify billing.",
        );
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Apify ${res.status}`);
        continue;
      }
      throw new ScraperError("PROVIDER", `Apify request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    throw new ScraperError("PROVIDER", `Could not reach Apify after ${attempts} attempts (${String(lastError)}).`);
  }

  async start(term: SearchTerm, count: number): Promise<StartedJob> {
    const input = {
      ...(term.kind === "hashtag" ? { hashtags: [term.value] } : { searchQueries: [term.value] }),
      resultsPerPage: count,
      // No media downloads: we only need metadata, and downloads are charged add-ons.
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
    };
    // maxItems caps what the run can return (and bill) regardless of input.
    const { data } = await this.call<{ data: { id: string; defaultDatasetId: string } }>(
      `/acts/${ACTOR}/runs?maxItems=${count}${webhooksParam()}`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return { jobId: data.id, datasetId: data.defaultDatasetId };
  }

  async status(job: StartedJob): Promise<JobState> {
    const [{ data: run }, { data: ds }] = await Promise.all([
      this.call<{ data: { status: string; statusMessage?: string } }>(`/actor-runs/${job.jobId}`),
      this.call<{ data: { itemCount: number } }>(`/datasets/${job.datasetId}`),
    ]);
    if (run.status === "SUCCEEDED") return { status: "succeeded", itemCount: ds.itemCount };
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(run.status)) {
      return {
        status: "failed",
        itemCount: ds.itemCount,
        error: new ScraperError("PROVIDER", `Apify run ${run.status.toLowerCase()}: ${run.statusMessage ?? "no details"}`),
      };
    }
    return { status: "running", itemCount: ds.itemCount }; // READY, RUNNING, TIMING-OUT, ABORTING
  }

  async items(job: StartedJob): Promise<RawVideo[]> {
    const fields = "id,text,createTime,createTimeISO,diggCount,webVideoUrl,authorMeta,videoMeta,errorCode";
    const items = await this.call<ApifyItem[]>(`/datasets/${job.datasetId}/items?clean=true&format=json&fields=${fields}`);
    return items.map(toRawVideo).filter((v): v is RawVideo => v !== null);
  }
}
