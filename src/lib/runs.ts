import "server-only";
import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db, type Args } from "./db";
import { parseListing } from "./parser";
import { getScraper } from "./settings";
import { ScraperError, termLabel, toSearchTerm, type RawVideo, type SearchTerm } from "./scraper/types";
import { MAX_COUNT, MAX_TAGS, type Listing, type ListingFilters, type Run } from "./types";

/**
 * Run lifecycle. There is no background worker: each status poll
 * (GET /api/runs/:id) advances the run by checking its scraper jobs and
 * ingesting finished ones. This works on serverless hosts like Vercel.
 */

interface Job {
  term: SearchTerm;
  jobId: string;
  datasetId: string;
  status: "running" | "succeeded" | "failed";
  itemCount: number;
  ingested: boolean;
  error?: string;
}

export class InputError extends Error {}

const now = () => new Date().toISOString();

function rowToRun(r: Row): Run {
  const tags = JSON.parse(r.tags as string) as string[];
  return {
    id: r.id as string,
    tags,
    count: Number(r.count),
    status: r.status as Run["status"],
    created_at: r.created_at as string,
    finished_at: (r.finished_at as string) ?? null,
    error: (r.error as string) ?? null,
    error_code: (r.error_code as string) ?? null,
    scraped: Number(r.scraped),
    target: Number(r.count) * tags.length,
    result_count: Number(r.result_count),
  };
}

export async function getRun(id: string): Promise<Run | null> {
  const r = await (await db()).execute({ sql: "SELECT * FROM runs WHERE id = ?", args: [id] });
  return r.rows[0] ? rowToRun(r.rows[0]) : null;
}

export async function listRuns(limit = 50): Promise<Run[]> {
  const r = await (await db()).execute({ sql: "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", args: [limit] });
  return r.rows.map(rowToRun);
}

async function failRun(id: string, err: unknown) {
  const e = err instanceof ScraperError ? err : new ScraperError("PROVIDER", String(err));
  await (await db()).execute({
    sql: "UPDATE runs SET status = 'failed', error = ?, error_code = ?, finished_at = ? WHERE id = ?",
    args: [e.message, e.code, now(), id],
  });
}

/** Validate input, record the run and start one scraper job per term. */
export async function createRun(
  rawTags: unknown,
  rawCount: unknown,
  source: "manual" | "scheduled" = "manual",
): Promise<Run> {
  if (!Array.isArray(rawTags)) throw new InputError("tags must be an array");
  const terms = rawTags.map((t) => toSearchTerm(String(t))).filter((t): t is SearchTerm => !!t);
  // Dedupe by label.
  const unique = [...new Map(terms.map((t) => [termLabel(t), t])).values()];
  if (unique.length === 0) throw new InputError("Add at least one hashtag or keyword.");
  if (unique.length > MAX_TAGS) throw new InputError(`Use at most ${MAX_TAGS} tags per run.`);
  const count = Math.floor(Number(rawCount));
  if (!(count >= 1 && count <= MAX_COUNT)) throw new InputError(`Count must be between 1 and ${MAX_COUNT}.`);

  const id = randomUUID();
  const c = await db();
  await c.execute({
    sql: "INSERT INTO runs (id, tags, count, status, created_at, source) VALUES (?, ?, ?, 'queued', ?, ?)",
    args: [id, JSON.stringify(unique.map(termLabel)), count, now(), source],
  });

  try {
    const scraper = await getScraper();
    const jobs: Job[] = [];
    for (const term of unique) {
      const started = await scraper.start(term, count);
      jobs.push({ term, ...started, status: "running", itemCount: 0, ingested: false });
    }
    await c.execute({
      sql: "UPDATE runs SET status = 'running', jobs = ? WHERE id = ?",
      args: [JSON.stringify(jobs), id],
    });
  } catch (err) {
    await failRun(id, err);
  }
  return (await getRun(id))!;
}

