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
  errorCode?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApifyScraper implements Scraper {
  constructor(private token: string) {}

  /** fetch with retries + exponential backoff on network errors, 429 and 5xx. */
  private async call<T>(path: string, init: RequestInit = {}, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await sleep(1000 * 2 ** (i - 1) + Math.random() * 500);
      let res: Response;
      try {
        res = await fetch(`${API}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init.headers },
          cache: "no-store",
        });
      } catch (e) {
        lastError = e;
        continue;
      }
      if (res.ok) return (await res.json()) as T;

      const body = await res.text();
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
      `/acts/${ACTOR}/runs?maxItems=${count}`,
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
    const fields = "id,text,createTime,createTimeISO,diggCount,webVideoUrl,authorMeta,errorCode";
    const items = await this.call<ApifyItem[]>(`/datasets/${job.datasetId}/items?clean=true&format=json&fields=${fields}`);
    const videos: RawVideo[] = [];
    for (const it of items) {
      // Skip error items and non-video results (e.g. profiles from keyword search).
      if (it.errorCode || !it.id || !it.authorMeta?.name) continue;
      const author = it.authorMeta.name;
      const id = String(it.id);
      videos.push({
        id,
        url: it.webVideoUrl || `https://www.tiktok.com/@${author}/video/${id}`,
        author,
        caption: it.text ?? "",
        postedAt: it.createTimeISO ?? (it.createTime ? new Date(it.createTime * 1000).toISOString() : null),
        likes: it.diggCount ?? null,
        bio: it.authorMeta.signature || null,
      });
    }
    return videos;
  }
}
