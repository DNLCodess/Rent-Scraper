import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseListing } from "./parser";

/**
 * libSQL database. Locally this is a plain SQLite file (DATABASE_URL=file:data/app.db);
 * on Vercel it is Turso. The connection is read from DATABASE_URL / DATABASE_AUTH_TOKEN,
 * or from the names the Vercel Turso integration creates (DATABASE_TURSO_DATABASE_URL /
 * DATABASE_TURSO_AUTH_TOKEN with the "DATABASE" prefix, TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 * without one), so the integration's managed variables work as they are.
 */

type Env = Record<string, string | undefined>;

/** Database URL and auth token from the environment, first match wins. */
export function dbConfigFromEnv(env: Env): { url: string; authToken: string | undefined } {
  return {
    url: env.DATABASE_URL || env.DATABASE_TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || "file:data/app.db",
    authToken: env.DATABASE_AUTH_TOKEN || env.DATABASE_TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
  };
}

const { url, authToken } = dbConfigFromEnv(process.env);

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

/** Column names of a table, read with one PRAGMA. */
async function columnsOf(c: Client, table: string): Promise<Set<string>> {
  const info = await c.execute(`PRAGMA table_info(${table})`);
  return new Set(info.rows.map((r) => r.name as string));
}

/**
 * Adds a column when the table does not have it yet (SQLite has no ADD COLUMN IF NOT EXISTS).
 * `existing` is the table's columns if already read. Two cold instances can both see the
 * column missing; the loser's "duplicate column name" error is ignored.
 */
export async function addColumnIfMissing(
  c: Client,
  table: string,
  column: string,
  ddl: string,
  existing?: Set<string>,
): Promise<void> {
  const cols = existing ?? (await columnsOf(c, table));
  if (cols.has(column)) return;
  try {
    await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (!/duplicate column name/i.test(String((err as Error)?.message ?? err))) throw err;
  }
  cols.add(column);
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

/**
 * Bump when parser changes should be applied to rows already stored. migrate() re-parses
 * every listing once per bump (only the parsed columns; never status or tracker fields).
 */
export const PARSER_VERSION = 2;
const REPARSE_BATCH = 200;

/** Re-parses stored listings when the stored parser_version is older. Idempotent and safe to run concurrently. */
async function reparseIfStale(c: Client): Promise<void> {
  const r = await c.execute("SELECT value FROM settings WHERE key = 'parser_version'");
  const stored = Number(r.rows[0]?.value ?? 0) || 0;
  if (stored >= PARSER_VERSION) return;
  let after = "";
  for (;;) {
    const page = await c.execute({
      sql: "SELECT id, caption, bio FROM listings WHERE id > ? ORDER BY id LIMIT ?",
      args: [after, REPARSE_BATCH],
    });
    if (page.rows.length === 0) break;
    await c.batch(
      page.rows.map((row) => {
        const p = parseListing(String(row.caption ?? ""), (row.bio as string | null) ?? "");
        return {
          sql: `UPDATE listings SET price_raw = ?, price_ngn = ?, price_period = ?, area = ?, bedrooms = ?, phone = ?,
                  power_level = ?, power_raw = ?, total_package_ngn = ? WHERE id = ?`,
          args: [p.price_raw, p.price_ngn, p.price_period, p.area, p.bedrooms, p.phone, p.power_level, p.power_raw,
            p.total_package_ngn, row.id as string],
        };
      }),
      "write",
    );
    after = page.rows[page.rows.length - 1].id as string;
    if (page.rows.length < REPARSE_BATCH) break;
  }
  // Never lower a version a newer deploy may have written meanwhile.
  await c.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('parser_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = CASE
            WHEN CAST(settings.value AS INTEGER) < CAST(excluded.value AS INTEGER) THEN excluded.value
            ELSE settings.value END`,
    args: [String(PARSER_VERSION)],
  });
}

/** Creates tables, adds v2 columns and backfills. Safe to run repeatedly. */
export async function migrate(c: Client): Promise<void> {
  await c.batch([...SCHEMA, ...NEW_TABLES], "write");
  const listingCols = await columnsOf(c, "listings");
  for (const [col, ddl] of LISTING_COLUMNS) await addColumnIfMissing(c, "listings", col, ddl, listingCols);
  await addColumnIfMissing(c, "listings", "cover_url", "TEXT", listingCols);
  await addColumnIfMissing(c, "runs", "source", "TEXT NOT NULL DEFAULT 'manual'");
  await c.execute("UPDATE listings SET first_seen_at = updated_at WHERE first_seen_at IS NULL");
  await reparseIfStale(c);
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

/** Returns a connected client with the schema applied. */
export async function db(): Promise<Client> {
  if (!client) {
    if (url.startsWith("file:") && !url.includes(":memory:")) {
      mkdirSync(dirname(url.slice(5)), { recursive: true });
    }
    client = createClient({ url, authToken });
  }
  ready ??= startMigrate(client);
  await ready;
  return client;
}

/** Runs migrate once; a failure is forgotten so the next db() call retries instead of failing forever. */
function startMigrate(c: Client): Promise<void> {
  const p: Promise<void> = migrate(c).catch((err) => {
    if (ready === p) ready = null;
    throw err;
  });
  return p;
}

/** Tests only: forgets that migrate ran, so the next db() call runs it again. */
export function resetMigrationForTests(): void {
  ready = null;
}

/** Tests only: swaps the singleton for a fresh in-memory database with the schema applied. */
export async function useTestDb(): Promise<Client> {
  client = createClient({ url: "file::memory:" });
  ready = migrate(client);
  await ready;
  return client;
}

export type Args = InValue[];
