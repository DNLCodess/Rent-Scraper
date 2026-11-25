import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * libSQL database. Locally this is a plain SQLite file (DATABASE_URL=file:data/app.db);
 * on Vercel point DATABASE_URL at a Turso database and set DATABASE_AUTH_TOKEN.
 */

const url = process.env.DATABASE_URL || "file:data/app.db";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    tags TEXT NOT NULL,            -- JSON array of search terms
    count INTEGER NOT NULL,        -- videos requested per term
    status TEXT NOT NULL,          -- queued | running | done | failed
    created_at TEXT NOT NULL,
    finished_at TEXT,
    error TEXT,
    error_code TEXT,
    jobs TEXT NOT NULL DEFAULT '[]', -- JSON array of scraper jobs, one per term
    scraped INTEGER NOT NULL DEFAULT 0,
    result_count INTEGER NOT NULL DEFAULT 0
  )`,
  // One row per TikTok video, deduplicated across runs (F7).
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,           -- TikTok video ID
    run_id TEXT NOT NULL,          -- run that first found it
    tag TEXT NOT NULL,
    url TEXT NOT NULL,
    author TEXT NOT NULL,
    caption TEXT NOT NULL,
    posted_at TEXT,
    likes INTEGER,
    price_raw TEXT,
    price_ngn INTEGER,
    price_period TEXT,
    area TEXT,
    bedrooms INTEGER,
    phone TEXT,
    bio TEXT,
    updated_at TEXT NOT NULL
  )`,
  // Which listings each run returned (a video can appear in many runs).
  `CREATE TABLE IF NOT EXISTS run_listings (
    run_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (run_id, listing_id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

/** Returns a connected client with the schema applied. */
export async function db(): Promise<Client> {
  if (!client) {
    if (url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  ready ??= client.batch(SCHEMA, "write").then(() => undefined);
  await ready;
  return client;
}

export type Args = InValue[];
