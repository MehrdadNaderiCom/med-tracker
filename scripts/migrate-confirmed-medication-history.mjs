import assert from "node:assert/strict";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const START_DATE = "2026-07-02";
const END_DATE = "2026-08-12";
const BACKFILL_VERSION = "oral-confirmed-v1";
const BACKFILL_NOTE =
  "User confirmed this dose was taken. Exact intake time was not recorded; history corrected on 2026-08-13.";
const MAX_CAS_ATTEMPTS = 3;
const HEALTH_SCHEMA_VERSION = 3;
const HEALTH_SYNC_EPOCH = "1970-01-01T00:00:00.000Z";
const PROFILE_RECORDED_AT = "2026-08-13T15:00:00.000Z";
const HEALTH_PROFILE = {
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

const ORAL_MEDICATIONS = [
  {
    id: "2a458a26-c25a-4703-b1c9-e02fafa81456",
    name: "Exforge HCT 5/160/12.5 mg Tablet (amlodipine/valsartan/hydrochlorothiazide)",
    dayMode: "daily",
    missingDates: [
      "2026-07-22",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ],
  },
  {
    id: "2a4bf519-7064-49dc-acdc-87cf735751c3",
    name: "Vitamin D3 2000 IU",
    dayMode: "daily",
    missingDates: [
      "2026-07-22",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ],
  },
  {
    id: "f267ef97-452c-4a0a-9136-20ab9c1cc5e1",
    name: "Zoloft 50 mg Tablet (sertraline)",
    dayMode: "daily",
    missingDates: [
      "2026-07-20",
      "2026-07-22",
      "2026-07-26",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-12",
    ],
  },
  {
    id: "9db10d09-30e9-4d2a-9fa0-1d1a42c8a8ba",
    name: "Concor COR 2.5 mg Tablet (bisoprolol) - half tablet",
    dayMode: "daily",
    missingDates: [
      "2026-07-20",
      "2026-07-22",
      "2026-07-23",
      "2026-07-26",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-12",
    ],
  },
  {
    id: "0297389d-d308-4248-ae94-35b60276cc88",
    name: "Liv.52 Tablet - lunch dose",
    dayMode: "daily",
    missingDates: [
      "2026-07-20",
      "2026-07-22",
      "2026-07-26",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-12",
    ],
  },
  {
    id: "41854466-76c8-42c0-acfa-159e7841f5bd",
    name: "Avodart 0.5 mg Capsule (dutasteride)",
    dayMode: "even-dates",
    missingDates: [
      "2026-07-20",
      "2026-07-22",
      "2026-07-25",
      "2026-07-27",
      "2026-08-01",
      "2026-08-05",
      "2026-08-12",
    ],
  },
  {
    id: "df9bce71-7cc8-4c88-aea2-4588469d14b6",
    name: "Liv.52 Tablet - dinner dose",
    dayMode: "daily",
    missingDates: [
      "2026-07-16",
      "2026-07-20",
      "2026-07-22",
      "2026-07-23",
      "2026-07-26",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-12",
    ],
  },
];

const EXPECTED_MISSING_SLOTS = ORAL_MEDICATIONS.flatMap((medication) =>
  medication.missingDates.map((date) => `${medication.id}|${date}|ordered`),
);
const EXPECTED_MISSING_SLOT_SET = new Set(EXPECTED_MISSING_SLOTS);
const ORAL_MEDICATION_ID_SET = new Set(
  ORAL_MEDICATIONS.map((medication) => medication.id),
);
const EVEN_ROUTINE_DAY_NUMBERS = new Set([1, 3, 6]);

assert.equal(ORAL_MEDICATIONS.length, 7);
assert.equal(EXPECTED_MISSING_SLOTS.length, 52);
assert.equal(EXPECTED_MISSING_SLOT_SET.size, 52);

const argumentsSet = new Set(process.argv.slice(2));
const unknownArguments = [...argumentsSet].filter((argument) => argument !== "--apply");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const applyChanges = argumentsSet.has("--apply");
const redisUrl = (
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.KV_REST_API_URL ??
  ""
).replace(/\/$/, "");
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN ??
  "";
const primaryKey =
  process.env.MEDTRACK_SYNC_KEY ?? "medtrack:mehrdad:primary";
const healthKey =
  process.env.MEDTRACK_HEALTH_SYNC_KEY ?? "medtrack:mehrdad:health:v1";
const authKey =
  process.env.MEDTRACK_AUTH_CREDENTIAL_KEY ?? "medtrack:mehrdad:auth:v1";
const backupPrefix =
  process.env.MEDTRACK_BACKUP_PREFIX ?? "medtrack:mehrdad:backup";
const newPassword = process.env.MEDTRACK_NEW_PASSWORD;

if (!redisUrl || !redisToken) {
  throw new Error("Redis REST configuration is missing.");
}

if (applyChanges && (!newPassword || newPassword.length === 0)) {
  throw new Error(
    "MEDTRACK_NEW_PASSWORD must be provided when running with --apply.",
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStoredObject(raw, label) {
  if (typeof raw !== "string") {
    throw new Error(`${label} record is missing.`);
  }

  let value;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} record is not valid JSON.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${label} record is not an object.`);
  }

  return value;
}

function parseCredential(raw) {
  const credential = parseStoredObject(raw, "Authentication credential");

  if (
    credential.version !== 1 ||
    typeof credential.username !== "string" ||
    credential.username.length === 0 ||
    typeof credential.salt !== "string" ||
    credential.salt.length < 16 ||
    typeof credential.passwordHash !== "string" ||
    credential.passwordHash.length < 64
  ) {
    throw new Error("Authentication credential has an unexpected format.");
  }

  return credential;
}

async function redisCommand(command) {
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);

  if (
    !response.ok ||
    !isRecord(payload) ||
    !("result" in payload)
  ) {
    throw new Error("Redis command failed.");
  }

  return payload.result;
}

async function readRaw(key) {
  const result = await redisCommand(["GET", key]);

  if (result !== null && typeof result !== "string") {
    throw new Error("Redis returned an unexpected value type.");
  }

  return result;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function dateKeysBetween(startDate, endDate) {
  const dates = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);

  for (
    let cursor = Date.parse(`${startDate}T00:00:00Z`);
    cursor <= end;
    cursor += 24 * 60 * 60 * 1000
  ) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }

  return dates;
}

function inferScheduleType(log) {
  if (log.scheduleType === "timed" || log.scheduleType === "ordered") {
    return log.scheduleType;
  }

  return typeof log.scheduledTime === "string" && log.scheduledTime
    ? "timed"
    : "ordered";
}

function getSlotKey(log) {
  return `${log.medicationId}|${log.date}|${inferScheduleType(log)}`;
}

function deterministicLogId(medicationId, date) {
  return `backfill-${BACKFILL_VERSION}-${medicationId}-${date}`;
}

function getOralPlan(primaryData) {
  if (!Array.isArray(primaryData.medications) || !Array.isArray(primaryData.logs)) {
    throw new Error("Primary data does not contain medication and log arrays.");
  }

  const medicationsById = new Map(
    primaryData.medications.map((medication) => [medication.id, medication]),
  );
  const logsBySlot = new Map();

  for (const log of primaryData.logs) {
    if (!isRecord(log)) {
      throw new Error("Primary log data has an unexpected format.");
    }

    const key = getSlotKey(log);
    const matchingLogs = logsBySlot.get(key) ?? [];
    matchingLogs.push(log);
    logsBySlot.set(key, matchingLogs);
  }

  const dueDates = dateKeysBetween(START_DATE, END_DATE);
  let dueSlotCount = 0;
  const expectedLogs = [];

  for (const oralSpec of ORAL_MEDICATIONS) {
    const medication = medicationsById.get(oralSpec.id);

    if (!isRecord(medication) || medication.name !== oralSpec.name) {
      throw new Error(`Oral medication identity mismatch for ${oralSpec.id}.`);
    }

    if (
      !isRecord(medication.schedule) ||
      medication.schedule.type !== "ordered" ||
      medication.schedule.dayMode !== oralSpec.dayMode
    ) {
      throw new Error(`Oral medication schedule mismatch for ${oralSpec.name}.`);
    }

    if (
      medication.activeFrom !== undefined &&
      medication.activeFrom !== START_DATE
    ) {
      throw new Error(`Unexpected activeFrom boundary for ${oralSpec.name}.`);
    }

    const medicationDueDates = dueDates.filter((date) => {
      if (oralSpec.dayMode === "daily") {
        return true;
      }

      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return EVEN_ROUTINE_DAY_NUMBERS.has(weekday);
    });

    dueSlotCount += medicationDueDates.length;

    for (const date of oralSpec.missingDates) {
      const routineCategoryId = medication.schedule.routineCategoryId;
      const routineCategory = Array.isArray(primaryData.routineCategories)
        ? primaryData.routineCategories.find(
            (category) => category.id === routineCategoryId,
          )
        : undefined;

      if (
        typeof routineCategoryId !== "string" ||
        !isRecord(routineCategory) ||
        typeof routineCategory.name !== "string"
      ) {
        throw new Error(`Routine category is missing for ${oralSpec.name}.`);
      }

      const log = {
        id: deterministicLogId(medication.id, date),
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        unit: medication.unit,
        category: medication.category,
        scheduleType: "ordered",
        scheduledTime: null,
        order:
          typeof medication.schedule.order === "number"
            ? medication.schedule.order
            : 1,
        routineCategoryId,
        routineCategoryName: routineCategory.name,
        takenAt: `${date}T12:00:00+03:30`,
        date,
        status: "taken",
        notes: BACKFILL_NOTE,
      };

      if (
        typeof medication.schedule.groupName === "string" &&
        medication.schedule.groupName.length > 0
      ) {
        log.groupName = medication.schedule.groupName;
      }

      expectedLogs.push(log);
    }
  }

  assert.equal(dueSlotCount, 270, "Historical oral due-slot count changed.");

  for (const oralSpec of ORAL_MEDICATIONS) {
    const dueDatesForMedication = dueDates.filter((date) => {
      if (oralSpec.dayMode === "daily") return true;
      return EVEN_ROUTINE_DAY_NUMBERS.has(
        new Date(`${date}T00:00:00Z`).getUTCDay(),
      );
    });

    for (const date of dueDatesForMedication) {
      const slot = `${oralSpec.id}|${date}|ordered`;
      const slotLogs = logsBySlot.get(slot) ?? [];

      if (slotLogs.length > 1) {
        throw new Error(`Duplicate historical oral slot detected: ${slot}.`);
      }
    }
  }

  const missingSlotSet = new Set(
    expectedLogs
      .filter((log) => !(logsBySlot.get(getSlotKey(log)) ?? []).length)
      .map(getSlotKey),
  );
  const deterministicLogsById = new Map(
    primaryData.logs.map((log) => [log.id, log]),
  );
  const isPending =
    missingSlotSet.size === EXPECTED_MISSING_SLOT_SET.size &&
    [...missingSlotSet].every((slot) => EXPECTED_MISSING_SLOT_SET.has(slot));
  const isApplied = missingSlotSet.size === 0;

  if (!isPending && !isApplied) {
    throw new Error(
      `Historical state is partial or changed (${missingSlotSet.size} expected slots remain).`,
    );
  }

  const deletedLogIds = new Set(
    Array.isArray(primaryData.deletedLogIds) ? primaryData.deletedLogIds : [],
  );

  for (const expectedLog of expectedLogs) {
    if (deletedLogIds.has(expectedLog.id)) {
      throw new Error(`A deterministic backfill ID is tombstoned: ${expectedLog.id}.`);
    }

    if (isApplied) {
      assert.deepStrictEqual(
        deterministicLogsById.get(expectedLog.id),
        expectedLog,
        `Previously applied backfill log changed: ${expectedLog.id}`,
      );
    } else if (deterministicLogsById.has(expectedLog.id)) {
      throw new Error(`Deterministic ID collision: ${expectedLog.id}.`);
    }
  }

  const activeFromNeedsChange = ORAL_MEDICATIONS.some(
    (oralSpec) => medicationsById.get(oralSpec.id).activeFrom !== START_DATE,
  );

  if (isApplied && activeFromNeedsChange) {
    throw new Error("Backfill logs exist but oral activeFrom boundaries are partial.");
  }

  return {
    expectedLogs,
    logsToAppend: isPending ? expectedLogs : [],
    activeFromNeedsChange,
    state: isPending ? "pending" : "applied",
  };
}

function buildNextPrimary(primaryData, plan) {
  if (plan.logsToAppend.length === 0 && !plan.activeFromNeedsChange) {
    return primaryData;
  }

  return {
    ...primaryData,
    medications: primaryData.medications.map((medication) =>
      ORAL_MEDICATION_ID_SET.has(medication.id)
        ? { ...medication, activeFrom: START_DATE }
        : medication,
    ),
    logs: [...primaryData.logs, ...plan.logsToAppend],
    updatedAt: new Date().toISOString(),
  };
}

function verifyPrimaryMutation(before, after, plan) {
  const beforeRemainder = { ...before };
  const afterRemainder = { ...after };

  delete beforeRemainder.medications;
  delete beforeRemainder.logs;
  delete beforeRemainder.updatedAt;
  delete afterRemainder.medications;
  delete afterRemainder.logs;
  delete afterRemainder.updatedAt;

  assert.deepStrictEqual(
    afterRemainder,
    beforeRemainder,
    "An unintended primary top-level field changed.",
  );

  assert.equal(after.medications.length, before.medications.length);
  assert.equal(after.logs.length, before.logs.length + plan.logsToAppend.length);
  assert.deepStrictEqual(
    after.logs.slice(0, before.logs.length),
    before.logs,
    "An existing history log changed.",
  );
  assert.deepStrictEqual(
    after.logs.slice(before.logs.length),
    plan.logsToAppend,
    "The appended history logs differ from the reviewed plan.",
  );

  before.medications.forEach((medication, index) => {
    const expectedMedication = ORAL_MEDICATION_ID_SET.has(medication.id)
      ? { ...medication, activeFrom: START_DATE }
      : medication;

    assert.deepStrictEqual(
      after.medications[index],
      plan.activeFromNeedsChange ? expectedMedication : medication,
      `Unexpected medication mutation at index ${index}.`,
    );
  });

  if (plan.logsToAppend.length > 0 || plan.activeFromNeedsChange) {
    assert.equal(typeof after.updatedAt, "string");
    assert.notEqual(after.updatedAt, before.updatedAt);
  } else {
    assert.equal(after.updatedAt, before.updatedAt);
  }
}

function getHealthProfilePlan(healthData) {
  const hasProfile = Object.hasOwn(healthData, "profile");

  if (hasProfile && !isDeepStrictEqual(healthData.profile, HEALTH_PROFILE)) {
    throw new Error(
      "The stored health profile differs from this reviewed migration; refusing to overwrite it.",
    );
  }

  const schemaVersion =
    typeof healthData.schemaVersion === "number" &&
    Number.isFinite(healthData.schemaVersion)
      ? healthData.schemaVersion
      : 0;
  const profileNeedsWrite = !hasProfile;
  const timestampNeedsWrite =
    profileNeedsWrite ||
    typeof healthData.profileUpdatedAt !== "string" ||
    healthData.profileUpdatedAt === HEALTH_SYNC_EPOCH;

  return {
    profileNeedsWrite,
    schemaNeedsWrite: schemaVersion < HEALTH_SCHEMA_VERSION,
    timestampNeedsWrite,
  };
}

function buildNextHealth(healthData, plan) {
  const needsWrite =
    plan.profileNeedsWrite ||
    plan.schemaNeedsWrite ||
    plan.timestampNeedsWrite;

  if (!needsWrite) return healthData;

  return {
    ...healthData,
    schemaVersion: Math.max(
      HEALTH_SCHEMA_VERSION,
      typeof healthData.schemaVersion === "number" &&
        Number.isFinite(healthData.schemaVersion)
        ? healthData.schemaVersion
        : 0,
    ),
    profile: { ...HEALTH_PROFILE },
    profileUpdatedAt: plan.timestampNeedsWrite
      ? PROFILE_RECORDED_AT
      : healthData.profileUpdatedAt,
    updatedAt: new Date().toISOString(),
  };
}

function verifyHealthMutation(before, after, plan) {
  const beforeRemainder = { ...before };
  const afterRemainder = { ...after };

  for (const field of [
    "schemaVersion",
    "profile",
    "profileUpdatedAt",
    "updatedAt",
  ]) {
    delete beforeRemainder[field];
    delete afterRemainder[field];
  }

  assert.deepStrictEqual(
    afterRemainder,
    beforeRemainder,
    "An unintended health record, setting, or tombstone changed.",
  );
  assert.deepStrictEqual(after.profile, HEALTH_PROFILE);
  assert.ok(after.schemaVersion >= HEALTH_SCHEMA_VERSION);

  const needsWrite =
    plan.profileNeedsWrite ||
    plan.schemaNeedsWrite ||
    plan.timestampNeedsWrite;

  if (needsWrite) {
    assert.equal(after.profileUpdatedAt, PROFILE_RECORDED_AT);
    assert.equal(typeof after.updatedAt, "string");
    assert.notEqual(after.updatedAt, before.updatedAt);
  } else {
    assert.deepStrictEqual(after, before);
  }
}

function passwordMatchesCredential(password, credential) {
  const providedHash = scryptSync(
    password,
    Buffer.from(credential.salt, "base64url"),
    64,
  );
  const expectedHash = Buffer.from(credential.passwordHash, "base64url");

  return (
    expectedHash.length === providedHash.length &&
    timingSafeEqual(providedHash, expectedHash)
  );
}

function createCredential(username, password) {
  const salt = randomBytes(32);

  return {
    version: 1,
    username,
    salt: salt.toString("base64url"),
    passwordHash: scryptSync(password, salt, 64).toString("base64url"),
  };
}

function createBackupStem() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const nonce = randomBytes(4).toString("hex");
  return `${backupPrefix}:confirmed-medication-${timestamp}-${nonce}`;
}

async function createAndVerifyBackups(snapshot) {
  const stem = createBackupStem();
  const records = [
    ["primary", primaryKey, snapshot.primaryRaw],
    ["health", healthKey, snapshot.healthRaw],
    ["auth", authKey, snapshot.authRaw],
  ];
  const backups = [];

  for (const [label, sourceKey, raw] of records) {
    const backupKey = `${stem}:${label}`;
    const setResult = await redisCommand(["SET", backupKey, raw, "NX"]);

    if (setResult !== "OK") {
      throw new Error(`NX backup creation failed for ${label}.`);
    }

    const backupRaw = await readRaw(backupKey);
    const sourceSha256 = sha256(raw);

    if (backupRaw !== raw || sha256(backupRaw) !== sourceSha256) {
      throw new Error(`Backup verification failed for ${label}.`);
    }

    backups.push({ label, sourceKey, backupKey, sha256: sourceSha256 });
  }

  return backups;
}

const COMPARE_AND_SET_SCRIPT = `
local primary = redis.call("GET", KEYS[1])
local health = redis.call("GET", KEYS[2])
local auth = redis.call("GET", KEYS[3])

if primary ~= ARGV[1] then return -1 end
if health ~= ARGV[2] then return -2 end
if auth ~= ARGV[3] then return -3 end

redis.call("SET", KEYS[1], ARGV[4])
redis.call("SET", KEYS[2], ARGV[5])
redis.call("SET", KEYS[3], ARGV[6])
return 1
`;

async function readSnapshot() {
  const [primaryRaw, healthRaw, authRaw] = await Promise.all([
    readRaw(primaryKey),
    readRaw(healthKey),
    readRaw(authKey),
  ]);

  if (
    typeof primaryRaw !== "string" ||
    typeof healthRaw !== "string" ||
    typeof authRaw !== "string"
  ) {
    throw new Error("Primary, health, and authentication records must all exist.");
  }

  return {
    primaryRaw,
    healthRaw,
    authRaw,
    primaryData: parseStoredObject(primaryRaw, "Primary data"),
    healthData: parseStoredObject(healthRaw, "Health data"),
    credential: parseCredential(authRaw),
  };
}

function getSummary(plan, healthPlan, credential, passwordStatus) {
  return {
    mode: applyChanges ? "apply" : "dry-run",
    historicalRange: { start: START_DATE, end: END_DATE },
    reviewedOralMedications: ORAL_MEDICATIONS.length,
    reviewedDueSlots: 270,
    historyState: plan.state,
    logsToAppend: plan.logsToAppend.length,
    activeFromBoundariesToSet: plan.activeFromNeedsChange ? 7 : 0,
    emptyHistoricalDaysCovered: [
      "2026-07-22",
      "2026-08-01",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ],
    username: credential.username,
    credentialRotation: passwordStatus,
    healthProfile:
      healthPlan.profileNeedsWrite ||
      healthPlan.schemaNeedsWrite ||
      healthPlan.timestampNeedsWrite
        ? "would-store"
        : "already-stored",
  };
}

async function main() {
  if (!applyChanges) {
    const snapshot = await readSnapshot();
    const plan = getOralPlan(snapshot.primaryData);
    const nextPrimary = buildNextPrimary(snapshot.primaryData, plan);
    verifyPrimaryMutation(snapshot.primaryData, nextPrimary, plan);
    const healthPlan = getHealthProfilePlan(snapshot.healthData);
    const nextHealth = buildNextHealth(snapshot.healthData, healthPlan);
    verifyHealthMutation(snapshot.healthData, nextHealth, healthPlan);
    const passwordStatus = newPassword
      ? passwordMatchesCredential(newPassword, snapshot.credential)
        ? "already-matches"
        : "would-rotate"
      : "requires-MEDTRACK_NEW_PASSWORD-for-apply";

    console.log(
      JSON.stringify(
        getSummary(plan, healthPlan, snapshot.credential, passwordStatus),
        null,
        2,
      ),
    );
    console.log("Dry run only: Redis was not modified and no backups were created.");
    return;
  }

  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
    const snapshot = await readSnapshot();
    const plan = getOralPlan(snapshot.primaryData);
    const nextPrimary = buildNextPrimary(snapshot.primaryData, plan);
    verifyPrimaryMutation(snapshot.primaryData, nextPrimary, plan);
    const healthPlan = getHealthProfilePlan(snapshot.healthData);
    const nextHealth = buildNextHealth(snapshot.healthData, healthPlan);
    verifyHealthMutation(snapshot.healthData, nextHealth, healthPlan);

    const credentialAlreadyMatches = passwordMatchesCredential(
      newPassword,
      snapshot.credential,
    );

    if (
      plan.state === "applied" &&
      !plan.activeFromNeedsChange &&
      isDeepStrictEqual(nextHealth, snapshot.healthData) &&
      credentialAlreadyMatches
    ) {
      console.log(
        JSON.stringify(
          getSummary(
            plan,
            healthPlan,
            snapshot.credential,
            "already-matches",
          ),
          null,
          2,
        ),
      );
      console.log("Migration is already fully applied; no Redis writes were made.");
      return;
    }

    const nextCredential = credentialAlreadyMatches
      ? snapshot.credential
      : createCredential(snapshot.credential.username, newPassword);
    const nextPrimaryRaw = JSON.stringify(nextPrimary);
    const nextHealthRaw = JSON.stringify(nextHealth);
    const nextAuthRaw = JSON.stringify(nextCredential);
    const backups = await createAndVerifyBackups(snapshot);
    const casResult = await redisCommand([
      "EVAL",
      COMPARE_AND_SET_SCRIPT,
      3,
      primaryKey,
      healthKey,
      authKey,
      snapshot.primaryRaw,
      snapshot.healthRaw,
      snapshot.authRaw,
      nextPrimaryRaw,
      nextHealthRaw,
      nextAuthRaw,
    ]);

    if (casResult !== 1 && casResult !== "1") {
      if (attempt < MAX_CAS_ATTEMPTS) {
        continue;
      }

      throw new Error(
        `CAS failed after ${MAX_CAS_ATTEMPTS} attempts; only verified backups were created.`,
      );
    }

    const [writtenPrimaryRaw, writtenHealthRaw, writtenAuthRaw] =
      await Promise.all([
        readRaw(primaryKey),
        readRaw(healthKey),
        readRaw(authKey),
      ]);

    assert.equal(writtenPrimaryRaw, nextPrimaryRaw, "Primary post-write verification failed.");
    assert.equal(writtenHealthRaw, nextHealthRaw, "Health post-write verification failed.");
    assert.equal(writtenAuthRaw, nextAuthRaw, "Credential post-write verification failed.");
    verifyPrimaryMutation(
      snapshot.primaryData,
      parseStoredObject(writtenPrimaryRaw, "Written primary data"),
      plan,
    );
    verifyHealthMutation(
      snapshot.healthData,
      parseStoredObject(writtenHealthRaw, "Written health data"),
      healthPlan,
    );
    assert.equal(
      passwordMatchesCredential(newPassword, parseCredential(writtenAuthRaw)),
      true,
      "New credential verification failed.",
    );

    console.log(
      JSON.stringify(
        {
          ...getSummary(
            plan,
            healthPlan,
            snapshot.credential,
            credentialAlreadyMatches ? "already-matched" : "rotated",
          ),
          casAttempt: attempt,
          backups,
          verification: {
            primaryMutation: "passed",
            healthProfile: "passed",
            credential: "passed",
          },
        },
        null,
        2,
      ),
    );
    return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
