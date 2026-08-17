import type {
  ActivityCheckIn,
  BloodPressureArm,
  BloodPressureContextFlag,
  BloodPressureCuffSite,
  BloodPressureEmergencySymptom,
  BloodPressureMedicationTiming,
  BloodPressurePeriod,
  BloodPressurePosition,
  BloodPressureReading,
  BloodPressureSession,
  BloodPressureSymptom,
  DietAdherence,
  DietCheckIn,
  ExerciseActivityType,
  ExerciseIntensity,
  ExerciseSession,
  HealthDeletionTombstones,
  HealthProfile,
  HealthSettings,
  PerceivedConditioning,
  StrengthExerciseLog,
  StrengthMuscleGroup,
  StrengthResistanceType,
  WaistEntry,
  WaistMeasurementMethod,
  WeightEntry,
} from "@/types/health";

export type HealthSyncData = {
  schemaVersion: number;
  weightEntries: WeightEntry[];
  bloodPressureSessions: BloodPressureSession[];
  dietCheckIns: DietCheckIn[];
  waistEntries: WaistEntry[];
  activityCheckIns: ActivityCheckIn[];
  exerciseSessions: ExerciseSession[];
  deletedEntryIds: HealthDeletionTombstones;
  profile: HealthProfile;
  profileUpdatedAt: string;
  settings: HealthSettings;
  settingsUpdatedAt: string;
  updatedAt: string;
};

export const HEALTH_SCHEMA_VERSION = 5;
export const BASELINE_WEIGHT_ENTRY_ID = "weight-baseline-2026-08-13-93-6";
export const BASELINE_WAIST_ENTRY_ID = "waist-baseline-2026-08-13-115";

const BASELINE_MEASURED_AT = "2026-08-13T00:00:00+03:30";
const HEALTH_SYNC_EPOCH = "1970-01-01T00:00:00.000Z";

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = {
  baselineWeightKg: 93.6,
  baselineDate: "2026-08-13",
  goalWeightKg: 80,
  weightReminderEnabled: true,
  weightReminderTime: "08:00",
  bpReminderEnabled: true,
  bpMorningReminderTime: "08:10",
  bpEveningReminderTime: "01:00",
  bpCycleStartDate: "2026-08-13",
  bpCycleEndDate: "2026-08-19",
  preferredBpArm: "unknown",
  bpTargetSystolic: 135,
  bpTargetDiastolic: 85,
  bpDeviceModel: "",
  bpCuffSize: "",
  dietReminderEnabled: true,
  dietReminderTime: "23:00",
  waistReminderEnabled: true,
  waistReminderTime: "08:20",
  waistReminderIntervalDays: 14,
  activityReminderEnabled: true,
  activityReminderTime: "22:30",
  activityReminderIntervalDays: 7,
  browserNotifications: false,
};

export const DEFAULT_HEALTH_PROFILE: HealthProfile = {
  dateOfBirth: "1990-08-10",
  heightCm: 179,
  waistCircumferenceCm: 115,
  waistMeasuredAt: "2026-08-13",
  waistMeasurementMethod: "unspecified",
  activityLevel: "sedentary",
  activityNotes:
    "Self-reported long-term muscle weakness after years of desk work, with very little movement and no regular exercise.",
  dietClinicianName: "دکتر جهانگیری",
  dietStartDate: "2026-08-13",
};

const EMERGENCY_SYMPTOMS = new Set<BloodPressureEmergencySymptom>([
  "chest-pain",
  "shortness-of-breath",
  "back-pain",
  "numbness",
  "weakness",
  "vision-change",
  "difficulty-speaking",
]);

