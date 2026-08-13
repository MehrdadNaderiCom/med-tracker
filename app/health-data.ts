import type {
  BloodPressureEmergencySymptom,
  BloodPressurePeriod,
  BloodPressureSession,
  DietAdherence,
  DietCheckIn,
  HealthDeletionTombstones,
  HealthProfile,
  HealthSettings,
  WeightEntry,
} from "@/types/health";

export type HealthSyncData = {
  schemaVersion: number;
  weightEntries: WeightEntry[];
  bloodPressureSessions: BloodPressureSession[];
  dietCheckIns: DietCheckIn[];
  deletedEntryIds: HealthDeletionTombstones;
  profile: HealthProfile;
  profileUpdatedAt: string;
  settings: HealthSettings;
  settingsUpdatedAt: string;
  updatedAt: string;
};

export const HEALTH_SCHEMA_VERSION = 3;
export const BASELINE_WEIGHT_ENTRY_ID = "weight-baseline-2026-08-13-93-6";

const BASELINE_MEASURED_AT = "2026-08-13T00:00:00+03:30";
const HEALTH_SYNC_EPOCH = "1970-01-01T00:00:00.000Z";

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = {
  baselineWeightKg: 93.6,
  baselineDate: "2026-08-13",
  goalWeightKg: 80,
  weightReminderEnabled: true,
  weightReminderTime: "12:00",
  bpReminderEnabled: true,
  bpMorningReminderTime: "12:10",
  bpEveningReminderTime: "01:00",
  bpCycleStartDate: "2026-08-14",
  bpCycleEndDate: "2026-08-20",
  dietReminderEnabled: true,
  dietReminderTime: "23:00",
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

function validIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validDateKey(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 2000)
    : undefined;
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
  };
}

function normalizeBloodPressureSession(
  value: unknown,
): BloodPressureSession | null {
  if (!isRecord(value) || !Array.isArray(value.readings)) return null;
  const first = normalizePressureReading(value.readings[0]);
  const second = normalizePressureReading(value.readings[1]);
  const period: BloodPressurePeriod | null =
    value.period === "morning" ||
    value.period === "evening" ||
    value.period === "other"
      ? value.period
      : null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    !first ||
    !second ||
    !period ||
    !validIso(value.measuredAt) ||
    !validIso(value.createdAt) ||
    !validIso(value.updatedAt)
  ) {
    return null;
  }

  const emergencySymptoms = Array.isArray(value.emergencySymptoms)
    ? Array.from(
        new Set(
          value.emergencySymptoms.filter(
            (item): item is BloodPressureEmergencySymptom =>
              typeof item === "string" &&
              EMERGENCY_SYMPTOMS.has(item as BloodPressureEmergencySymptom),
          ),
        ),
      )
    : [];

  return {
    id: value.id,
    measuredAt: value.measuredAt as string,
    period,
    readings: [first, second],
    emergencySymptoms,
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
    adherence,
    sodiumAware: value.sodiumAware === true,
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
  };
}

function normalizeSettings(value: unknown): HealthSettings {
  const source = isRecord(value) ? value : {};
  const baselineWeightKg = finiteNumber(source.baselineWeightKg, 25, 350);
  const goalWeightKg = finiteNumber(source.goalWeightKg, 25, 350);

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
    dietReminderEnabled: source.dietReminderEnabled !== false,
    dietReminderTime: validTime(source.dietReminderTime)
      ? (source.dietReminderTime as string)
      : DEFAULT_HEALTH_SETTINGS.dietReminderTime,
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
    if (!current || Date.parse(record.updatedAt) >= Date.parse(current.updatedAt)) {
      byId.set(record.id, record);
    }
  }
  return Array.from(byId.values());
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
        notes: "Baseline supplied by the user; exact measurement time was not recorded.",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    bloodPressureSessions: [],
    dietCheckIns: [],
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
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
  const legacySettingsUpdatedAt =
    "settings" in value && validIso(value.updatedAt)
      ? (value.updatedAt as string)
      : HEALTH_SYNC_EPOCH;
  const legacyProfileUpdatedAt =
    "profile" in value && validIso(value.updatedAt)
      ? (value.updatedAt as string)
      : HEALTH_SYNC_EPOCH;

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
    deletedEntryIds: tombstones,
    profile: normalizeProfile(value.profile),
    profileUpdatedAt: validIso(value.profileUpdatedAt)
      ? (value.profileUpdatedAt as string)
      : legacyProfileUpdatedAt,
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
