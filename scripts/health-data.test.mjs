import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../app/health-data.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const healthDataModule = { exports: {} };

vm.runInNewContext(compiled, {
  exports: healthDataModule.exports,
  module: healthDataModule,
  Intl,
  Date,
  Set,
  Map,
  Number,
  Array,
  Math,
});

const {
  BASELINE_WAIST_ENTRY_ID,
  DEFAULT_HEALTH_PROFILE,
  DEFAULT_HEALTH_SETTINGS,
  createDefaultHealthData,
  mergeHealthData,
  normalizeHealthData,
  normalizeNewBloodPressureReading,
  getExerciseSessionTehranDateKey,
  getTrailingTehranDateKeys,
  summarizeExerciseSessions,
} = healthDataModule.exports;

const profileUpdatedAt = "2026-08-10T10:00:00.000Z";
const freshBrowserNow = new Date("2026-08-14T12:00:00.000Z");

function legacyV3(overrides = {}) {
  const fallback = createDefaultHealthData(freshBrowserNow);

  return {
    schemaVersion: 3,
    weightEntries: fallback.weightEntries,
    bloodPressureSessions: [],
    dietCheckIns: [],
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
    },
    profile: { ...DEFAULT_HEALTH_PROFILE },
    profileUpdatedAt,
    settings: { ...DEFAULT_HEALTH_SETTINGS },
    settingsUpdatedAt: profileUpdatedAt,
    updatedAt: profileUpdatedAt,
    ...overrides,
  };
}

function legacyV4(overrides = {}) {
  const source = createDefaultHealthData(freshBrowserNow);
  source.schemaVersion = 4;
  delete source.exerciseSessions;
  delete source.deletedEntryIds.exerciseSessionIds;
  return { ...source, ...overrides };
}

function exerciseSession(overrides = {}) {
  return {
    id: "exercise-session-1",
    endedAt: "2026-08-17T06:30:00.000Z",
    careDayKey: "2026-08-16",
    activityType: "stationary-bike",
    durationMinutes: 30,
    intensity: "moderate",
    createdAt: "2026-08-17T07:00:00.000Z",
    updatedAt: "2026-08-17T07:00:00.000Z",
    ...overrides,
  };
}

test("a fresh fallback cannot overwrite a migrated schema-v3 waist baseline", () => {
  const fallback = createDefaultHealthData(freshBrowserNow);
  const legacyCloud = legacyV3({
    profile: {
      ...DEFAULT_HEALTH_PROFILE,
      waistCircumferenceCm: 110,
      waistMeasuredAt: "2026-08-10",
      waistMeasurementMethod: "midpoint",
    },
  });
  const normalizedCloud = normalizeHealthData(legacyCloud, fallback);
  const merged = mergeHealthData(normalizedCloud, fallback);
  const baseline = merged.waistEntries.find(
    (entry) => entry.id === BASELINE_WAIST_ENTRY_ID,
  );

  assert.ok(baseline);
  assert.equal(baseline.waistCircumferenceCm, 110);
  assert.equal(baseline.measuredAt, "2026-08-10");
  assert.equal(merged.profile.waistCircumferenceCm, 110);
});

test("legacy two-reading BP sessions retain values and receive neutral context defaults", () => {
  const legacySession = {
    id: "legacy-bp-pair",
    measuredAt: "2026-08-14T10:00:00.000Z",
    period: "morning",
    readings: [
      { systolic: 140, diastolic: 90, pulseBpm: 70 },
      { systolic: 138, diastolic: 88, pulseBpm: 68 },
    ],
    emergencySymptoms: [],
    notes: "legacy pair",
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:02:00.000Z",
  };
  const normalized = normalizeHealthData(
    legacyV3({ bloodPressureSessions: [legacySession] }),
  );
  const session = normalized.bloodPressureSessions[0];

  assert.equal(normalized.bloodPressureSessions.length, 1);
  assert.equal(session.readings.length, 2);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        session.readings.map(({ systolic, diastolic, pulseBpm }) => ({
          systolic,
          diastolic,
          pulseBpm,
        })),
      ),
    ),
    [
      { systolic: 140, diastolic: 90, pulseBpm: 70 },
      { systolic: 138, diastolic: 88, pulseBpm: 68 },
    ],
  );
  assert.equal(session.readings[0].measuredAt, undefined);
  assert.equal(session.arm, "unknown");
  assert.equal(session.position, "unknown");
  assert.equal(session.cuffSite, "unknown");
  assert.equal(session.medicationTiming, "unknown");
  assert.equal(session.standardConditions, null);
  assert.equal(session.irregularHeartbeat, null);
});

