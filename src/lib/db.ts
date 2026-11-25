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

const NEW_TABLES = [
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)`, // JSON values
  `CREATE TABLE IF NOT EXISTS blocked_authors (handle TEXT PRIMARY KEY, blocked_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY,
    terms TEXT NOT NULL,           -- JSON array of search terms
    count INTEGER NOT NULL,
    daily INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
];

/** Adds a column when the table does not have it yet (SQLite has no ADD COLUMN IF NOT EXISTS). */
export async function addColumnIfMissing(
  c: Client,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await c.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === column)) return;
  await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

const LISTING_COLUMNS: [string, string][] = [
  ["status", "TEXT NOT NULL DEFAULT 'new'"],
  ["status_changed_at", "TEXT"],
  ["first_seen_at", "TEXT"],
  ["drop_reason", "TEXT"],
  ["power_level", "TEXT NOT NULL DEFAULT 'unknown'"],
  ["power_raw", "TEXT"],
  ["total_package_ngn", "INTEGER"],
  ["inspection_at", "TEXT"], // ISO with offset
  ["offer_ngn", "INTEGER"],
  ["counter_ngn", "INTEGER"],
  ["power_confirmed", "TEXT"],
  ["replied_at", "TEXT"],
  ["archived", "INTEGER NOT NULL DEFAULT 0"],
  ["prev_status", "TEXT"],
];

/** Creates tables, adds v2 columns and backfills. Safe to run repeatedly. */
export async function migrate(c: Client): Promise<void> {
  await c.batch([...SCHEMA, ...NEW_TABLES], "write");
  for (const [col, ddl] of LISTING_COLUMNS) await addColumnIfMissing(c, "listings", col, ddl);
  await addColumnIfMissing(c, "runs", "source", "TEXT NOT NULL DEFAULT 'manual'");
  await c.execute("UPDATE listings SET first_seen_at = updated_at WHERE first_seen_at IS NULL");
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

/** Returns a connected client with the schema applied. */
export async function db(): Promise<Client> {
  if (!client) {
    if (url.startsWith("file:") && !url.includes(":memory:")) {
      mkdirSync(dirname(url.slice(5)), { recursive: true });
    }
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  ready ??= migrate(client);
  await ready;
  return client;
}

/** Tests only: swaps the singleton for a fresh in-memory database with the schema applied. */
export async function useTestDb(): Promise<Client> {
  client = createClient({ url: "file::memory:" });
  ready = migrate(client);
  await ready;
  return client;
}

export type Args = InValue[];
