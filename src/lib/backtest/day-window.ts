/**
 * Calendar-day window in America/New_York.
 * Returns [startTs, endTs) as unix seconds.
 */
export function dayWindowEt(date: string): {
  date: string;
  startTs: number;
  endTs: number;
  timezone: string;
} {
  const startTs = etMidnightUnix(date);
  const endTs = etMidnightUnix(addDays(date, 1));
  return { date, startTs, endTs, timezone: "America/New_York" };
}

export function previousDayWindowEt(now = new Date()): {
  date: string;
  startTs: number;
  endTs: number;
  timezone: string;
} {
  const todayEt = formatEtDate(now);
  const date = addDays(todayEt, -1);
  return dayWindowEt(date);
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + delta);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function formatEtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Unix seconds for 00:00:00 America/New_York on YYYY-MM-DD. */
function etMidnightUnix(date: string): number {
  // Probe UTC timestamps around the day until ET local clock is midnight on `date`.
  const [y, m, d] = date.split("-").map(Number);
  const probeStart = Date.UTC(y, m - 1, d, 0, 0, 0) - 12 * 3600_000;
  for (let t = probeStart; t < probeStart + 36 * 3600_000; t += 60_000) {
    const parts = etYmdHm(new Date(t));
    if (parts.ymd === date && parts.hour === 0 && parts.minute === 0) {
      return Math.floor(t / 1000);
    }
  }
  // Fallback assume EDT (UTC-4)
  return Math.floor(Date.UTC(y, m - 1, d, 4, 0, 0) / 1000);
}

function etYmdHm(d: Date): { ymd: string; hour: number; minute: number } {
  const ymd = formatEtDate(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );
  const minute = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      minute: "numeric",
    }).format(d),
  );
  return { ymd, hour: hour === 24 ? 0 : hour, minute };
}
