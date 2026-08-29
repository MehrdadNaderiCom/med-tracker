import { addCareDays } from "./health-schedule";
import { weekdayIndexForDateKey } from "./tehran-time";
import type { IntakeLog, Medication, WeekDay } from "@/types";

const WEEK_DAY_BY_INDEX: WeekDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const EVEN_ROUTINE_DAYS: ReadonlySet<WeekDay> = new Set([
  "saturday",
  "monday",
  "wednesday",
]);
const ODD_ROUTINE_DAYS: ReadonlySet<WeekDay> = new Set([
  "sunday",
  "tuesday",
  "thursday",
]);

/** Search bound for previous/next scheduled Care Days (Tue↔Fri gaps fit easily). */
const SCHEDULE_SEARCH_LIMIT_DAYS = 14;

export type MedicationPresenceOnCareDay =
  | { kind: "hidden" }
  | {
      kind: "scheduled";
      isTaken: boolean;
      completionLog: IntakeLog | null;
    }
  | {
      kind: "catch-up";
      fromDateKey: string;
      isTaken: boolean;
      completionLog: IntakeLog | null;
    };

function getDayForDateKey(dateKey: string): WeekDay | null {
  const weekdayIndex = weekdayIndexForDateKey(dateKey);
  return weekdayIndex === null ? null : WEEK_DAY_BY_INDEX[weekdayIndex];
}

function intakeLogCareDayKey(log: Pick<IntakeLog, "date" | "takenAt">) {
  if (typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.date.trim())) {
    return log.date.trim();
  }
  return null;
}

export function isMedicationScheduledOnCareDay(
  medication: Pick<Medication, "schedule">,
  dateKey: string,
) {
  const dayMode = medication.schedule.dayMode;
  if (dayMode === "daily") return true;

  const weekday = getDayForDateKey(dateKey);
  if (!weekday) return false;

  if (dayMode === "even-dates") {
    return EVEN_ROUTINE_DAYS.has(weekday);
  }

  if (dayMode === "odd-dates") {
    return ODD_ROUTINE_DAYS.has(weekday);
  }

  return medication.schedule.days.includes(weekday);
}

export function findPreviousScheduledCareDay(
  medication: Pick<Medication, "schedule">,
  dateKey: string,
) {
  for (let offset = 1; offset <= SCHEDULE_SEARCH_LIMIT_DAYS; offset += 1) {
    const candidate = addCareDays(dateKey, -offset);
    if (isMedicationScheduledOnCareDay(medication, candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findNextScheduledCareDayOnOrAfter(
  medication: Pick<Medication, "schedule">,
  dateKey: string,
) {
  for (let offset = 0; offset <= SCHEDULE_SEARCH_LIMIT_DAYS; offset += 1) {
    const candidate = addCareDays(dateKey, offset);
    if (isMedicationScheduledOnCareDay(medication, candidate)) {
      return candidate;
    }
  }
  return null;
}

export function findNextScheduledCareDayAfter(
  medication: Pick<Medication, "schedule">,
  dateKey: string,
) {
  return findNextScheduledCareDayOnOrAfter(medication, addCareDays(dateKey, 1));
}

export function listTakenLogsInCareDayWindow(
  medicationId: string,
  logs: readonly IntakeLog[],
  startDateKeyInclusive: string,
  endDateKeyExclusive: string,
) {
  return logs.filter((log) => {
    if (log.medicationId !== medicationId || log.status !== "taken") {
      return false;
    }
    const careDayKey = intakeLogCareDayKey(log);
    if (!careDayKey) return false;
    return (
      careDayKey >= startDateKeyInclusive && careDayKey < endDateKeyExclusive
    );
  });
}

export function resolveMedicationPresenceOnCareDay(
  medication: Medication,
  dateKey: string,
  logs: readonly IntakeLog[],
): MedicationPresenceOnCareDay {
  if (isMedicationScheduledOnCareDay(medication, dateKey)) {
    const windowEnd =
      findNextScheduledCareDayAfter(medication, dateKey) ??
      addCareDays(dateKey, SCHEDULE_SEARCH_LIMIT_DAYS + 1);
    const completionLogs = listTakenLogsInCareDayWindow(
      medication.id,
      logs,
      dateKey,
      windowEnd,
    );
    const completionLog =
      completionLogs.find((log) => intakeLogCareDayKey(log) === dateKey) ??
      completionLogs[0] ??
      null;
    return {
      kind: "scheduled",
      isTaken: completionLogs.length > 0,
      completionLog,
    };
  }

  if (!medication.schedule.catchUpUntilNextScheduledDay) {
    return { kind: "hidden" };
  }

  const previous = findPreviousScheduledCareDay(medication, dateKey);
  if (!previous) {
    return { kind: "hidden" };
  }

  const next =
    findNextScheduledCareDayOnOrAfter(medication, dateKey) ??
    addCareDays(dateKey, SCHEDULE_SEARCH_LIMIT_DAYS + 1);

  if (!(previous < dateKey && dateKey < next)) {
    return { kind: "hidden" };
  }

  const completionLogs = listTakenLogsInCareDayWindow(
    medication.id,
    logs,
    previous,
    next,
  );
  if (completionLogs.length > 0) {
    return { kind: "hidden" };
  }

  return {
    kind: "catch-up",
    fromDateKey: previous,
    isTaken: false,
    completionLog: null,
  };
}
