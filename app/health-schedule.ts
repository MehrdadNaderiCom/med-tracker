/**
 * Pure scheduling helpers for health records.
 *
 * Product note: the adaptive seven-Care-Day recommendation and reminder
 * escalation are app heuristics. They do not diagnose hypertension and do not
 * replace a clinician's personalised monitoring plan.
 */

export const HEALTH_TIME_ZONE = "Asia/Tehran";
export const CARE_DAY_ROLLOVER_HOUR = 12;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;
const DAY_MS = 86_400_000;
export const BP_PAIR_MAX_INTERVAL_SECONDS = 10 * 60;

export interface CareDayRecord {
  careDayKey?: unknown;
  measuredAt?: unknown;
  createdAt?: unknown;
}

export interface ScheduleBloodPressureReading {
  systolic: number;
  diastolic: number;
  pulseBpm?: number;
  measuredAt?: string;
}

export interface ScheduleBloodPressureSession extends CareDayRecord {
  id?: string;
  pairingClosedAt?: string;
  period?: "morning" | "evening" | "other" | string;
  /** One session has one arm; individual readings deliberately have no arm. */
  arm?: "left" | "right" | "unknown" | string;
  position?: "seated" | "standing" | "lying" | "unknown" | string;
  cuffSite?: "upper-arm" | "wrist" | "other" | "unknown" | string;
  standardConditions?: boolean | null;
  contextFlags?: readonly string[];
  triggeredBySymptoms?: boolean;
  readings?: readonly ScheduleBloodPressureReading[];
}

export interface BloodPressureThresholds {
  targetSystolic?: number;
  targetDiastolic?: number;
  lowSystolic?: number;
  lowDiastolic?: number;
  severeSystolic?: number;
  severeDiastolic?: number;
}

export interface BloodPressureAverage {
  systolic: number;
  diastolic: number;
  pulseBpm?: number;
}

export type BloodPressurePairStatus =
  | "partial"
  | "complete"
  | "complete-legacy"
  | "interval-too-short"
  | "interval-too-long";

export interface BloodPressureSessionAssessment {
  readingCount: 0 | 1 | 2;
  average: BloodPressureAverage | null;
  pairStatus: BloodPressurePairStatus;
  /** True only for a valid pair. Legacy pairs remain usable for trends. */
  trendEligible: boolean;
  /** Null means individual timestamps were not both available. */
  intervalSeconds: number | null;
  intervalConfirmed: boolean;
  arm: string;
  rawSevere: boolean;
  highPair: boolean;
  lowPair: boolean;
}

export type BloodPressurePeriodState =
  | "missing"
  | "partial"
  | "incomplete"
  | "complete";

export interface BloodPressurePlanInput extends BloodPressureThresholds {
  now: Date | string;
  currentCareDayKey?: string;
  sessions?: readonly ScheduleBloodPressureSession[];
  reminderEnabled?: boolean;
  cycleStartKey?: string;
  cycleEndKey?: string;
  trendLookbackCareDays?: number;
  urgentWindowMinutes?: number;
}

export type BloodPressurePlanMode =
  | "inactive"
  | "scheduled"
  | "enhanced"
  | "urgent";

export type BloodPressureEnhancedReason =
  | "single-high"
  | "single-low"
  | "recurrent-high"
  | "recurrent-low"
  | "mixed-out-of-range";

export type BloodPressureMissingLevel =
  | "none"
  | "gentle"
  | "amber"
  | "restart";

export interface BloodPressurePlan {
  mode: BloodPressurePlanMode;
  active: boolean;
  baseCycleActive: boolean;
  enhancedCycleActive: boolean;
  postCycleFollowUp: boolean;
  enhancedReason: BloodPressureEnhancedReason | null;
  suggestedCycleStartKey?: string;
  suggestedCycleEndKey?: string;
  /** A severe raw reading in the current Care Day always wins immediately. */
  urgent: boolean;
  urgentSessionId?: string;
  urgentPeriod?: string;
  missingStreak: number;
  missingLevel: BloodPressureMissingLevel;
  recommendRestartOrExtend: boolean;
  qualifyingHighCareDays: string[];
  qualifyingLowCareDays: string[];
  periods: {
    morning: { status: BloodPressurePeriodState };
    evening: { status: BloodPressurePeriodState };
  };
}