test("supported emotional, physical, and setup BP contexts survive normalization", () => {
  const contextFlags = [
    "emotional-stress",
    "relationship-conflict",
    "acute-pain",
    "acute-illness",
    "poor-sleep",
    "rushed",
    "positioning-issue",
    "cuff-issue",
    "other",
  ];
  const session = {
    id: "bp-context-normalization",
    measuredAt: "2026-08-17T15:13:00.000Z",
    period: "other",
    readings: [
      { systolic: 130, diastolic: 80, pulseBpm: 70 },
      { systolic: 129, diastolic: 77, pulseBpm: 73 },
    ],
    contextFlags: [...contextFlags, "relationship-conflict", "unsupported-value"],
    emergencySymptoms: [],
    createdAt: "2026-08-17T15:23:44.631Z",
    updatedAt: "2026-08-17T15:26:01.526Z",
  };
  const normalized = normalizeHealthData(
    legacyV3({ bloodPressureSessions: [session] }),
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(normalized.bloodPressureSessions[0].contextFlags)),
    contextFlags,
  );
});

test("new BP readings require pulse while legacy pulse-less readings remain valid", () => {
  assert.equal(
    normalizeNewBloodPressureReading({ systolic: 124, diastolic: 76 }),
    null,
  );
  assert.equal(
    normalizeNewBloodPressureReading({
      systolic: 124,
      diastolic: 76,
      pulseBpm: 241,
    }),
    null,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        normalizeNewBloodPressureReading({
          systolic: 124,
          diastolic: 76,
          pulseBpm: 58,
        }),
      ),
    ),
    { systolic: 124, diastolic: 76, pulseBpm: 58 },
  );

  const legacyWithoutPulse = {
    id: "legacy-bp-without-pulse",
    measuredAt: "2026-08-13T15:45:00.000Z",
    period: "evening",
    readings: [
      { systolic: 123, diastolic: 78 },
      { systolic: 125, diastolic: 75 },
    ],
    createdAt: "2026-08-13T15:45:00.000Z",
    updatedAt: "2026-08-13T15:47:00.000Z",
  };
  const normalized = normalizeHealthData(
    legacyV3({ bloodPressureSessions: [legacyWithoutPulse] }),
  );
  const readings = normalized.bloodPressureSessions[0].readings;

  assert.equal(readings.length, 2);
  assert.equal("pulseBpm" in readings[0], false);
  assert.equal("pulseBpm" in readings[1], false);
});

test("a schema-v4 profile retains its date-only waist measurement date", () => {
  const source = legacyV4();
  source.profile = {
    ...source.profile,
    waistCircumferenceCm: 112,
    waistMeasuredAt: "2026-08-14",
    waistMeasurementMethod: "midpoint",
  };
  source.profileUpdatedAt = "2026-08-14T12:30:00.000Z";

  const normalized = normalizeHealthData(source);

  assert.equal(normalized.profile.waistCircumferenceCm, 112);
  assert.equal(normalized.profile.waistMeasuredAt, "2026-08-14");
  assert.equal(normalized.profile.waistMeasurementMethod, "midpoint");
});

test("schema-v3 tombstones normalize missing later-schema lists to empty arrays", () => {
  const normalized = normalizeHealthData(legacyV3());

  assert.deepEqual([...normalized.deletedEntryIds.waistEntryIds], []);
  assert.deepEqual([...normalized.deletedEntryIds.activityCheckInIds], []);
  assert.deepEqual([...normalized.deletedEntryIds.exerciseSessionIds], []);
  assert.deepEqual([...normalized.exerciseSessions], []);
});

test("schema-v4 data migrates in place to schema v5 exercise collections", () => {
  const normalized = normalizeHealthData(legacyV4());

  assert.equal(normalized.schemaVersion, 5);
  assert.deepEqual([...normalized.exerciseSessions], []);
  assert.deepEqual([...normalized.deletedEntryIds.exerciseSessionIds], []);
});

