import type { SleepSession } from "@/types/health";
import { tehranDateKey, tehranWallTimeToIso } from "./tehran-time";

const MINUTE = 60_000;
export const SLEEP_DAY_MS = 24 * 60 * MINUTE;

export function sleepDurationMinutes(session: SleepSession) {
  if (!session.endedAt) return null;
  const minutes =
    (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / MINUTE;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function sleepSessionsOverlap(a: SleepSession, b: SleepSession) {
  if (a.id === b.id) return false;
  return (
    Date.parse(a.startedAt) < (b.endedAt ? Date.parse(b.endedAt) : Infinity) &&
    Date.parse(b.startedAt) < (a.endedAt ? Date.parse(a.endedAt) : Infinity)
  );
}

/** Validates new user input without changing or discarding existing history. */
export function validateSleepSession(
  session: SleepSession,
  existing: readonly SleepSession[],
  now: Date,
) {
  const start = Date.parse(session.startedAt);
  const end = session.endedAt ? Date.parse(session.endedAt) : null;
  if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
    return "Choose valid start and end dates and times in Iran time.";
  }
  if (start > now.getTime() || (end !== null && end > now.getTime())) {
    return "Sleep times cannot be in the future.";
  }
  if (end !== null && end <= start)
    return "Wake-up must be after sleep started. Check both dates for overnight sleep.";
  if (end !== null && end - start > 2 * SLEEP_DAY_MS) {
    return "This interval is longer than 48 hours. Check the dates and record separate sleep episodes.";
  }
  if (
    session.quality !== undefined &&
    (!Number.isInteger(session.quality) ||
      session.quality < 1 ||
      session.quality > 5)
  ) {
    return "Choose a sleep quality from 1 to 5, or Not rated.";
  }
  if (
    session.awakenings !== undefined &&
    (!Number.isInteger(session.awakenings) ||
      session.awakenings < 0 ||
      session.awakenings > 100)
  ) {
    return "Awakenings must be a whole number from 0 to 100, or left blank.";
  }
  if (existing.some((other) => sleepSessionsOverlap(session, other))) {
    return "This overlaps another sleep episode. Edit that episode or choose a separate time interval.";
  }
  return null;
}

/** Completed intervals clipped to the requested window, unioned to avoid double counting. */
export function summarizeSleep(
  sessions: readonly SleepSession[],
  start: Date,
  end: Date,
) {
  const from = start.getTime();
  const to = end.getTime();
  const included = sessions.filter(
    (s) =>
      sleepDurationMinutes(s) !== null &&
      Date.parse(s.startedAt) < to &&
      Date.parse(s.endedAt!) > from,
  );
  const intervals = included
    .map((s) => [
      Math.max(from, Date.parse(s.startedAt)),
      Math.min(to, Date.parse(s.endedAt!)),
    ])
    .sort((a, b) => a[0] - b[0]);
  let milliseconds = 0;
  let until = -Infinity;
  for (const [begin, finish] of intervals) {
    milliseconds += Math.max(0, finish - Math.max(begin, until));
    until = Math.max(until, finish);
  }
  const rated = included.filter((s) => s.quality !== undefined);
  return {
    minutes: milliseconds / MINUTE,
    sessionCount: included.length,
    ratedCount: rated.length,
    averageQuality: rated.length
      ? rated.reduce((sum, s) => sum + s.quality!, 0) / rated.length
      : null,
  };
}

export function sleepDayWindow(dateKey: string) {
  const startedAt = tehranWallTimeToIso(`${dateKey}T00:00`);
  if (!startedAt) return null;
  const nextDateKey = tehranDateKey(
    new Date(Date.parse(startedAt) + 36 * 60 * MINUTE),
  );
  const endedAt = nextDateKey
    ? tehranWallTimeToIso(`${nextDateKey}T00:00`)
    : null;
  return endedAt
    ? { start: new Date(startedAt), end: new Date(endedAt) }
    : null;
}

export function formatSleepDuration(minutes: number | null) {
  if (minutes === null) return "Not recorded";
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}
