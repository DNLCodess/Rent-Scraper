import "server-only";
import { db } from "./db";
import { KNOWN_AREAS } from "./parser";
import { InputError } from "./runs";

export type BedOption = "0" | "1" | "2" | "3" | "4+";
export type PowerMode = "ignore" | "rank" | "require";

export interface Preferences {
  budgetMin: number | null;
  budgetMax: number | null;
  beds: BedOption[];
  preferredAreas: string[];
  excludedAreas: string[];
  powerMode: PowerMode;
  nudgeDays: number;
  huntState: "active" | "done";
}

export const DEFAULT_PREFERENCES: Preferences = {
  budgetMin: null,
  budgetMax: null,
  beds: [],
  preferredAreas: [],
  excludedAreas: [],
  powerMode: "rank",
  nudgeDays: 3,
  huntState: "active",
};

const BEDS: BedOption[] = ["0", "1", "2", "3", "4+"];
const POWER_MODES: PowerMode[] = ["ignore", "rank", "require"];
const KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[];
const KNOWN_BY_LOWER = new Map(KNOWN_AREAS.map((a) => [a.toLowerCase(), a]));

export async function getPreferences(): Promise<Preferences> {
  const r = await (await db()).execute("SELECT key, value FROM preferences");
  const out: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  for (const row of r.rows) {
    const key = row.key as string;
    if (!(KEYS as string[]).includes(key)) continue;
    try {
      out[key] = JSON.parse(row.value as string);
    } catch {
      // Corrupt value: keep the default.
    }
  }
  return out as unknown as Preferences;
}

function budget(v: unknown, label: string): number | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new InputError(`${label} must be a whole number of naira, zero or more.`);
  }
  return v;
}

function areas(v: unknown, label: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new InputError(`${label} must be a list of area names.`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v as string[]) {
    const name = raw.trim();
    if (!name) continue;
    const canon = KNOWN_BY_LOWER.get(name.toLowerCase()) ?? name;
    if (seen.has(canon.toLowerCase())) continue;
    seen.add(canon.toLowerCase());
    out.push(canon);
  }
  return out;
}

export async function updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const current = await getPreferences();
  const next: Preferences = { ...current };
  const p = patch as Record<string, unknown>;

  if (p.budgetMin !== undefined) next.budgetMin = budget(p.budgetMin, "Minimum budget");
  if (p.budgetMax !== undefined) next.budgetMax = budget(p.budgetMax, "Maximum budget");
  if (next.budgetMin !== null && next.budgetMax !== null && next.budgetMin > next.budgetMax) {
    throw new InputError("Minimum budget is above the maximum. Lower the minimum or raise the maximum.");
  }
  if (p.beds !== undefined) {
    if (!Array.isArray(p.beds) || p.beds.some((b) => !BEDS.includes(b as BedOption))) {
      throw new InputError('Bedrooms must be a list of "0", "1", "2", "3" or "4+".');
    }
    next.beds = BEDS.filter((b) => (p.beds as string[]).includes(b));
  }
  if (p.preferredAreas !== undefined) next.preferredAreas = areas(p.preferredAreas, "Preferred areas");
  if (p.excludedAreas !== undefined) next.excludedAreas = areas(p.excludedAreas, "Excluded areas");
  if (p.powerMode !== undefined) {
    if (!POWER_MODES.includes(p.powerMode as PowerMode)) {
      throw new InputError("Power mode must be ignore, rank or require.");
    }
    next.powerMode = p.powerMode as PowerMode;
  }
  if (p.nudgeDays !== undefined) {
    const n = p.nudgeDays;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 30) {
      throw new InputError("Nudge days must be a whole number from 1 to 30.");
    }
    next.nudgeDays = n;
  }
  if (p.huntState !== undefined) {
    if (p.huntState !== "active" && p.huntState !== "done") {
      throw new InputError("Hunt state must be active or done.");
    }
    next.huntState = p.huntState;
  }

  const c = await db();
  for (const key of KEYS) {
    if (JSON.stringify(next[key]) === JSON.stringify(current[key])) continue;
    await c.execute({
      sql: "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, JSON.stringify(next[key])],
    });
  }
  return next;
}

function normaliseHandle(handle: string): string {
  const h = String(handle ?? "").trim().replace(/^@+/, "").trim().toLowerCase();
  if (!h) throw new InputError("Enter an agent handle to block.");
  return h;
}

export async function blockAuthor(handle: string): Promise<void> {
  const h = normaliseHandle(handle);
  await (await db()).execute({
    sql: "INSERT INTO blocked_authors (handle, blocked_at) VALUES (?, ?) ON CONFLICT(handle) DO NOTHING",
    args: [h, new Date().toISOString()],
  });
}

export async function unblockAuthor(handle: string): Promise<void> {
  const h = normaliseHandle(handle);
  await (await db()).execute({ sql: "DELETE FROM blocked_authors WHERE handle = ?", args: [h] });
}

export async function listBlocked(): Promise<Array<{ handle: string; blockedAt: string; hiddenCount: number }>> {
  const r = await (await db()).execute(
    `SELECT b.handle, b.blocked_at,
            (SELECT COUNT(*) FROM listings l WHERE LOWER(l.author) = b.handle) AS hidden
     FROM blocked_authors b ORDER BY b.blocked_at DESC, b.handle`,
  );
  return r.rows.map((row) => ({
    handle: row.handle as string,
    blockedAt: row.blocked_at as string,
    hiddenCount: Number(row.hidden),
  }));
}

export async function blockedSet(): Promise<Set<string>> {
  const r = await (await db()).execute("SELECT handle FROM blocked_authors");
  return new Set(r.rows.map((row) => row.handle as string));
}