test("structured exercise sessions retain useful normalized detail", () => {
  const source = legacyV4({
    exerciseSessions: [
      exerciseSession({
        customActivityName: "  ignored for a built-in type  ",
        perceivedExertion: 5.5,
        distanceKm: 8.25,
        steps: 1200,
        averageHeartRateBpm: 112,
        averageCadenceRpm: 68,
        deviceReportedCaloriesKcal: 245,
        equipmentName: "  Home bike  ",
        resistanceLevel: "  4 / 8  ",
        strengthExercises: [
          {
            id: "should-be-ignored-for-cardio",
            name: "Squat",
            muscleGroups: ["legs"],
            resistanceType: "bodyweight",
            setCount: 2,
          },
        ],
        symptoms: "  none beyond expected exertion  ",
        notes: "  steady cadence  ",
      }),
      exerciseSession({
        id: "strength-session-1",
        activityType: "strength-training",
        careDayKey: undefined,
        durationMinutes: 25,
        intensity: "light",
        strengthExercises: [
          {
            id: "strength-exercise-1",
            name: "  Chair squat  ",
            muscleGroups: ["legs", "hips", "legs", "unsupported"],
            resistanceType: "bodyweight",
            setCount: 3,
            totalReps: 24,
            loadKg: 9999,
          },
          {
            id: "strength-exercise-1",
            name: "Duplicate should not double-count",
            muscleGroups: ["arms"],
            resistanceType: "band",
            setCount: 9,
          },
        ],
      }),
    ],
  });
  const normalized = normalizeHealthData(source);
  const bike = normalized.exerciseSessions.find(
    (session) => session.id === "exercise-session-1",
  );
  const strength = normalized.exerciseSessions.find(
    (session) => session.id === "strength-session-1",
  );

  assert.ok(bike);
  assert.equal(bike.careDayKey, "2026-08-16");
  assert.equal(bike.customActivityName, undefined);
  assert.equal(bike.perceivedExertion, 5.5);
  assert.equal(bike.distanceKm, 8.25);
  assert.equal(bike.steps, 1200);
  assert.equal(bike.averageHeartRateBpm, 112);
  assert.equal(bike.averageCadenceRpm, 68);
  assert.equal(bike.deviceReportedCaloriesKcal, 245);
  assert.equal(bike.equipmentName, "Home bike");
  assert.equal(bike.resistanceLevel, "4 / 8");
  assert.equal(bike.strengthExercises, undefined);
  assert.equal(bike.symptoms, "none beyond expected exertion");
  assert.equal(bike.notes, "steady cadence");
  assert.ok(strength);
  assert.equal(strength.careDayKey, undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify(strength.strengthExercises)),
    [
      {
        id: "strength-exercise-1",
        name: "Chair squat",
        muscleGroups: ["legs", "hips"],
        resistanceType: "bodyweight",
        setCount: 3,
        totalReps: 24,
      },
    ],
  );
});

test("invalid exercise cores are rejected and invalid optional metrics stay unknown", () => {
  const normalized = normalizeHealthData(
    legacyV4({
      exerciseSessions: [
        exerciseSession({ id: "bad-type", activityType: "teleporting" }),
        exerciseSession({ id: "bad-intensity", intensity: "maximum-ish" }),
        exerciseSession({ id: "bad-duration", durationMinutes: 0 }),
        exerciseSession({
          id: "missing-custom-name",
          activityType: "other-aerobic",
          customActivityName: "   ",
        }),
        exerciseSession({
          id: "valid-with-bad-optional-values",
          intensity: "unknown",
          perceivedExertion: 11,
          distanceKm: 0,
          steps: 1.5,
          averageHeartRateBpm: 241,
          averageCadenceRpm: 0,
          deviceReportedCaloriesKcal: 0,
        }),
      ],
    }),
  );

  assert.equal(normalized.exerciseSessions.length, 1);
  const [session] = normalized.exerciseSessions;
  assert.equal(session.id, "valid-with-bad-optional-values");
  assert.equal(session.intensity, "unknown");
  assert.equal(session.perceivedExertion, undefined);
  assert.equal(session.distanceKm, undefined);
  assert.equal(session.steps, undefined);
  assert.equal(session.averageHeartRateBpm, undefined);
  assert.equal(session.averageCadenceRpm, undefined);
  assert.equal(session.deviceReportedCaloriesKcal, undefined);
});