/** Upsert scraped videos and link them to the run. Re-parses every time so parser fixes apply. */
async function ingest(runId: string, tag: string, videos: RawVideo[]) {
  const ts = now();
  const stmts = videos.flatMap((v) => {
    const p = parseListing(v.caption, v.bio ?? "");
    return [
      {
        sql: `INSERT INTO listings (id, run_id, tag, url, author, caption, posted_at, likes, price_raw, price_ngn,
                price_period, area, bedrooms, phone, bio, updated_at, power_level, power_raw, total_package_ngn,
                first_seen_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                caption = excluded.caption, likes = excluded.likes, bio = COALESCE(excluded.bio, listings.bio),
                price_raw = excluded.price_raw, price_ngn = excluded.price_ngn, price_period = excluded.price_period,
                area = excluded.area, bedrooms = excluded.bedrooms, phone = excluded.phone, updated_at = excluded.updated_at,
                power_level = excluded.power_level, power_raw = excluded.power_raw,
                total_package_ngn = excluded.total_package_ngn`,
        // status, tracker columns and first_seen_at are deliberately never updated on conflict.
        args: [v.id, runId, tag, v.url, v.author, v.caption, v.postedAt, v.likes, p.price_raw, p.price_ngn,
          p.price_period, p.area, p.bedrooms, p.phone, v.bio, ts, p.power_level, p.power_raw, p.total_package_ngn,
          ts] as Args,
      },
      {
        sql: "INSERT OR IGNORE INTO run_listings (run_id, listing_id, tag) VALUES (?, ?, ?)",
        args: [runId, v.id, tag] as Args,
      },
    ];
  });
  if (stmts.length) await (await db()).batch(stmts, "write");
}

/** Check job progress, ingest finished jobs, and finalise the run when all jobs are done. */
export async function advanceRun(id: string): Promise<Run | null> {
  const c = await db();
  const r = await c.execute({ sql: "SELECT * FROM runs WHERE id = ?", args: [id] });
  const row = r.rows[0];
  if (!row) return null;
  if (row.status !== "running") return rowToRun(row);

  const jobs = JSON.parse(row.jobs as string) as Job[];
  try {
    const scraper = await getScraper();
    for (const job of jobs) {
      if (job.status === "running") {
        const state = await scraper.status(job);
        job.status = state.status;
        job.itemCount = state.itemCount;
        if (state.error) job.error = state.error.message;
      }
      if (job.status === "succeeded" && !job.ingested) {
        const videos = await scraper.items(job);
        await ingest(id, termLabel(job.term), videos);
        job.itemCount = videos.length;
        job.ingested = true;
      }
    }
  } catch (err) {
    // Token / quota problems are fatal for the run; surface them right away.
    if (err instanceof ScraperError && err.code !== "PROVIDER") {
      await failRun(id, err);
      return getRun(id);
    }
    throw err;
  }

  const scraped = jobs.reduce((n, j) => n + Math.min(j.itemCount, Number(row.count)), 0);
  const finished = jobs.every((j) => j.status !== "running");
  const failed = jobs.filter((j) => j.status === "failed");
  const resultCount = Number(
    (await c.execute({ sql: "SELECT COUNT(*) AS n FROM run_listings WHERE run_id = ?", args: [id] })).rows[0].n,
  );

  let status = "running";
  let error: string | null = null;
  if (finished) {
    status = failed.length === jobs.length ? "failed" : "done";
    // Partial failures still produce a "done" run, with the error noted.
    error = failed.length ? failed.map((j) => `${termLabel(j.term)}: ${j.error}`).join("; ") : null;
  }
  await c.execute({
    sql: `UPDATE runs SET status = ?, jobs = ?, scraped = ?, result_count = ?, error = ?,
            error_code = CASE WHEN ? IS NULL THEN NULL ELSE 'PROVIDER' END,
            finished_at = CASE WHEN ? = 'running' THEN NULL ELSE ? END
          WHERE id = ?`,
    args: [status, JSON.stringify(jobs), scraped, resultCount, error, error, status, now(), id],
  });
  return getRun(id);
}

/** Advance the run that owns an Apify run id (webhook entry point). Idempotent. */
export async function advanceRunByJobId(jobId: string): Promise<Run | null> {
  // LIKE only narrows candidates (wildcards can over-match); the exact check is below.
  const r = await (await db()).execute({ sql: "SELECT id, jobs FROM runs WHERE jobs LIKE ?", args: [`%${jobId}%`] });
  for (const row of r.rows) {
    const jobs = JSON.parse(row.jobs as string) as Job[];
    if (jobs.some((j) => j.jobId === jobId)) return advanceRun(row.id as string);
  }
  return null;
}