export interface HealthScheduleSettings {
  weightReminderEnabled?: boolean;
  weightReminderTime?: string;
  bpReminderEnabled?: boolean;
  bpMorningReminderTime?: string;
  bpEveningReminderTime?: string;
  bpCycleStartDate?: string;
  bpCycleEndDate?: string;
  bpTargetSystolic?: number;
  bpTargetDiastolic?: number;
  dietReminderEnabled?: boolean;
  dietReminderTime?: string;
  waistReminderEnabled?: boolean;
  waistReminderTime?: string;
  waistReminderIntervalDays?: number;
  activityReminderEnabled?: boolean;
  activityReminderTime?: string;
  activityReminderIntervalDays?: number;
}

export type HealthTaskKind =
  | "weight"
  | "blood-pressure-morning"
  | "blood-pressure-evening"
  | "diet"
  | "waist"
  | "activity";

export type HealthTaskStatus =
  | "inactive"
  | "upcoming"
  | "due"
  | "partial"
  | "complete";

export type HealthTaskSeverity = "neutral" | "gentle" | "amber" | "urgent";

export type HealthTaskReason =
  | "not-scheduled"
  | "scheduled-later"
  | "scheduled-now"
  | "saved"
  | "single-reading-saved"
  | "incomplete-session-saved"
  | "one-missed-care-day"
  | "multiple-missed-care-days"
  | "restart-or-extend"
  | "urgent-raw-reading"
  | "interval-due"
  | "interval-not-reached";

export interface HealthTask {
  id: HealthTaskKind;
  kind: HealthTaskKind;
  status: HealthTaskStatus;
  severity: HealthTaskSeverity;
  careDayKey: string;
  scheduledTime?: string;
  reason: HealthTaskReason;
}

export interface EvaluateHealthTasksInput {
  now: Date | string;
  careDayKey?: string;
  settings?: HealthScheduleSettings;
  weightEntries?: readonly CareDayRecord[];
  bloodPressureSessions?: readonly ScheduleBloodPressureSession[];
  dietCheckIns?: readonly CareDayRecord[];
  waistEntries?: readonly CareDayRecord[];
  activityCheckIns?: readonly CareDayRecord[];
}

export interface HealthTaskEvaluation {
  careDayKey: string;
  currentMinute: number;
  bloodPressurePlan: BloodPressurePlan;
  tasks: HealthTask[];
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function asDate(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError("Expected a valid instant");
  }
  return parsed;
}

function zonedParts(value: Date | string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(asDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);

  const hour = part("hour");
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: hour === 24 ? 0 : hour,
    minute: part("minute"),
  };
}

function dateKeyFromParts(parts: { year: number; month: number; day: number }) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Returns the Tehran noon-to-noon Care Day that contains an instant. */
export function careDayKeyForInstant(
  value: Date | string,
  timeZone = HEALTH_TIME_ZONE,
): string {
  const parts = zonedParts(value, timeZone);
  const civilKey = dateKeyFromParts(parts);
  return parts.hour < CARE_DAY_ROLLOVER_HOUR
    ? addCareDays(civilKey, -1)
    : civilKey;
}

/**
 * Minutes elapsed since the noon Care Day boundary. This makes 23:00 (660)
 * correctly sort before 01:00 (780).
 */
export function careDayMinute(
  value: Date | string,
  timeZone = HEALTH_TIME_ZONE,
): number {
  let hour: number;
  let minute: number;

  if (typeof value === "string") {
    const clockMatch = value.match(CLOCK_PATTERN);
    if (clockMatch) {
      hour = Number(clockMatch[1]);
      minute = Number(clockMatch[2]);
      if (hour > 23 || minute > 59) {
        throw new RangeError("Expected a valid HH:mm clock time");
      }
    } else {
      const parts = zonedParts(value, timeZone);
      hour = parts.hour;
      minute = parts.minute;
    }
  } else {
    const parts = zonedParts(value, timeZone);
    hour = parts.hour;
    minute = parts.minute;
  }

  const civilMinute = hour * 60 + minute;
  return civilMinute >= CARE_DAY_ROLLOVER_HOUR * 60
    ? civilMinute - CARE_DAY_ROLLOVER_HOUR * 60
    : civilMinute + (24 - CARE_DAY_ROLLOVER_HOUR) * 60;
}