test("device calorie estimates keep valid whole-number values and treat invalid values as unknown", () => {
  const values = [
    ["minimum", 1],
    ["typical", 245],
    ["maximum", 20_000],
    ["zero", 0],
    ["negative", -10],
    ["fractional", 10.5],
    ["too-high", 20_001],
    ["numeric-string", "245"],
  ];
  const normalized = normalizeHealthData(
    legacyV4({
      exerciseSessions: values.map(([id, deviceReportedCaloriesKcal]) =>
        exerciseSession({ id, deviceReportedCaloriesKcal }),
      ),
    }),
  );
  const byId = new Map(
    normalized.exerciseSessions.map((exercise) => [exercise.id, exercise]),
  );

  assert.equal(normalized.exerciseSessions.length, values.length);
  assert.equal(byId.get("minimum").deviceReportedCaloriesKcal, 1);
  assert.equal(byId.get("typical").deviceReportedCaloriesKcal, 245);
  assert.equal(byId.get("maximum").deviceReportedCaloriesKcal, 20_000);
  for (const id of ["zero", "negative", "fractional", "too-high", "numeric-string"]) {
    assert.equal(byId.get(id).deviceReportedCaloriesKcal, undefined);
  }
});

test("exercise dates follow Tehran midnight rather than the medication Care Day", () => {
  assert.equal(
    getExerciseSessionTehranDateKey({
      endedAt: "2026-08-16T20:29:59.999Z",
    }),
    "2026-08-16",
  );
  assert.equal(
    getExerciseSessionTehranDateKey({ endedAt: "2026-08-16T20:30:00.000Z" }),
    "2026-08-17",
  );
  assert.equal(
    getExerciseSessionTehranDateKey({ endedAt: "2026-08-17T08:29:00.000Z" }),
    "2026-08-17",
  );
  assert.equal(
    getExerciseSessionTehranDateKey({ endedAt: "2026-08-17T08:30:00.000Z" }),
    "2026-08-17",
  );

  const morningSession = exerciseSession({
    endedAt: "2026-08-17T05:00:00.000Z",
    careDayKey: "2026-08-16",
  });
  assert.equal(
    summarizeExerciseSessions([morningSession], ["2026-08-17"]).sessions.length,
    1,
  );
  assert.equal(
    summarizeExerciseSessions([morningSession], ["2026-08-16"]).sessions.length,
    0,
  );
});

test("trailing Tehran date ranges are inclusive and calendar-safe", () => {
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2026-08-17", 1)),
    ["2026-08-17"],
  );
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2026-08-17", 7)),
    [
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ],
  );
  const thirtyDays = Array.from(
    getTrailingTehranDateKeys("2026-08-17", 30),
  );
  assert.equal(thirtyDays.length, 30);
  assert.equal(thirtyDays[0], "2026-07-19");
  assert.equal(thirtyDays.at(-1), "2026-08-17");
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2028-03-01", 3)),
    ["2028-02-28", "2028-02-29", "2028-03-01"],
  );
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2026-01-01", 2)),
    ["2025-12-31", "2026-01-01"],
  );
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2026-02-31", 7)),
    [],
  );
  assert.deepEqual(
    Array.from(getTrailingTehranDateKeys("2026-08-17", 0)),
    [],
  );
});

