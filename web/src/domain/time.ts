/**
 * Timezone-safe calendar arithmetic.
 *
 * Instants are stored as UTC epoch milliseconds. Calendar days are derived with an explicit IANA
 * timezone and represented as "YYYY-MM-DD" keys. Date-key arithmetic is done in UTC so daylight
 * saving transitions can never add or drop a day.
 */
export type DateKey = string;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: isValidTimeZone(tz) ? tz : "UTC",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(ts: number, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ts))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Calendar day of an instant in a timezone. */
export function localDateKey(ts: number, tz: string): DateKey {
  const p = zonedParts(ts, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight (0..1439). Used to place a session on the 24-hour ring. */
export function minutesOfDay(ts: number, tz: string): number {
  const p = zonedParts(ts, tz);
  return p.hour * 60 + p.minute;
}

/** Offset of the zone from UTC at an instant, in minutes (IST = +330). */
export function offsetMinutes(ts: number, tz: string): number {
  const p = zonedParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60000);
}

/** ISO-8601 with numeric offset, e.g. 2026-11-15T09:30:00+05:30 (Android ExportHelper format). */
export function isoWithOffset(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  const off = offsetMinutes(ts, tz);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function keyToUtc(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): DateKey {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && utcToKey(keyToUtc(value)) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  return utcToKey(keyToUtc(key) + days * 86_400_000);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(key: DateKey): number {
  return (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `key` (Android: previousOrSame(MONDAY)). */
export function weekStart(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; daysBetween(k, to) >= 0; k = addDays(k, 1)) out.push(k);
  return out;
}

export function formatDateKey(key: DateKey, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(new Date(keyToUtc(key)));
}
