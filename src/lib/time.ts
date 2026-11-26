/** Africa/Lagos calendar helpers. Never depends on the server's own time zone. */

export const LAGOS_TZ = "Africa/Lagos";

type Style = "date" | "time" | "dayShort" | "dayNum";

const FORMATS: Record<Style, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
  dayShort: { weekday: "short" },
  dayNum: { day: "numeric" },
};

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAGOS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function lagosParts(d: Date) {
  const p: Record<string, number> = {};
  for (const x of PARTS.formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return p;
}

/** YYYY-MM-DD of the given instant in Lagos. */
export function lagosDayKey(d: Date): string {
  const p = lagosParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant at which the Lagos calendar day containing `d` began. */
export function startOfLagosDay(d: Date): Date {
  const p = lagosParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Lagos wall time minus true time gives the offset; subtract the elapsed time since local midnight.
  const sinceMidnight = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const localMidnightAsUtc = asUtc - sinceMidnight;
  const offset = asUtc - Math.floor(d.getTime() / 1000) * 1000;
  return new Date(localMidnightAsUtc - offset);
}

/** Africa/Lagos is WAT all year (no DST), so its offset is fixed. */
const LAGOS_OFFSET = "+01:00";

/**
 * Lagos wall time from date and time inputs ("2026-11-29", "10:00") as an ISO string with an explicit
 * offset ("2026-11-29T10:00:00+01:00"). Null when either part is missing or not a real date/time.
 */
export function lagosLocalToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (h > 23 || mi > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${dm[0]}T${tm[0]}:00${LAGOS_OFFSET}`;
}

export function formatLagos(d: Date, style: Style): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS_TZ, ...FORMATS[style] }).format(d);
}

/** Hour of the daily automatic run in Lagos (cron `0 6 * * *` UTC). */
export const DAILY_RUN_HOUR = 7;

/** "Next search 7:00 today" before 07:00 Lagos, otherwise "… tomorrow". */
export function nextSearchLabel(now: Date = new Date()): string {
  const hour = lagosParts(now).hour;
  return `Next search ${DAILY_RUN_HOUR}:00 ${hour < DAILY_RUN_HOUR ? "today" : "tomorrow"}`;
}
