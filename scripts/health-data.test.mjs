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
  assert.equal(bike.equipmentName, "Home bike");
  assert.equal(bike.resistanceLevel, "4 / 8");
  assert.equal(bike.strengthExercises, undefined);
  assert.equal(bike.symptoms, "none beyond expected exertion");
  assert.equal(bike.notes, "steady cadence");
  assert.ok(strength);
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
});

test("exercise summaries use aerobic equivalence and distinct Tehran calendar dates", () => {
  const sessions = [
    exerciseSession({
      id: "walk-moderate",
      activityType: "walking",
      durationMinutes: 30,
      intensity: "moderate",
      careDayKey: "2026-08-16",
    }),
    exerciseSession({
      id: "bike-vigorous",
      durationMinutes: 20,
      intensity: "vigorous",
      careDayKey: "2026-08-16",
    }),
    exerciseSession({
      id: "bike-unknown",
      durationMinutes: 10,
      intensity: "unknown",
      careDayKey: "2026-08-16",
    }),
    exerciseSession({
      id: "mobility-vigorous",
      activityType: "mobility",
      durationMinutes: 15,
      intensity: "vigorous",
      careDayKey: "2026-08-16",
    }),
    exerciseSession({
      id: "strength-before-noon",
      activityType: "strength-training",
      durationMinutes: 10,
      intensity: "light",
      endedAt: "2026-08-17T05:00:00.000Z",
      careDayKey: "2026-08-16",
    }),
    exerciseSession({
      id: "strength-after-noon",
      activityType: "strength-training",
      durationMinutes: 10,
      intensity: "moderate",
      endedAt: "2026-08-17T10:00:00.000Z",
      careDayKey: "2026-08-17",
    }),
    exerciseSession({
      id: "outside-period",
      durationMinutes: 500,
      careDayKey: "2026-08-10",
    }),
  ];

  const summary = summarizeExerciseSessions(sessions, [
    "2026-08-16",
    "2026-08-17",
  ]);

  assert.equal(summary.sessions.length, 6);
  assert.equal(summary.totalMinutes, 95);
  assert.equal(summary.moderateAerobicMinutes, 30);
  assert.equal(summary.vigorousAerobicMinutes, 20);
  assert.equal(summary.moderateEquivalentMinutes, 70);
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
          updatedAt: "2026-08-17T08:00:00.000Z",
        }),
      ],
    }),
  );
  const merged = mergeHealthData(cloud, local);

  assert.equal(merged.exerciseSessions.length, 1);
  assert.equal(merged.exerciseSessions[0].durationMinutes, 35);

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