test("exercise summaries derive Today, 7-day, 30-day and all-time views", () => {
  const sessions = [
    exerciseSession({
      id: "walk-moderate",
      activityType: "walking",
      durationMinutes: 30,
      intensity: "moderate",
      endedAt: "2026-08-17T05:00:00.000Z",
      careDayKey: "2026-08-16",
      deviceReportedCaloriesKcal: 100,
    }),
    exerciseSession({
      id: "bike-vigorous",
      durationMinutes: 20,
      intensity: "vigorous",
      endedAt: "2026-08-17T10:00:00.000Z",
      careDayKey: "2099-01-01",
      deviceReportedCaloriesKcal: 200,
    }),
    exerciseSession({
      id: "strength-aug-16",
      activityType: "strength-training",
      durationMinutes: 15,
      endedAt: "2026-08-16T12:00:00.000Z",
    }),
    exerciseSession({
      id: "strength-aug-11",
      activityType: "strength-training",
      durationMinutes: 10,
      intensity: "light",
      endedAt: "2026-08-11T12:00:00.000Z",
      deviceReportedCaloriesKcal: 50,
    }),
    exerciseSession({
      id: "strength-aug-10",
      activityType: "strength-training",
      durationMinutes: 5,
      intensity: "moderate",
      endedAt: "2026-08-10T12:00:00.000Z",
      deviceReportedCaloriesKcal: 60,
    }),
    exerciseSession({
      id: "strength-jul-19",
      activityType: "strength-training",
      durationMinutes: 25,
      endedAt: "2026-07-19T12:00:00.000Z",
    }),
    exerciseSession({
      id: "other-aerobic-jul-18",
      activityType: "other-aerobic",
      durationMinutes: 40,
      intensity: "moderate",
      endedAt: "2026-07-18T12:00:00.000Z",
      deviceReportedCaloriesKcal: 70,
    }),
    exerciseSession({
      id: "older-mobility",
      activityType: "mobility",
      durationMinutes: 5,
      intensity: "vigorous",
      endedAt: "2026-07-01T12:00:00.000Z",
    }),
  ];

  const today = summarizeExerciseSessions(sessions, ["2026-08-17"]);
  assert.equal(today.sessions.length, 2);
  assert.equal(today.activeDayCount, 1);
  assert.equal(today.totalMinutes, 50);
  assert.equal(today.moderateAerobicMinutes, 30);
  assert.equal(today.vigorousAerobicMinutes, 20);
  assert.equal(today.moderateEquivalentMinutes, 70);
  assert.equal(today.strengthDayCount, 0);
  assert.equal(today.totalDeviceReportedCaloriesKcal, 300);
  assert.equal(today.deviceCalorieSessionCount, 2);

  const sevenDays = summarizeExerciseSessions(
    sessions,
    getTrailingTehranDateKeys("2026-08-17", 7),
  );
  assert.equal(sevenDays.sessions.length, 4);
  assert.equal(sevenDays.activeDayCount, 3);
  assert.equal(sevenDays.totalMinutes, 75);
  assert.equal(sevenDays.moderateEquivalentMinutes, 70);
  assert.equal(sevenDays.strengthDayCount, 2);
  assert.equal(sevenDays.totalDeviceReportedCaloriesKcal, 350);
  assert.equal(sevenDays.deviceCalorieSessionCount, 3);

  const thirtyDays = summarizeExerciseSessions(
    sessions,
    getTrailingTehranDateKeys("2026-08-17", 30),
  );
  assert.equal(thirtyDays.sessions.length, 6);
  assert.equal(thirtyDays.activeDayCount, 5);
  assert.equal(thirtyDays.totalMinutes, 105);
  assert.equal(thirtyDays.moderateEquivalentMinutes, 70);
  assert.equal(thirtyDays.strengthDayCount, 4);
  assert.equal(thirtyDays.totalDeviceReportedCaloriesKcal, 410);
  assert.equal(thirtyDays.deviceCalorieSessionCount, 4);

  const allTime = summarizeExerciseSessions(sessions, null);
  assert.equal(allTime.sessions.length, 8);
  assert.equal(allTime.activeDayCount, 7);
  assert.equal(allTime.totalMinutes, 150);
  assert.equal(allTime.moderateEquivalentMinutes, 110);
  assert.equal(allTime.strengthDayCount, 4);
  assert.equal(allTime.totalDeviceReportedCaloriesKcal, 480);
  assert.equal(allTime.deviceCalorieSessionCount, 5);

  const empty = summarizeExerciseSessions(sessions, []);
  assert.equal(empty.sessions.length, 0);
  assert.equal(empty.activeDayCount, 0);
  assert.equal(empty.totalMinutes, 0);
  assert.equal(empty.moderateEquivalentMinutes, 0);
  assert.equal(empty.strengthDayCount, 0);
  assert.equal(empty.totalDeviceReportedCaloriesKcal, 0);
  assert.equal(empty.deviceCalorieSessionCount, 0);
});

test("exercise summaries keep light and unknown aerobic work separate and dedupe strength dates", () => {
  const sameDaySessions = [
    exerciseSession({
      id: "light-walk",
      activityType: "walking",
      durationMinutes: 12,
      intensity: "light",
    }),
    exerciseSession({
      id: "unknown-bike",
      durationMinutes: 8,
      intensity: "unknown",
    }),
    exerciseSession({
      id: "strength-one",
      activityType: "strength-training",
      durationMinutes: 10,
      intensity: "moderate",
    }),
    exerciseSession({
      id: "strength-two",
      activityType: "strength-training",
      durationMinutes: 5,
      intensity: "vigorous",
    }),
  ];

  const summary = summarizeExerciseSessions(sameDaySessions, ["2026-08-17"]);
  assert.equal(summary.sessions.length, 4);
  assert.equal(summary.activeDayCount, 1);
  assert.equal(summary.totalMinutes, 35);
  assert.equal(summary.moderateAerobicMinutes, 0);
  assert.equal(summary.vigorousAerobicMinutes, 0);
  assert.equal(summary.moderateEquivalentMinutes, 0);
  assert.equal(summary.strengthDayCount, 1);
});