const BP_CONTEXT_FLAGS = new Set<BloodPressureContextFlag>([
  "emotional-stress",
  "relationship-conflict",
  "acute-pain",
  "acute-illness",
  "poor-sleep",
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

const BP_SYMPTOMS = new Set<BloodPressureSymptom>([
  "dizziness",
  "fainting",
  "nausea",
  "confusion",
  "blurred-vision",
  "palpitations",
]);

const EXERCISE_ACTIVITY_TYPES = new Set<ExerciseActivityType>([
  "stationary-bike",
  "walking",
  "outdoor-cycling",
  "running",
  "elliptical",
  "swimming",
  "strength-training",
  "mobility",
  "other-aerobic",
  "other",
]);

const AEROBIC_EXERCISE_ACTIVITY_TYPES = new Set<ExerciseActivityType>([
  "stationary-bike",
  "walking",
  "outdoor-cycling",
  "running",
  "elliptical",
  "swimming",
  "other-aerobic",
]);

export function isAerobicExerciseActivityType(
  activityType: ExerciseActivityType,
) {
  return AEROBIC_EXERCISE_ACTIVITY_TYPES.has(activityType);
}

const EXERCISE_INTENSITIES = new Set<ExerciseIntensity>([
  "light",
  "moderate",
  "vigorous",
  "unknown",
]);

const STRENGTH_MUSCLE_GROUPS = new Set<StrengthMuscleGroup>([
  "legs",
  "hips",
  "back",
  "abdomen",
  "chest",
  "shoulders",
  "arms",
]);

const STRENGTH_RESISTANCE_TYPES = new Set<StrengthResistanceType>([
  "bodyweight",
  "free-weight",
  "machine",
  "band",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function finiteInteger(value: unknown, minimum: number, maximum: number) {
  const number = finiteNumber(value, minimum, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function validIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validDateKey(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function previousDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Maps a real instant to the Tehran noon-to-noon Care Day that owns it. */
export function getHealthCareDayKey(value: string | Date): string | null {
  if (typeof value === "string" && validDateKey(value)) return value;
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const dateKey = `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`;
  const hour = Number(valueOf("hour"));
  return hour < 12 ? previousDateKey(dateKey) : dateKey;
}

export function getExerciseSessionTehranDateKey(
  session: Pick<ExerciseSession, "endedAt">,
) {
  const value = session.endedAt;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`;
}

export function getTrailingTehranDateKeys(
  endDateKey: string,
  dayCount: number,
) {
  if (
    !validDateKey(endDateKey) ||
    !Number.isInteger(dayCount) ||
    dayCount < 1 ||
    dayCount > 10_000
  ) {
    return [];
  }
  const [year, month, day] = endDateKey.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day));
  if (endDate.toISOString().slice(0, 10) !== endDateKey) return [];
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(
      Date.UTC(year, month - 1, day - (dayCount - 1 - index)),
    );
    return date.toISOString().slice(0, 10);
  });
}

export type ExercisePeriodSummary = {
  sessions: ExerciseSession[];
  activeDayCount: number;
  totalMinutes: number;
  moderateAerobicMinutes: number;
  vigorousAerobicMinutes: number;
  moderateEquivalentMinutes: number;
  strengthDayCount: number;
  totalDeviceReportedCaloriesKcal: number;
  deviceCalorieSessionCount: number;
};

/** Derives report metrics from raw sessions; no aggregate is persisted. */
export function summarizeExerciseSessions(
  sessions: readonly ExerciseSession[],
  calendarDateKeys: readonly string[] | null,
): ExercisePeriodSummary {
  const includedDates =
    calendarDateKeys === null ? null : new Set(calendarDateKeys);
  const includedSessions = sessions.filter((session) => {
    const key = getExerciseSessionTehranDateKey(session);
    if (!key) return false;
    return includedDates === null || includedDates.has(key);
  });
  const aerobicSessions = includedSessions.filter((session) =>
    AEROBIC_EXERCISE_ACTIVITY_TYPES.has(session.activityType),
  );
  const moderateAerobicMinutes = aerobicSessions
    .filter((session) => session.intensity === "moderate")
    .reduce((total, session) => total + session.durationMinutes, 0);
  const vigorousAerobicMinutes = aerobicSessions
    .filter((session) => session.intensity === "vigorous")
    .reduce((total, session) => total + session.durationMinutes, 0);
  const strengthDates = includedSessions
    .filter((session) => session.activityType === "strength-training")
    .map((session) => getExerciseSessionTehranDateKey(session))
    .filter((key): key is string => Boolean(key));
  const activeDates = includedSessions
    .map((session) => getExerciseSessionTehranDateKey(session))
    .filter((key): key is string => Boolean(key));
  const sessionsWithDeviceCalories = includedSessions.filter(
    (session) => session.deviceReportedCaloriesKcal !== undefined,
  );

  return {
    sessions: includedSessions,
    activeDayCount: new Set(activeDates).size,
    totalMinutes: includedSessions.reduce(
      (total, session) => total + session.durationMinutes,
      0,
    ),
    moderateAerobicMinutes,
    vigorousAerobicMinutes,
    moderateEquivalentMinutes:
      moderateAerobicMinutes + vigorousAerobicMinutes * 2,
    strengthDayCount: new Set(strengthDates).size,
    totalDeviceReportedCaloriesKcal: sessionsWithDeviceCalories.reduce(
      (total, session) => total + (session.deviceReportedCaloriesKcal ?? 0),
      0,
    ),
    deviceCalorieSessionCount: sessionsWithDeviceCalories.length,
  };
}

function normalizeCareDayKey(value: unknown, measuredAt: string) {
  return validDateKey(value)
    ? (value as string)
    : (getHealthCareDayKey(measuredAt) ?? measuredAt.slice(0, 10));
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 2000)
    : undefined;
}

function normalizeShortText(value: unknown, maximum = 200) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeStringSet<T extends string>(value: unknown, allowed: Set<T>) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (item): item is T =>
              typeof item === "string" && allowed.has(item as T),
          ),
        ),
      )
    : [];
}

function normalizeWeightEntry(value: unknown): WeightEntry | null {
  if (!isRecord(value)) return null;
  const weightKg = finiteNumber(value.weightKg, 25, 350);
  if (
    typeof value.id !== "string" ||
    !value.id ||
    weightKg === null ||
    !validIso(value.measuredAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    weightKg,
    measuredAt: value.measuredAt as string,
    careDayKey:
      value.id === BASELINE_WEIGHT_ENTRY_ID && !validDateKey(value.careDayKey)
        ? DEFAULT_HEALTH_SETTINGS.baselineDate
        : normalizeCareDayKey(value.careDayKey, value.measuredAt as string),
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizePressureReading(value: unknown) {
  if (!isRecord(value)) return null;
  const systolic = finiteNumber(value.systolic, 50, 280);
  const diastolic = finiteNumber(value.diastolic, 30, 180);
  const pulseBpm = finiteNumber(value.pulseBpm, 25, 240);
  if (systolic === null || diastolic === null || systolic <= diastolic) {
    return null;
  }

  return {
    systolic,
    diastolic,
    ...(pulseBpm === null ? {} : { pulseBpm }),
    ...(validIso(value.measuredAt)
      ? { measuredAt: value.measuredAt as string }
      : {}),
  };
}

export type NewBloodPressureReading = BloodPressureReading & {
  pulseBpm: number;
};

/**
 * New readings must include the pulse shown by the monitor. The storage
 * normalizer above deliberately stays permissive so legacy readings without a
 * pulse remain readable and syncable.
 */
export function normalizeNewBloodPressureReading(
  value: unknown,
): NewBloodPressureReading | null {
  const reading = normalizePressureReading(value);
  if (!reading || typeof reading.pulseBpm !== "number") return null;
  return reading as NewBloodPressureReading;
}

function normalizeBloodPressureSession(
  value: unknown,
): BloodPressureSession | null {
  if (!isRecord(value) || !Array.isArray(value.readings)) return null;
  const readings = value.readings.slice(0, 2).flatMap((reading) => {
    const normalized = normalizePressureReading(reading);
    return normalized ? [normalized] : [];
  });
  const period: BloodPressurePeriod | null =
    value.period === "morning" ||
    value.period === "evening" ||
    value.period === "other"
      ? value.period
      : null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    readings.length < 1 ||
    !period ||
    !validIso(value.measuredAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }

  const emergencySymptoms = normalizeStringSet(
    value.emergencySymptoms,
    EMERGENCY_SYMPTOMS,
  );
  const arm: BloodPressureArm =
    value.arm === "left" || value.arm === "right" ? value.arm : "unknown";
  const position: BloodPressurePosition =
    value.position === "seated" ||
    value.position === "standing" ||
    value.position === "lying"
      ? value.position
      : "unknown";
  const cuffSite: BloodPressureCuffSite =
    value.cuffSite === "upper-arm" ||
    value.cuffSite === "wrist" ||
    value.cuffSite === "other"
      ? value.cuffSite
      : "unknown";
  const medicationTiming: BloodPressureMedicationTiming =
    value.medicationTiming === "before-dose" ||
    value.medicationTiming === "after-dose"
      ? value.medicationTiming
      : "unknown";

  return {
    id: value.id,
    measuredAt: value.measuredAt as string,
    careDayKey: normalizeCareDayKey(
      value.careDayKey,
      value.measuredAt as string,
    ),
    ...(validIso(value.pairingClosedAt)
      ? { pairingClosedAt: value.pairingClosedAt as string }
      : {}),
    period,
    readings:
      readings.length === 1
        ? [readings[0]]
        : [readings[0], readings[1]],
    arm,
    position,
    cuffSite,
    medicationTiming,
    standardConditions:
      typeof value.standardConditions === "boolean"
        ? value.standardConditions
        : null,
    contextFlags: normalizeStringSet(value.contextFlags, BP_CONTEXT_FLAGS),
    symptoms: normalizeStringSet(value.symptoms, BP_SYMPTOMS),
    emergencySymptoms,
    triggeredBySymptoms: value.triggeredBySymptoms === true,
    irregularHeartbeat:
      typeof value.irregularHeartbeat === "boolean"
        ? value.irregularHeartbeat
        : null,
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizeDietCheckIn(value: unknown): DietCheckIn | null {
  if (!isRecord(value)) return null;
  const adherence: DietAdherence | null =
    value.adherence === "on-plan" ||
    value.adherence === "mostly-on-plan" ||
    value.adherence === "off-plan"
      ? value.adherence
      : null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    !adherence ||
    !validIso(value.measuredAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    measuredAt: value.measuredAt as string,
    careDayKey: normalizeCareDayKey(
      value.careDayKey,
      value.measuredAt as string,
    ),
    adherence,
    sodiumAware: value.sodiumAware === true,
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizeWaistEntry(value: unknown): WaistEntry | null {
  if (!isRecord(value)) return null;
  const waistCircumferenceCm = finiteNumber(
    value.waistCircumferenceCm,
    30,
    250,
  );
  const measuredAtIsDate = validDateKey(value.measuredAt);
  if (
    typeof value.id !== "string" ||
    !value.id ||
    waistCircumferenceCm === null ||
    (!measuredAtIsDate && !validIso(value.measuredAt)) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }
  const measurementMethod: WaistMeasurementMethod =
    value.measurementMethod === "midpoint" || value.measurementMethod === "other"
      ? value.measurementMethod
      : "unspecified";
  const measuredAt = value.measuredAt as string;

  return {
    id: value.id,
    waistCircumferenceCm,
    measuredAt,
    measuredAtPrecision: measuredAtIsDate ? "date" : "instant",
    careDayKey: normalizeCareDayKey(value.careDayKey, measuredAt),
    measurementMethod,
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizeActivityCheckIn(value: unknown): ActivityCheckIn | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !validIso(value.measuredAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }
  const movementMinutes = finiteNumber(value.movementMinutes, 0, 10_080);
  const strengthSessions = finiteNumber(value.strengthSessions, 0, 7);
  const sedentaryHoursPerDay = finiteNumber(value.sedentaryHoursPerDay, 0, 24);
  const perceivedConditioning: PerceivedConditioning | undefined =
    value.perceivedConditioning === "better" ||
    value.perceivedConditioning === "same" ||
    value.perceivedConditioning === "worse"
      ? value.perceivedConditioning
      : undefined;
  const measuredAt = value.measuredAt as string;

  return {
    id: value.id,
    measuredAt,
    careDayKey: normalizeCareDayKey(value.careDayKey, measuredAt),
    ...(movementMinutes === null ? {} : { movementMinutes }),
    ...(strengthSessions === null
      ? {}
      : { strengthSessions: Math.round(strengthSessions) }),
    ...(sedentaryHoursPerDay === null ? {} : { sedentaryHoursPerDay }),
    ...(perceivedConditioning ? { perceivedConditioning } : {}),
    symptoms: normalizeOptionalText(value.symptoms),
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizeStrengthExercise(value: unknown): StrengthExerciseLog | null {
  if (!isRecord(value)) return null;
  const name = normalizeShortText(value.name, 100);
  const setCount = finiteInteger(value.setCount, 1, 100);
  if (typeof value.id !== "string" || !value.id || !name || setCount === null) {
    return null;
  }
  const resistanceType = STRENGTH_RESISTANCE_TYPES.has(
    value.resistanceType as StrengthResistanceType,
  )
    ? (value.resistanceType as StrengthResistanceType)
    : "other";
  const totalReps = finiteInteger(value.totalReps, 1, 10_000);
  const loadKg = finiteNumber(value.loadKg, 0.1, 1_000);

  return {
    id: value.id,
    name,
    muscleGroups: normalizeStringSet(
      value.muscleGroups,
      STRENGTH_MUSCLE_GROUPS,
    ),
    resistanceType,
    setCount,
    ...(totalReps === null ? {} : { totalReps }),
    ...(loadKg === null ? {} : { loadKg }),
  };
}

function normalizeExerciseSession(value: unknown): ExerciseSession | null {
  if (!isRecord(value)) return null;
  const activityType = EXERCISE_ACTIVITY_TYPES.has(
    value.activityType as ExerciseActivityType,
  )
    ? (value.activityType as ExerciseActivityType)
    : null;
  const intensity = EXERCISE_INTENSITIES.has(
    value.intensity as ExerciseIntensity,
  )
    ? (value.intensity as ExerciseIntensity)
    : null;
  const durationMinutes = finiteNumber(value.durationMinutes, 1, 1_440);
  if (
    typeof value.id !== "string" ||
    !value.id ||
    !activityType ||
    !intensity ||
    durationMinutes === null ||
    !validIso(value.endedAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }

  const perceivedExertion = finiteNumber(value.perceivedExertion, 0, 10);
  const distanceKm = finiteNumber(value.distanceKm, 0.01, 1_000);
  const steps = finiteInteger(value.steps, 1, 250_000);
  const averageHeartRateBpm = finiteInteger(
    value.averageHeartRateBpm,
    25,
    240,
  );
  const averageCadenceRpm = finiteInteger(value.averageCadenceRpm, 1, 250);
  const deviceReportedCaloriesKcal = finiteInteger(
    value.deviceReportedCaloriesKcal,
    1,
    20_000,
  );
  const seenStrengthExerciseIds = new Set<string>();
  const strengthExercises =
    activityType === "strength-training" && Array.isArray(value.strengthExercises)
      ? value.strengthExercises.slice(0, 50).flatMap((exercise) => {
          const normalized = normalizeStrengthExercise(exercise);
          if (!normalized || seenStrengthExerciseIds.has(normalized.id)) return [];
          seenStrengthExerciseIds.add(normalized.id);
          return [normalized];
        })
      : [];
  const customActivityName =
    activityType === "other" || activityType === "other-aerobic"
      ? normalizeShortText(value.customActivityName, 100)
      : "";
  if (
    (activityType === "other" || activityType === "other-aerobic") &&
    !customActivityName
  ) {
    return null;
  }
  const endedAt = value.endedAt as string;

  return {
    id: value.id,
    endedAt,
    ...(validDateKey(value.careDayKey)
      ? { careDayKey: value.careDayKey as string }
      : {}),
    activityType,
    ...(customActivityName ? { customActivityName } : {}),
    durationMinutes,
    intensity,
    ...(perceivedExertion === null ? {} : { perceivedExertion }),
    ...(distanceKm === null ? {} : { distanceKm }),
    ...(steps === null ? {} : { steps }),
    ...(averageHeartRateBpm === null
      ? {}
      : { averageHeartRateBpm }),
    ...(averageCadenceRpm === null
      ? {}
      : { averageCadenceRpm }),
    ...(deviceReportedCaloriesKcal === null
      ? {}
      : { deviceReportedCaloriesKcal }),
    ...(normalizeShortText(value.equipmentName, 100)
      ? { equipmentName: normalizeShortText(value.equipmentName, 100) }
      : {}),
    ...(normalizeShortText(value.resistanceLevel, 60)
      ? { resistanceLevel: normalizeShortText(value.resistanceLevel, 60) }
      : {}),
    ...(strengthExercises.length ? { strengthExercises } : {}),
    symptoms: normalizeOptionalText(value.symptoms),
    notes: normalizeOptionalText(value.notes),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && !!id)))
    : [];
}

function normalizeTombstones(value: unknown): HealthDeletionTombstones {
  const source = isRecord(value) ? value : {};
  return {
    weightEntryIds: normalizeIds(source.weightEntryIds),
    bloodPressureSessionIds: normalizeIds(source.bloodPressureSessionIds),
    dietCheckInIds: normalizeIds(source.dietCheckInIds),
    waistEntryIds: normalizeIds(source.waistEntryIds),
    activityCheckInIds: normalizeIds(source.activityCheckInIds),
    exerciseSessionIds: normalizeIds(source.exerciseSessionIds),
  };
}

function normalizeSettings(value: unknown): HealthSettings {
  const source = isRecord(value) ? value : {};
  const baselineWeightKg = finiteNumber(source.baselineWeightKg, 25, 350);
  const goalWeightKg = finiteNumber(source.goalWeightKg, 25, 350);
  const bpTargetSystolic = finiteNumber(source.bpTargetSystolic, 80, 220);
  const bpTargetDiastolic = finiteNumber(source.bpTargetDiastolic, 40, 140);
  const waistReminderIntervalDays = finiteNumber(
    source.waistReminderIntervalDays,
    1,
    365,
  );
  const activityReminderIntervalDays = finiteNumber(
    source.activityReminderIntervalDays,
    1,
    365,
  );

  return {
    baselineWeightKg: baselineWeightKg ?? DEFAULT_HEALTH_SETTINGS.baselineWeightKg,
    baselineDate: validDateKey(source.baselineDate)
      ? (source.baselineDate as string)
      : DEFAULT_HEALTH_SETTINGS.baselineDate,
    goalWeightKg: goalWeightKg ?? DEFAULT_HEALTH_SETTINGS.goalWeightKg,
    weightReminderEnabled: source.weightReminderEnabled !== false,
    weightReminderTime: validTime(source.weightReminderTime)
      ? (source.weightReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.weightReminderTime,
    bpReminderEnabled: source.bpReminderEnabled !== false,
    bpMorningReminderTime: validTime(source.bpMorningReminderTime)
      ? (source.bpMorningReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.bpMorningReminderTime,
    bpEveningReminderTime: validTime(source.bpEveningReminderTime)
      ? (source.bpEveningReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.bpEveningReminderTime,
    bpCycleStartDate: validDateKey(source.bpCycleStartDate)
      ? (source.bpCycleStartDate as string)
      : DEFAULT_HEALTH_SETTINGS.bpCycleStartDate,
    bpCycleEndDate: validDateKey(source.bpCycleEndDate)
      ? (source.bpCycleEndDate as string)
      : DEFAULT_HEALTH_SETTINGS.bpCycleEndDate,
    preferredBpArm:
      source.preferredBpArm === "left" || source.preferredBpArm === "right"
        ? source.preferredBpArm
        : "unknown",
    bpTargetSystolic:
      bpTargetSystolic ?? DEFAULT_HEALTH_SETTINGS.bpTargetSystolic,
    bpTargetDiastolic:
      bpTargetDiastolic ?? DEFAULT_HEALTH_SETTINGS.bpTargetDiastolic,
    bpDeviceModel: normalizeShortText(source.bpDeviceModel),
    bpCuffSize: normalizeShortText(source.bpCuffSize),
    dietReminderEnabled: source.dietReminderEnabled !== false,
    dietReminderTime: validTime(source.dietReminderTime)
      ? (source.dietReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.dietReminderTime,
    waistReminderEnabled: source.waistReminderEnabled !== false,
    waistReminderTime: validTime(source.waistReminderTime)
      ? (source.waistReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.waistReminderTime,
    waistReminderIntervalDays: Math.round(
      waistReminderIntervalDays ??
        DEFAULT_HEALTH_SETTINGS.waistReminderIntervalDays,
    ),
    activityReminderEnabled: source.activityReminderEnabled !== false,
    activityReminderTime: validTime(source.activityReminderTime)
      ? (source.activityReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.activityReminderTime,
    activityReminderIntervalDays: Math.round(
      activityReminderIntervalDays ??
        DEFAULT_HEALTH_SETTINGS.activityReminderIntervalDays,
    ),
    browserNotifications: source.browserNotifications === true,
  };
}

function normalizeProfile(value: unknown): HealthProfile {
  const source = isRecord(value) ? value : {};
  const heightCm = finiteNumber(source.heightCm, 100, 250);
  const waistCircumferenceCm = finiteNumber(
    source.waistCircumferenceCm,
    30,
    250,
  );
  const waistMeasurementMethod =
    source.waistMeasurementMethod === "midpoint" ||
    source.waistMeasurementMethod === "other" ||
    source.waistMeasurementMethod === "unspecified"
      ? source.waistMeasurementMethod
      : DEFAULT_HEALTH_PROFILE.waistMeasurementMethod;
  const activityLevel =
    source.activityLevel === "light" ||
    source.activityLevel === "moderate" ||
    source.activityLevel === "high" ||
    source.activityLevel === "sedentary"
      ? source.activityLevel
      : DEFAULT_HEALTH_PROFILE.activityLevel;

  return {
    dateOfBirth: validDateKey(source.dateOfBirth)
      ? (source.dateOfBirth as string)
      : DEFAULT_HEALTH_PROFILE.dateOfBirth,
    heightCm: heightCm ?? DEFAULT_HEALTH_PROFILE.heightCm,
    waistCircumferenceCm:
      waistCircumferenceCm ?? DEFAULT_HEALTH_PROFILE.waistCircumferenceCm,
    waistMeasuredAt: validDateKey(source.waistMeasuredAt)
      ? (source.waistMeasuredAt as string)
      : DEFAULT_HEALTH_PROFILE.waistMeasuredAt,
    waistMeasurementMethod,
    activityLevel,
    activityNotes:
      normalizeOptionalText(source.activityNotes) ??
      DEFAULT_HEALTH_PROFILE.activityNotes,
    dietClinicianName:
      normalizeOptionalText(source.dietClinicianName) ??
      DEFAULT_HEALTH_PROFILE.dietClinicianName,
    dietStartDate: validDateKey(source.dietStartDate)
      ? (source.dietStartDate as string)
      : DEFAULT_HEALTH_PROFILE.dietStartDate,
  };
}

function mergeRecordsById<T extends { id: string; updatedAt: string }>(
  first: T[],
  second: T[],
  deletedIds: string[],
) {
  const deleted = new Set(deletedIds);
  const byId = new Map<string, T>();
  for (const record of [...first, ...second]) {
    if (deleted.has(record.id)) continue;
    const current = byId.get(record.id);
    if (!current || Date.parse(record.updatedAt) > Date.parse(current.updatedAt)) {
      byId.set(record.id, record);
    }
  }
  return Array.from(byId.values());
}

function createProfileWaistBaseline(
  profile: HealthProfile,
  createdAt: string,
): WaistEntry {
  return {
    id: BASELINE_WAIST_ENTRY_ID,
    waistCircumferenceCm: profile.waistCircumferenceCm,
    measuredAt: profile.waistMeasuredAt,
    measuredAtPrecision: "date",
    careDayKey: profile.waistMeasuredAt,
    measurementMethod: profile.waistMeasurementMethod,
    notes: "Baseline supplied by the user; exact measurement time was not recorded.",
    createdAt,
    updatedAt: createdAt,
  };
}

export function createDefaultHealthData(now = new Date()): HealthSyncData {
  const createdAt = now.toISOString();
  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    weightEntries: [
      {
        id: BASELINE_WEIGHT_ENTRY_ID,
        weightKg: 93.6,
        measuredAt: BASELINE_MEASURED_AT,
        careDayKey: DEFAULT_HEALTH_SETTINGS.baselineDate,
        notes: "Baseline supplied by the user; exact measurement time was not recorded.",
        // Seed freshness must never outrank an actual cloud migration on a new
        // browser merely because this fallback was constructed later.
        createdAt: HEALTH_SYNC_EPOCH,
        updatedAt: HEALTH_SYNC_EPOCH,
      },
    ],
    bloodPressureSessions: [],
    dietCheckIns: [],
    waistEntries: [
      createProfileWaistBaseline(DEFAULT_HEALTH_PROFILE, HEALTH_SYNC_EPOCH),
    ],
    activityCheckIns: [],
    exerciseSessions: [],
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
      waistEntryIds: [],
      activityCheckInIds: [],
      exerciseSessionIds: [],
    },
    profile: { ...DEFAULT_HEALTH_PROFILE },
    // The seeded profile is a migration fallback until it is explicitly stored.
    // The epoch lets an already-edited cloud profile win on a new browser.
    profileUpdatedAt: HEALTH_SYNC_EPOCH,
    settings: DEFAULT_HEALTH_SETTINGS,
    // A newly-created local fallback has never had its settings edited. Keeping
    // this at the epoch prevents a fresh browser from outranking cloud settings.
    settingsUpdatedAt: HEALTH_SYNC_EPOCH,
    updatedAt: createdAt,
  };
}

export function normalizeHealthData(
  value: unknown,
  fallback = createDefaultHealthData(),
): HealthSyncData {
  if (!isRecord(value)) return fallback;
  const tombstones = normalizeTombstones(value.deletedEntryIds);
  const schemaVersion =
    typeof value.schemaVersion === "number" && Number.isFinite(value.schemaVersion)
      ? Math.max(0, value.schemaVersion)
      : 0;
  const weights = Array.isArray(value.weightEntries)
    ? value.weightEntries.flatMap((entry) => {
        const normalized = normalizeWeightEntry(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  const shouldSeedBaseline =
    schemaVersion < 2 &&
    !tombstones.weightEntryIds.includes(BASELINE_WEIGHT_ENTRY_ID) &&
    !weights.some((entry) => entry.id === BASELINE_WEIGHT_ENTRY_ID);
  const profile = normalizeProfile(value.profile);
  const legacySettingsUpdatedAt =
    "settings" in value && validIso(value.updatedAt)
      ? (value.updatedAt as string)
      : HEALTH_SYNC_EPOCH;
  const legacyProfileUpdatedAt =
    "profile" in value && validIso(value.updatedAt)
      ? (value.updatedAt as string)
      : HEALTH_SYNC_EPOCH;
  const profileUpdatedAt = validIso(value.profileUpdatedAt)
    ? (value.profileUpdatedAt as string)
    : legacyProfileUpdatedAt;
  const waistEntries = Array.isArray(value.waistEntries)
    ? value.waistEntries.flatMap((entry) => {
        const normalized = normalizeWaistEntry(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  const shouldSeedWaistBaseline =
    schemaVersion < 4 &&
    !tombstones.waistEntryIds.includes(BASELINE_WAIST_ENTRY_ID) &&
    !waistEntries.some((entry) => entry.id === BASELINE_WAIST_ENTRY_ID);
  const waistSeedTimestamp =
    profileUpdatedAt !== HEALTH_SYNC_EPOCH
      ? profileUpdatedAt
      : validIso(value.updatedAt)
        ? (value.updatedAt as string)
        : fallback.updatedAt;

  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    weightEntries: (shouldSeedBaseline
      ? [...fallback.weightEntries, ...weights]
      : weights
    ).filter((entry) => !tombstones.weightEntryIds.includes(entry.id)),
    bloodPressureSessions: (Array.isArray(value.bloodPressureSessions)
      ? value.bloodPressureSessions.flatMap((entry) => {
          const normalized = normalizeBloodPressureSession(entry);
          return normalized ? [normalized] : [];
        })
      : []
    ).filter((entry) => !tombstones.bloodPressureSessionIds.includes(entry.id)),
    dietCheckIns: (Array.isArray(value.dietCheckIns)
      ? value.dietCheckIns.flatMap((entry) => {
          const normalized = normalizeDietCheckIn(entry);
          return normalized ? [normalized] : [];
        })
      : []
    ).filter((entry) => !tombstones.dietCheckInIds.includes(entry.id)),
    waistEntries: (shouldSeedWaistBaseline
      ? [
          createProfileWaistBaseline(profile, waistSeedTimestamp),
          ...waistEntries,
        ]
      : waistEntries
    ).filter((entry) => !tombstones.waistEntryIds.includes(entry.id)),
    activityCheckIns: (Array.isArray(value.activityCheckIns)
      ? value.activityCheckIns.flatMap((entry) => {
          const normalized = normalizeActivityCheckIn(entry);
          return normalized ? [normalized] : [];
        })
      : []
    ).filter((entry) => !tombstones.activityCheckInIds.includes(entry.id)),
    exerciseSessions: (Array.isArray(value.exerciseSessions)
      ? value.exerciseSessions.flatMap((entry) => {
          const normalized = normalizeExerciseSession(entry);
          return normalized ? [normalized] : [];
        })
      : []
    ).filter((entry) => !tombstones.exerciseSessionIds.includes(entry.id)),
    deletedEntryIds: tombstones,
    profile,
    profileUpdatedAt,
    settings: normalizeSettings(value.settings),
    settingsUpdatedAt: validIso(value.settingsUpdatedAt)
      ? (value.settingsUpdatedAt as string)
      : legacySettingsUpdatedAt,
    updatedAt: validIso(value.updatedAt)
      ? (value.updatedAt as string)
      : fallback.updatedAt,
  };
}

export function mergeHealthData(
  cloud: HealthSyncData,
  local: HealthSyncData,
): HealthSyncData {
  const deletedEntryIds: HealthDeletionTombstones = {
    weightEntryIds: Array.from(
      new Set([...cloud.deletedEntryIds.weightEntryIds, ...local.deletedEntryIds.weightEntryIds]),
    ),
    bloodPressureSessionIds: Array.from(
      new Set([
        ...cloud.deletedEntryIds.bloodPressureSessionIds,
        ...local.deletedEntryIds.bloodPressureSessionIds,
      ]),
    ),
    dietCheckInIds: Array.from(
      new Set([...cloud.deletedEntryIds.dietCheckInIds, ...local.deletedEntryIds.dietCheckInIds]),
    ),
    waistEntryIds: Array.from(
      new Set([
        ...cloud.deletedEntryIds.waistEntryIds,
        ...local.deletedEntryIds.waistEntryIds,
      ]),
    ),
    activityCheckInIds: Array.from(
      new Set([
        ...cloud.deletedEntryIds.activityCheckInIds,
        ...local.deletedEntryIds.activityCheckInIds,
      ]),
    ),
    exerciseSessionIds: Array.from(
      new Set([
        ...cloud.deletedEntryIds.exerciseSessionIds,
        ...local.deletedEntryIds.exerciseSessionIds,
      ]),
    ),
  };
  const cloudSettingsAreNewer =
    Date.parse(cloud.settingsUpdatedAt) >= Date.parse(local.settingsUpdatedAt);
  const cloudDataIsNewer = Date.parse(cloud.updatedAt) >= Date.parse(local.updatedAt);
  const cloudProfileIsNewer =
    Date.parse(cloud.profileUpdatedAt) >= Date.parse(local.profileUpdatedAt);

  return {
    schemaVersion: Math.max(cloud.schemaVersion, local.schemaVersion),
    weightEntries: mergeRecordsById(
      cloud.weightEntries,
      local.weightEntries,
      deletedEntryIds.weightEntryIds,
    ),
    bloodPressureSessions: mergeRecordsById(
      cloud.bloodPressureSessions,
      local.bloodPressureSessions,
      deletedEntryIds.bloodPressureSessionIds,
    ),
    dietCheckIns: mergeRecordsById(
      cloud.dietCheckIns,
      local.dietCheckIns,
      deletedEntryIds.dietCheckInIds,
    ),
    waistEntries: mergeRecordsById(
      cloud.waistEntries,
      local.waistEntries,
      deletedEntryIds.waistEntryIds,
    ),
    activityCheckIns: mergeRecordsById(
      cloud.activityCheckIns,
      local.activityCheckIns,
      deletedEntryIds.activityCheckInIds,
    ),
    exerciseSessions: mergeRecordsById(
      cloud.exerciseSessions,
      local.exerciseSessions,
      deletedEntryIds.exerciseSessionIds,
    ),
    deletedEntryIds,
    profile: cloudProfileIsNewer ? cloud.profile : local.profile,
    profileUpdatedAt: cloudProfileIsNewer
      ? cloud.profileUpdatedAt
      : local.profileUpdatedAt,
    settings: cloudSettingsAreNewer ? cloud.settings : local.settings,
    settingsUpdatedAt: cloudSettingsAreNewer
      ? cloud.settingsUpdatedAt
      : local.settingsUpdatedAt,
    updatedAt: cloudDataIsNewer ? cloud.updatedAt : local.updatedAt,
  };
}
