export const IRAN_TIME_ZONE = "Asia/Tehran";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MINUTE_MS = 60 * 1000;

function asDate(value: Date | string | number) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function partsForInstant(value: Date | string | number) {
  const date = asDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone: IRAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function tehranOffsetMinutes(date: Date) {
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: IRAN_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zoneName ?? "");
  if (!match) return 210;

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export function parseDateKey(dateKey: string) {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function tehranDateKey(value: Date | string | number) {
  const parts = partsForInstant(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function tehranTime24(value: Date | string | number) {
  const parts = partsForInstant(value);
  return parts ? `${parts.hour}:${parts.minute}` : null;
}

export function tehranDateTimeLocal(value: Date | string | number) {
  const parts = partsForInstant(value);
  return parts
    ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    : null;
}

/** Converts a datetime-local value that represents Iran wall time to an ISO instant. */
export function tehranWallTimeToIso(value: string) {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const validationDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day ||
    validationDate.getUTCHours() !== hour ||
    validationDate.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const wallClockUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  );
  const approximate = new Date(wallClockUtc);
  const firstPass = new Date(
    wallClockUtc - tehranOffsetMinutes(approximate) * MINUTE_MS,
  );
  const corrected = new Date(
    wallClockUtc - tehranOffsetMinutes(firstPass) * MINUTE_MS,
  );

  if (!Number.isFinite(corrected.getTime())) return null;

  const iso = corrected.toISOString();
  return tehranDateTimeLocal(iso) === value ? iso : null;
}

export function formatTehranInstant(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
) {
  const date = asDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: IRAN_TIME_ZONE,
  }).format(date);
}

export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
) {
  const date = parseDateKey(dateKey);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

export function formatTimeOfDay(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

export function weekdayIndexForDateKey(dateKey: string) {
  return parseDateKey(dateKey)?.getUTCDay() ?? null;
}
