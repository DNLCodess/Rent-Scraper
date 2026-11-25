import "server-only";
import { db } from "./db";
import { toDetails } from "./listings";
import { getPreferences } from "./preferences";
import { startOfLagosDay } from "./time";
import type { ListingDetail, TrackerStage, TrackerView } from "./types";

export type { TrackerStage, TrackerView } from "./types";

const STAGES: TrackerStage[] = ["shortlisted", "messaged", "inspection_booked", "inspected", "negotiating"];
const DAY_MS = 86_400_000;

export async function getTracker(now: Date = new Date()): Promise<TrackerView> {
  const c = await db();
  const res = await c.execute({
    sql: `SELECT * FROM listings WHERE archived = 0 AND status IN (${STAGES.map(() => "?").join(",")})
          ORDER BY status_changed_at DESC, rowid DESC`,
    args: STAGES,
  });
  const [details, prefs] = await Promise.all([toDetails(res.rows, now), getPreferences()]);

  const stages = Object.fromEntries(STAGES.map((s) => [s, [] as ListingDetail[]])) as Record<TrackerStage, ListingDetail[]>;
  for (const d of details) stages[d.status as TrackerStage].push(d);

  const from = startOfLagosDay(now).getTime();
  const to = from + 7 * DAY_MS;
  const inspections = stages.inspection_booked
    .map((d) => ({ d, t: d.inspection_at ? Date.parse(d.inspection_at) : NaN }))
    .filter((x) => x.t >= from && x.t < to)
    .sort((a, b) => a.t - b.t)
    .map((x) => x.d);

  const cutoff = now.getTime() - prefs.nudgeDays * DAY_MS;
  const nudges = stages.messaged.filter((d) => {
    if (d.replied_at) return false;
    const t = d.status_changed_at ? Date.parse(d.status_changed_at) : NaN;
    return t < cutoff;
  });

  return { activeCount: details.length, thisWeek: { inspections, nudges }, stages };
}
