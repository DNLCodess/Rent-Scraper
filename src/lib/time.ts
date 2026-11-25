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

export function formatLagos(d: Date, style: Style): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS_TZ, ...FORMATS[style] }).format(d);
}