test("exercise session merge is last-write-wins while tombstones stay permanent", () => {
  const cloud = normalizeHealthData(
    legacyV4({
      exerciseSessions: [exerciseSession({ durationMinutes: 20 })],
    }),
  );
  const local = normalizeHealthData(
    legacyV4({
      exerciseSessions: [
        exerciseSession({
          durationMinutes: 35,
          deviceReportedCaloriesKcal: 300,
          updatedAt: "2026-08-17T08:00:00.000Z",
        }),
      ],
    }),
  );
  const merged = mergeHealthData(cloud, local);

  assert.equal(merged.exerciseSessions.length, 1);
  assert.equal(merged.exerciseSessions[0].durationMinutes, 35);
  assert.equal(merged.exerciseSessions[0].deviceReportedCaloriesKcal, 300);

  const deletedLocal = normalizeHealthData({
    ...local,
    exerciseSessions: [],
    deletedEntryIds: {
      ...local.deletedEntryIds,
      exerciseSessionIds: ["exercise-session-1"],
    },
  });
  const mergedAfterDelete = mergeHealthData(cloud, deletedLocal);

  assert.equal(mergedAfterDelete.exerciseSessions.length, 0);
  assert.deepEqual(
    [...mergedAfterDelete.deletedEntryIds.exerciseSessionIds],
    ["exercise-session-1"],
  );
});

test("a tombstoned waist baseline is never seeded again", () => {
  const legacy = legacyV3({
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
      waistEntryIds: [BASELINE_WAIST_ENTRY_ID],
    },
  });
  const normalized = normalizeHealthData(legacy);

  assert.equal(
    normalized.waistEntries.some(
      (entry) => entry.id === BASELINE_WAIST_ENTRY_ID,
    ),
    false,
  );
  assert.deepEqual(
    [...normalized.deletedEntryIds.waistEntryIds],
    [BASELINE_WAIST_ENTRY_ID],
  );
});

test("equal timestamps keep the richer cloud BP record over a stale local copy", () => {
  const updatedAt = "2026-08-14T12:10:00.000Z";
  const cloud = createDefaultHealthData(freshBrowserNow);
  const local = createDefaultHealthData(freshBrowserNow);
  const richSession = {
    id: "bp-equal-timestamp",
    measuredAt: updatedAt,
    careDayKey: "2026-08-14",
    pairingClosedAt: "2026-08-14T12:12:00.000Z",
    period: "morning",
    readings: [
      { systolic: 140, diastolic: 90, measuredAt: updatedAt },
      {
        systolic: 138,
        diastolic: 88,
        measuredAt: "2026-08-14T12:11:00.000Z",
      },
    ],
    arm: "left",
    position: "seated",
    cuffSite: "upper-arm",
    medicationTiming: "before-dose",
    standardConditions: false,
    contextFlags: ["nicotine"],
    symptoms: ["dizziness"],
    emergencySymptoms: [],
    triggeredBySymptoms: true,
    irregularHeartbeat: false,
    createdAt: updatedAt,
    updatedAt,
  };
  cloud.bloodPressureSessions = [richSession];
  const normalizedValid = normalizeHealthData(cloud);
  const normalizedInvalid = normalizeHealthData({
    ...cloud,
    bloodPressureSessions: [
      { ...richSession, pairingClosedAt: "not-an-ISO-timestamp" },
    ],
  });
  local.bloodPressureSessions = [
    {
      ...richSession,
      pairingClosedAt: undefined,
      readings: richSession.readings.map(
        ({ systolic, diastolic }) => ({ systolic, diastolic }),
      ),
      arm: "unknown",
      position: "unknown",
      cuffSite: "unknown",
      medicationTiming: "unknown",
      standardConditions: null,
      contextFlags: [],
      symptoms: [],
      triggeredBySymptoms: false,
      irregularHeartbeat: null,
    },
  ];

  const merged = mergeHealthData(cloud, local);
  const session = merged.bloodPressureSessions[0];

  assert.equal(
    normalizedValid.bloodPressureSessions[0].pairingClosedAt,
    richSession.pairingClosedAt,
  );
  assert.equal(
    normalizedInvalid.bloodPressureSessions[0].pairingClosedAt,
    undefined,
  );
  assert.equal(session.arm, "left");
  assert.deepEqual([...session.contextFlags], ["nicotine"]);
  assert.equal(session.readings[0].measuredAt, updatedAt);
  assert.equal(session.triggeredBySymptoms, true);
  assert.equal(session.pairingClosedAt, richSession.pairingClosedAt);
});
