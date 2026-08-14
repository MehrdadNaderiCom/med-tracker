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
  const source = createDefaultHealthData(freshBrowserNow);
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

test("schema-v3 tombstones normalize missing v4 lists to empty arrays", () => {
  const normalized = normalizeHealthData(legacyV3());

  assert.deepEqual([...normalized.deletedEntryIds.waistEntryIds], []);
  assert.deepEqual([...normalized.deletedEntryIds.activityCheckInIds], []);
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