/** Read filter params from a URL query string. */
export function parseFilters(sp: URLSearchParams): ListingFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    return v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  return {
    q: sp.get("q")?.trim() || undefined,
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    area: sp.get("area") || undefined,
    beds: sp.get("beds") || undefined,
    maxAgeDays: num("maxAgeDays"),
    hasPrice: sp.get("hasPrice") === "1" || undefined,
  };
}

function rowToListing(r: Row, runId: string): Listing {
  return {
    id: r.id as string,
    tag: r.tag as string,
    url: r.url as string,
    author: r.author as string,
    caption: r.caption as string,
    posted_at: (r.posted_at as string) ?? null,
    likes: r.likes === null ? null : Number(r.likes),
    price_raw: (r.price_raw as string) ?? null,
    price_ngn: r.price_ngn === null ? null : Number(r.price_ngn),
    price_period: (r.price_period as Listing["price_period"]) ?? null,
    area: (r.area as string) ?? null,
    bedrooms: r.bedrooms === null ? null : Number(r.bedrooms),
    phone: (r.phone as string) ?? null,
    bio: (r.bio as string) ?? null,
    seen_before: r.run_id !== runId,
  };
}

/** Listings for a run, filtered server-side. */
export async function queryListings(runId: string, f: ListingFilters): Promise<Listing[]> {
  const where = ["rl.run_id = ?"];
  const args: Args = [runId];
  const add = (clause: string, ...values: Args) => {
    where.push(clause);
    args.push(...values);
  };
  if (f.minPrice !== undefined) add("l.price_ngn >= ?", f.minPrice);
  if (f.maxPrice !== undefined) add("l.price_ngn <= ?", f.maxPrice);
  if (f.hasPrice) add("l.price_ngn IS NOT NULL");
  if (f.area) add("l.area = ?", f.area);
  if (f.beds === "4+") add("l.bedrooms >= 4");
  else if (f.beds !== undefined && /^\d+$/.test(f.beds)) add("l.bedrooms = ?", Number(f.beds));
  if (f.maxAgeDays !== undefined) {
    where.push("l.posted_at >= ?");
    args.push(new Date(Date.now() - f.maxAgeDays * 86_400_000).toISOString());
  }
  if (f.q) {
    where.push("(l.caption LIKE ? OR l.author LIKE ? OR l.area LIKE ? OR l.phone LIKE ? OR l.bio LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like, like, like);
  }
  const r = await (await db()).execute({
    sql: `SELECT l.*, rl.tag AS tag FROM listings l JOIN run_listings rl ON rl.listing_id = l.id
          WHERE ${where.join(" AND ")} ORDER BY l.posted_at DESC`,
    args,
  });
  return r.rows.map((row) => rowToListing(row, runId));
}

/** Distinct areas in a run (for the filter dropdown). */
export async function runAreas(runId: string): Promise<string[]> {
  const r = await (await db()).execute({
    sql: `SELECT DISTINCT l.area FROM listings l JOIN run_listings rl ON rl.listing_id = l.id
          WHERE rl.run_id = ? AND l.area IS NOT NULL ORDER BY l.area`,
    args: [runId],
  });
  return r.rows.map((row) => row.area as string);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_COLUMNS: (keyof Listing)[] = [
  "url", "author", "price_ngn", "price_period", "price_raw", "area", "bedrooms", "phone",
  "likes", "posted_at", "tag", "caption", "bio",
];
// Free-text columns written by TikTok users: neutralise spreadsheet formulas.
const UNTRUSTED = new Set<keyof Listing>(["author", "caption", "bio", "price_raw", "tag"]);

function csvCell(key: keyof Listing, value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (UNTRUSTED.has(key) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(listings: Listing[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const l of listings) lines.push(CSV_COLUMNS.map((k) => csvCell(k, l[k])).join(","));
  // BOM so Excel opens UTF-8 (₦, emoji) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