export function hasReachedCareDayTime(
  now: Date | string,
  reminderTime: string,
  timeZone = HEALTH_TIME_ZONE,
): boolean {
  return careDayMinute(now, timeZone) >= careDayMinute(reminderTime, timeZone);
}

export function addCareDays(dateKey: string, amount: number): string {
  if (!validDateKey(dateKey) || !Number.isInteger(amount)) {
    throw new RangeError("Expected a valid date key and integer Care Day amount");
  }
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

/** Positive when laterKey occurs after earlierKey. */
export function diffCareDays(laterKey: string, earlierKey: string): number {
  if (!validDateKey(laterKey) || !validDateKey(earlierKey)) {
    throw new RangeError("Expected valid Care Day date keys");
  }
  const later = Date.parse(`${laterKey}T12:00:00.000Z`);
  const earlier = Date.parse(`${earlierKey}T12:00:00.000Z`);
  return Math.round((later - earlier) / DAY_MS);
}

/** Stored Care Day metadata is authoritative; legacy records are derived. */
export function entryCareDayKey(
  entry: CareDayRecord,
  timeZone = HEALTH_TIME_ZONE,
): string | undefined {
  if (validDateKey(entry.careDayKey)) {
    return entry.careDayKey;
  }

  const measuredAt =
    typeof entry.measuredAt === "string"
      ? entry.measuredAt
      : typeof entry.createdAt === "string"
        ? entry.createdAt
        : undefined;
  if (!measuredAt) {
    return undefined;
  }

  // A legacy date-only measurement represents the user's chosen day, not UTC.
  if (validDateKey(measuredAt)) {
    return measuredAt;
  }

  try {
    return careDayKeyForInstant(measuredAt, timeZone);
  } catch {
    return undefined;
  }
}

function finiteReading(reading: ScheduleBloodPressureReading | undefined) {
  return Boolean(
    reading &&
      Number.isFinite(reading.systolic) &&
      Number.isFinite(reading.diastolic) &&
      reading.systolic > 0 &&
      reading.diastolic > 0,
  );
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export function averageBloodPressure(
  readings: readonly ScheduleBloodPressureReading[] | undefined,
): BloodPressureAverage | null {
  const valid = (readings ?? []).filter(finiteReading).slice(0, 2);
  if (valid.length === 0) {
    return null;
  }

  const pulseReadings = valid.filter(
    (reading) => Number.isFinite(reading.pulseBpm) && Number(reading.pulseBpm) > 0,
  );
  const average: BloodPressureAverage = {
    systolic: roundOne(
      valid.reduce((total, reading) => total + reading.systolic, 0) / valid.length,
    ),
    diastolic: roundOne(
      valid.reduce((total, reading) => total + reading.diastolic, 0) / valid.length,
    ),
  };
  if (pulseReadings.length > 0) {
    average.pulseBpm = roundOne(
      pulseReadings.reduce((total, reading) => total + Number(reading.pulseBpm), 0) /
        pulseReadings.length,
    );
  }
  return average;
}

function resolvedThresholds(thresholds: BloodPressureThresholds = {}) {
  return {
    targetSystolic: thresholds.targetSystolic ?? 135,
    targetDiastolic: thresholds.targetDiastolic ?? 85,
    lowSystolic: thresholds.lowSystolic ?? 90,
    lowDiastolic: thresholds.lowDiastolic ?? 60,
    severeSystolic: thresholds.severeSystolic ?? 180,
    severeDiastolic: thresholds.severeDiastolic ?? 120,
  };
}

function readingInstant(reading: ScheduleBloodPressureReading | undefined) {
  if (!reading?.measuredAt) {
    return null;
  }
  const value = Date.parse(reading.measuredAt);
  return Number.isFinite(value) ? value : null;
}

export function assessBloodPressureSession(
  session: ScheduleBloodPressureSession,
  thresholds: BloodPressureThresholds = {},
): BloodPressureSessionAssessment {
  const readings = (session.readings ?? []).filter(finiteReading).slice(0, 2);
  const readingCount = readings.length as 0 | 1 | 2;
  const average = averageBloodPressure(readings);
  const limits = resolvedThresholds(thresholds);
  const rawSevere = readings.some(
    (reading) =>
      reading.systolic >= limits.severeSystolic ||
      reading.diastolic >= limits.severeDiastolic,
  );

  let pairStatus: BloodPressurePairStatus = "partial";
  let intervalSeconds: number | null = null;
  if (readings.length === 2) {
    const firstAt = readingInstant(readings[0]);
    const secondAt = readingInstant(readings[1]);
    if (firstAt === null || secondAt === null) {
      pairStatus = "complete-legacy";
    } else {
      intervalSeconds = (secondAt - firstAt) / 1000;
      pairStatus =
        intervalSeconds < 60
          ? "interval-too-short"
          : intervalSeconds <= BP_PAIR_MAX_INTERVAL_SECONDS
            ? "complete"
            : "interval-too-long";
    }
  }

  const nonRoutineContextFlags = new Set([
    "emotional-stress",
    "relationship-conflict",
    "acute-pain",
    "acute-illness",
    "rushed",
    "caffeine",
    "nicotine",
    "exercise",
    "alcohol",
    "meal",
    "full-bladder",
    "talking",
    "not-rested",
    "positioning-issue",
    "cuff-issue",
    "other",
  ]);
  const explicitlyNonRoutine =
    (session.position !== undefined &&
      session.position !== "unknown" &&
      session.position !== "seated") ||
    (session.cuffSite !== undefined &&
      session.cuffSite !== "unknown" &&
      session.cuffSite !== "upper-arm") ||
    session.triggeredBySymptoms === true ||
    session.standardConditions === false ||
    (session.contextFlags ?? []).some((flag) => nonRoutineContextFlags.has(flag));
  const trendEligible =
    (pairStatus === "complete" || pairStatus === "complete-legacy") &&
    !explicitlyNonRoutine;
  const highPair = Boolean(
    trendEligible &&
      average &&
      (average.systolic >= limits.targetSystolic ||
        average.diastolic >= limits.targetDiastolic),
  );
  const lowPair = Boolean(
    trendEligible &&
      average &&
      (average.systolic < limits.lowSystolic || average.diastolic < limits.lowDiastolic),
  );

  return {
    readingCount,
    average,
    pairStatus,
    trendEligible,
    intervalSeconds,
    intervalConfirmed: pairStatus === "complete",
    arm: typeof session.arm === "string" ? session.arm : "unknown",
    rawSevere,
    highPair,
    lowPair,
  };
}

function keyInRange(key: string, start: string, end: string) {
  return key >= start && key <= end;
}

function periodState(
  sessions: readonly ScheduleBloodPressureSession[],
  period: "morning" | "evening",
  thresholds: BloodPressureThresholds,
  nowTimestamp: number,
): BloodPressurePeriodState {
  const matches = sessions.filter((session) => session.period === period);
  if (matches.some((session) => assessBloodPressureSession(session, thresholds).trendEligible)) {
    return "complete";
  }
  if (
    matches.some((session) => {
      const assessment = assessBloodPressureSession(session, thresholds);
      if (assessment.pairStatus !== "partial" || session.pairingClosedAt) {
        return false;
      }
      const firstReading = session.readings?.[0];
      if (!firstReading) return false;
      const firstAt = readingInstant(firstReading);
      const fallbackAt =
        typeof session.measuredAt === "string"
          ? Date.parse(session.measuredAt)
          : Number.NaN;
      const recordedAt = firstAt ?? (Number.isFinite(fallbackAt) ? fallbackAt : null);
      if (recordedAt === null) return false;
      const age = nowTimestamp - recordedAt;
      return age >= -10 * 60_000 && age <= BP_PAIR_MAX_INTERVAL_SECONDS * 1000;
    })
  ) {
    return "partial";
  }
  if (matches.some((session) => assessBloodPressureSession(session, thresholds).readingCount > 0)) {
    return "incomplete";
  }
  return "missing";
}

export function evaluateBloodPressurePlan(
  input: BloodPressurePlanInput,
): BloodPressurePlan {
  const currentCareDayKey = validDateKey(input.currentCareDayKey)
    ? input.currentCareDayKey
    : careDayKeyForInstant(input.now);
  const sessions = input.sessions ?? [];
  const thresholds: BloodPressureThresholds = {
    targetSystolic: input.targetSystolic,
    targetDiastolic: input.targetDiastolic,
    lowSystolic: input.lowSystolic,
    lowDiastolic: input.lowDiastolic,
    severeSystolic: input.severeSystolic,
    severeDiastolic: input.severeDiastolic,
  };
  const keyed = sessions
    .map((session) => ({
      session,
      key: entryCareDayKey(session),
      assessment: assessBloodPressureSession(session, thresholds),
    }))
    .filter(
      (item): item is typeof item & { key: string } => typeof item.key === "string",
    );
  const currentSessions = keyed
    .filter((item) => item.key === currentCareDayKey)
    .map((item) => item.session);

  const nowTimestamp = asDate(input.now).getTime();
  const urgentWindowMs = Math.max(1, input.urgentWindowMinutes ?? 60) * 60_000;
  const urgentRecord = keyed.find((item) => {
    if (item.key !== currentCareDayKey || !item.assessment.rawSevere) return false;
    const measuredAt =
      typeof item.session.measuredAt === "string"
        ? Date.parse(item.session.measuredAt)
        : Number.NaN;
    const age = nowTimestamp - measuredAt;
    return Number.isFinite(age) && age >= -10 * 60_000 && age <= urgentWindowMs;
  });
  const urgent = Boolean(urgentRecord);
  const lookback = Math.max(2, Math.round(input.trendLookbackCareDays ?? 14));
  const lookbackStart = addCareDays(currentCareDayKey, -(lookback - 1));
  const trendRecords = keyed.filter(
    (item) =>
      keyInRange(item.key, lookbackStart, currentCareDayKey) &&
      item.assessment.trendEligible &&
      !item.assessment.rawSevere,
  );
  const qualifyingHighCareDays = [
    ...new Set(
      trendRecords.filter((item) => item.assessment.highPair).map((item) => item.key),
    ),
  ].sort();
  const qualifyingLowCareDays = [
    ...new Set(
      trendRecords.filter((item) => item.assessment.lowPair).map((item) => item.key),
    ),
  ].sort();

  let enhancedReason: BloodPressureEnhancedReason | null = null;
  if (qualifyingHighCareDays.length >= 2 && qualifyingLowCareDays.length >= 2) {
    enhancedReason = "mixed-out-of-range";
  } else if (qualifyingHighCareDays.length >= 2) {
    enhancedReason = "recurrent-high";
  } else if (qualifyingLowCareDays.length >= 2) {
    enhancedReason = "recurrent-low";
  } else if (qualifyingHighCareDays.length === 1) {
    enhancedReason = "single-high";
  } else if (qualifyingLowCareDays.length === 1) {
    enhancedReason = "single-low";
  }

  // A newly recorded recurrent out-of-range pair should renew the suggested
  // seven-Care-Day run instead of anchoring it to an older, already-expired pair.
  const highTriggerKey = qualifyingHighCareDays.at(-1);
  const lowTriggerKey = qualifyingLowCareDays.at(-1);
  const enhancedStartKey =
    enhancedReason === "recurrent-high" || enhancedReason === "single-high"
      ? highTriggerKey
      : enhancedReason === "recurrent-low" || enhancedReason === "single-low"
        ? lowTriggerKey
        : enhancedReason === "mixed-out-of-range" && highTriggerKey && lowTriggerKey
          ? highTriggerKey > lowTriggerKey
            ? highTriggerKey
            : lowTriggerKey
          : undefined;
  const enhancedEndKey = enhancedStartKey
    ? addCareDays(enhancedStartKey, 6)
    : undefined;
  const enhancedCycleActive = Boolean(
    enhancedStartKey &&
      enhancedEndKey &&
      keyInRange(currentCareDayKey, enhancedStartKey, enhancedEndKey),
  );

  const cycleStart = validDateKey(input.cycleStartKey) ? input.cycleStartKey : null;
  const cycleEnd = validDateKey(input.cycleEndKey) ? input.cycleEndKey : null;
  const baseCycleActive = Boolean(
    cycleStart &&
      cycleEnd &&
      cycleStart <= cycleEnd &&
      keyInRange(currentCareDayKey, cycleStart, cycleEnd),
  );
  const reminderEnabled = input.reminderEnabled !== false;
  const postCycleGraceEnd = cycleEnd ? addCareDays(cycleEnd, 3) : null;
  let trailingMissedCycleCareDays = 0;
  if (cycleStart && cycleEnd && cycleStart <= cycleEnd) {
    let cursor = cycleEnd;
    while (cursor >= cycleStart) {
      const hasAnyRecordedReading = keyed.some(
        (item) => item.key === cursor && item.assessment.trendEligible,
      );
      if (hasAnyRecordedReading) break;
      trailingMissedCycleCareDays += 1;
      cursor = addCareDays(cursor, -1);
    }
  }
  const hasPostCycleRecoveryReading = Boolean(
    cycleEnd &&
      keyed.some(
        (item) =>
          item.key > cycleEnd &&
          item.key <= currentCareDayKey &&
          item.assessment.trendEligible,
      ),
  );
  const postCycleFollowUp = Boolean(
    cycleEnd &&
      postCycleGraceEnd &&
      currentCareDayKey > cycleEnd &&
      currentCareDayKey <= postCycleGraceEnd &&
      trailingMissedCycleCareDays > 0 &&
      !hasPostCycleRecoveryReading,
  );
  const active =
    urgent ||
    (reminderEnabled &&
      (baseCycleActive || enhancedCycleActive || postCycleFollowUp));
  const mode: BloodPressurePlanMode = urgent
    ? "urgent"
    : reminderEnabled && (baseCycleActive || postCycleFollowUp)
      ? "scheduled"
      : reminderEnabled && enhancedCycleActive
        ? "enhanced"
        : "inactive";

  let missingStreak = 0;
  const activePlanStart =
    baseCycleActive || postCycleFollowUp
      ? cycleStart
      : enhancedCycleActive
        ? enhancedStartKey
        : null;
  if (active && activePlanStart) {
    let cursor = addCareDays(currentCareDayKey, -1);
    while (cursor >= activePlanStart) {
      const hasAnyRecordedReading = keyed.some(
        (item) => item.key === cursor && item.assessment.trendEligible,
      );
      if (hasAnyRecordedReading) {
        break;
      }
      missingStreak += 1;
      cursor = addCareDays(cursor, -1);
    }
  }
  if (postCycleFollowUp) {
    missingStreak = Math.max(missingStreak, trailingMissedCycleCareDays);
  }
  const missingLevel: BloodPressureMissingLevel =
    missingStreak >= 3
      ? "restart"
      : missingStreak >= 2
        ? "amber"
        : missingStreak === 1
          ? "gentle"
          : "none";

  return {
    mode,
    active,
    baseCycleActive,
    enhancedCycleActive,
    postCycleFollowUp,
    enhancedReason,
    ...(enhancedStartKey || urgent || postCycleFollowUp
      ? {
          suggestedCycleStartKey:
            enhancedStartKey ?? currentCareDayKey,
          suggestedCycleEndKey:
            enhancedEndKey ?? addCareDays(currentCareDayKey, 6),
        }
      : {}),
    urgent,
    ...(urgentRecord?.session.id ? { urgentSessionId: urgentRecord.session.id } : {}),
    ...(urgentRecord?.session.period
      ? { urgentPeriod: urgentRecord.session.period }
      : {}),
    missingStreak,
    missingLevel,
    recommendRestartOrExtend: missingStreak >= 3,
    qualifyingHighCareDays,
    qualifyingLowCareDays,
    periods: {
      morning: {
        status: periodState(currentSessions, "morning", thresholds, nowTimestamp),
      },
      evening: {
        status: periodState(currentSessions, "evening", thresholds, nowTimestamp),
      },
    },
  };
}

function hasRecordForCareDay(records: readonly CareDayRecord[], key: string) {
  return records.some((record) => entryCareDayKey(record) === key);
}

function simpleDailyTask(options: {
  kind: "weight" | "diet";
  careDayKey: string;
  currentMinute: number;
  enabled: boolean;
  reminderTime: string;
  complete: boolean;
}): HealthTask {
  if (!options.enabled) {
    return {
      id: options.kind,
      kind: options.kind,
      status: "inactive",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "not-scheduled",
    };
  }
  if (options.complete) {
    return {
      id: options.kind,
      kind: options.kind,
      status: "complete",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "saved",
    };
  }
  const due = options.currentMinute >= careDayMinute(options.reminderTime);
  return {
    id: options.kind,
    kind: options.kind,
    status: due ? "due" : "upcoming",
    severity: due ? "gentle" : "neutral",
    careDayKey: options.careDayKey,
    scheduledTime: options.reminderTime,
    reason: due ? "scheduled-now" : "scheduled-later",
  };
}

function recurringTask(options: {
  kind: "waist" | "activity";
  careDayKey: string;
  currentMinute: number;
  enabled: boolean;
  reminderTime: string;
  intervalDays: number;
  records: readonly CareDayRecord[];
}): HealthTask {
  if (!options.enabled) {
    return {
      id: options.kind,
      kind: options.kind,
      status: "inactive",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "not-scheduled",
    };
  }
  if (hasRecordForCareDay(options.records, options.careDayKey)) {
    return {
      id: options.kind,
      kind: options.kind,
      status: "complete",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "saved",
    };
  }

  const priorKeys = options.records
    .map((record) => entryCareDayKey(record))
    .filter(
      (key): key is string => Boolean(key && key <= options.careDayKey),
    )
    .sort();
  const latestKey = priorKeys.at(-1);
  const intervalDays = Math.max(1, Math.round(options.intervalDays));
  const intervalReached = latestKey
    ? diffCareDays(options.careDayKey, latestKey) >= intervalDays
    : true;
  if (!intervalReached) {
    return {
      id: options.kind,
      kind: options.kind,
      status: "inactive",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "interval-not-reached",
    };
  }

  const due = options.currentMinute >= careDayMinute(options.reminderTime);
  return {
    id: options.kind,
    kind: options.kind,
    status: due ? "due" : "upcoming",
    severity: due ? "gentle" : "neutral",
    careDayKey: options.careDayKey,
    scheduledTime: options.reminderTime,
    reason: due ? "interval-due" : "scheduled-later",
  };
}

function bloodPressureTask(options: {
  period: "morning" | "evening";
  careDayKey: string;
  currentMinute: number;
  reminderTime: string;
  plan: BloodPressurePlan;
}): HealthTask {
  const kind: HealthTaskKind = `blood-pressure-${options.period}`;
  const urgentPeriod =
    options.plan.urgentPeriod === "evening" ? "evening" : "morning";
  if (options.plan.urgent && options.period === urgentPeriod) {
    return {
      id: kind,
      kind,
      status: "due",
      severity: "urgent",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "urgent-raw-reading",
    };
  }
  if (
    options.plan.urgent &&
    !options.plan.baseCycleActive &&
    !options.plan.enhancedCycleActive &&
    !options.plan.postCycleFollowUp
  ) {
    return {
      id: kind,
      kind,
      status: "inactive",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "not-scheduled",
    };
  }
  if (!options.plan.active) {
    return {
      id: kind,
      kind,
      status: "inactive",
      severity: "neutral",
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: "not-scheduled",
    };
  }
  const periodStatus = options.plan.periods[options.period].status;
  const severity: HealthTaskSeverity = options.plan.urgent
    ? "urgent"
    : options.plan.missingLevel === "restart" || options.plan.missingLevel === "amber"
      ? "amber"
      : periodStatus === "partial" || options.plan.missingLevel === "gentle"
        ? "gentle"
        : "neutral";
  if (periodStatus === "complete") {
    return {
      id: kind,
      kind,
      status: "complete",
      severity,
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: options.plan.urgent ? "urgent-raw-reading" : "saved",
    };
  }
  if (periodStatus === "partial") {
    return {
      id: kind,
      kind,
      status: "partial",
      severity,
      careDayKey: options.careDayKey,
      scheduledTime: options.reminderTime,
      reason: options.plan.urgent ? "urgent-raw-reading" : "single-reading-saved",
    };
  }

  const due = options.currentMinute >= careDayMinute(options.reminderTime);
  const reason: HealthTaskReason = options.plan.urgent
    ? "urgent-raw-reading"
    : options.plan.missingLevel === "restart"
      ? "restart-or-extend"
      : options.plan.missingLevel === "amber"
        ? "multiple-missed-care-days"
        : options.plan.missingLevel === "gentle"
          ? "one-missed-care-day"
          : periodStatus === "incomplete"
            ? "incomplete-session-saved"
          : due
            ? "scheduled-now"
            : "scheduled-later";
  return {
    id: kind,
    kind,
    status: due || options.plan.urgent ? "due" : "upcoming",
    severity:
      options.plan.urgent
        ? "urgent"
        : due && severity === "neutral"
          ? "gentle"
          : severity,
    careDayKey: options.careDayKey,
    scheduledTime: options.reminderTime,
    reason,
  };
}

export function evaluateHealthTasks(
  input: EvaluateHealthTasksInput,
): HealthTaskEvaluation {
  const settings = input.settings ?? {};
  const careDayKey = validDateKey(input.careDayKey)
    ? input.careDayKey
    : careDayKeyForInstant(input.now);
  const currentMinute = careDayMinute(input.now);
  const bloodPressurePlan = evaluateBloodPressurePlan({
    now: input.now,
    currentCareDayKey: careDayKey,
    sessions: input.bloodPressureSessions,
    reminderEnabled: settings.bpReminderEnabled,
    cycleStartKey: settings.bpCycleStartDate,
    cycleEndKey: settings.bpCycleEndDate,
    targetSystolic: settings.bpTargetSystolic,
    targetDiastolic: settings.bpTargetDiastolic,
  });

  const tasks: HealthTask[] = [
    simpleDailyTask({
      kind: "weight",
      careDayKey,
      currentMinute,
      enabled: settings.weightReminderEnabled !== false,
      reminderTime: settings.weightReminderTime ?? "08:00",
      complete: hasRecordForCareDay(input.weightEntries ?? [], careDayKey),
    }),
    bloodPressureTask({
      period: "morning",
      careDayKey,
      currentMinute,
      reminderTime: settings.bpMorningReminderTime ?? "08:10",
      plan: bloodPressurePlan,
    }),
    bloodPressureTask({
      period: "evening",
      careDayKey,
      currentMinute,
      reminderTime: settings.bpEveningReminderTime ?? "01:00",
      plan: bloodPressurePlan,
    }),
    simpleDailyTask({
      kind: "diet",
      careDayKey,
      currentMinute,
      enabled: settings.dietReminderEnabled !== false,
      reminderTime: settings.dietReminderTime ?? "23:00",
      complete: hasRecordForCareDay(input.dietCheckIns ?? [], careDayKey),
    }),
    recurringTask({
      kind: "waist",
      careDayKey,
      currentMinute,
      enabled: settings.waistReminderEnabled !== false,
      reminderTime: settings.waistReminderTime ?? "08:20",
      intervalDays: settings.waistReminderIntervalDays ?? 14,
      records: input.waistEntries ?? [],
    }),
    recurringTask({
      kind: "activity",
      careDayKey,
      currentMinute,
      enabled: settings.activityReminderEnabled !== false,
      reminderTime: settings.activityReminderTime ?? "22:30",
      intervalDays: settings.activityReminderIntervalDays ?? 7,
      records: input.activityCheckIns ?? [],
    }),
  ];

  return { careDayKey, currentMinute, bloodPressurePlan, tasks };
}
