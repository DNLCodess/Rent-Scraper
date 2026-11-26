import "server-only";
import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "./db";
import { getPreferences } from "./preferences";
import { advanceRunningRuns, createRun, InputError } from "./runs";
import { toSearchTerm, termLabel } from "./scraper/types";
import { getSetting, setSetting } from "./settings";
import { lagosDayKey } from "./time";
import { MAX_COUNT, MAX_TAGS, type Run } from "./types";

export interface SavedSearch {
  id: string;
  terms: string[];
  count: number;
  daily: boolean;
  createdAt: string;
}

function rowToSearch(r: Row): SavedSearch {
  return {
    id: r.id as string,
    terms: JSON.parse(r.terms as string) as string[],
    count: Number(r.count),
    daily: Number(r.daily) === 1,
    createdAt: r.created_at as string,
  };
}

function cleanTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new InputError("terms must be an array");
  const labels = raw
    .map((t) => toSearchTerm(String(t)))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map(termLabel);
  const unique = [...new Set(labels)];
  if (unique.length === 0) throw new InputError("Add at least one hashtag or keyword.");
  if (unique.length > MAX_TAGS) throw new InputError(`Use at most ${MAX_TAGS} terms per search.`);
  return unique;
}

function cleanCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!(n >= 1 && n <= MAX_COUNT)) throw new InputError(`Count must be between 1 and ${MAX_COUNT}.`);
  return n;
}

/** Seed one search from the legacy default_tags setting, once. */
async function ensureSeeded(): Promise<void> {
  if (await getSetting("searches_seeded")) return;
  await setSetting("searches_seeded", "1");
  const c = await db();
  const existing = await c.execute("SELECT COUNT(*) AS n FROM saved_searches");
  if (Number(existing.rows[0].n) > 0) return;
  const legacy = await getSetting("default_tags");
  if (!legacy) return;
  let tags: unknown;
  try {
    tags = JSON.parse(legacy);
  } catch {
    return;
  }
  let terms: string[];
  try {
    terms = cleanTerms(tags);
  } catch {
    return;
  }
  const count = cleanCount(Number(await getSetting("default_count")) || 30);
  await c.execute({
    sql: "INSERT INTO saved_searches (id, terms, count, daily, created_at) VALUES (?, ?, ?, 0, ?)",
    args: [randomUUID(), JSON.stringify(terms), count, new Date().toISOString()],
  });
}

export async function listSearches(): Promise<SavedSearch[]> {
  await ensureSeeded();
  const r = await (await db()).execute("SELECT * FROM saved_searches ORDER BY created_at, id");
  return r.rows.map(rowToSearch);
}

async function getSearch(id: string): Promise<SavedSearch | null> {
  const r = await (await db()).execute({ sql: "SELECT * FROM saved_searches WHERE id = ?", args: [id] });
  return r.rows[0] ? rowToSearch(r.rows[0]) : null;
}

export async function createSearch(input: { terms: string[]; count: number; daily: boolean }): Promise<SavedSearch> {
  await ensureSeeded();
  const terms = cleanTerms(input.terms);
  const count = cleanCount(input.count);
  const id = randomUUID();
  await (await db()).execute({
    sql: "INSERT INTO saved_searches (id, terms, count, daily, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, JSON.stringify(terms), count, input.daily ? 1 : 0, new Date().toISOString()],
  });
  return (await getSearch(id))!;
}

export async function updateSearch(
  id: string,
  patch: Partial<{ terms: string[]; count: number; daily: boolean }>,
): Promise<SavedSearch> {
  const cur = await getSearch(id);
  if (!cur) throw new InputError("That search no longer exists.");
  const terms = patch.terms !== undefined ? cleanTerms(patch.terms) : cur.terms;
  const count = patch.count !== undefined ? cleanCount(patch.count) : cur.count;
  const daily = patch.daily !== undefined ? !!patch.daily : cur.daily;
  await (await db()).execute({
    sql: "UPDATE saved_searches SET terms = ?, count = ?, daily = ? WHERE id = ?",
    args: [JSON.stringify(terms), count, daily ? 1 : 0, id],
  });
  return (await getSearch(id))!;
}

export async function deleteSearch(id: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM saved_searches WHERE id = ?", args: [id] });
}

export async function runSavedSearch(id: string, source: "manual" | "scheduled" = "manual"): Promise<Run> {
  const s = await getSearch(id);
  if (!s) throw new InputError("That search no longer exists.");
  return createRun(s.terms, s.count, source);
}

/** Whether a scheduled run of these terms was created on the current Lagos day. */
async function ranToday(terms: string[], now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const r = await (await db()).execute({
    sql: "SELECT created_at FROM runs WHERE source = 'scheduled' AND tags = ? AND created_at >= ?",
    args: [JSON.stringify(terms), since],
  });
  const today = lagosDayKey(now);
  return r.rows.some((row) => lagosDayKey(new Date(row.created_at as string)) === today);
}

/**
 * Daily cron: first advance every run still `running` (so a missed webhook never strands
 * results), then start each daily search once per Lagos day. Starts nothing once the hunt is done.
 */
export async function runDailySearches(): Promise<{ started: string[]; advanced: string[] }> {
  const advanced = await advanceRunningRuns();
  if ((await getPreferences()).huntState === "done") return { started: [], advanced };
  const started: string[] = [];
  const now = new Date();
  for (const s of (await listSearches()).filter((x) => x.daily)) {
    try {
      if (await ranToday(s.terms, now)) continue; // duplicate cron delivery: don't pay twice
      started.push((await runSavedSearch(s.id, "scheduled")).id);
    } catch (err) {
      console.error("Scheduled search failed", s.id, err); // one bad search must not block the rest
    }
  }
  return { started, advanced };
}
