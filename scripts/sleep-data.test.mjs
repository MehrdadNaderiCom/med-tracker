import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: url.pathname,
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: testModule.exports,
    module: testModule,
    Date,
    Intl,
    Set,
    Map,
    Number,
    Array,
    Math,
    JSON,
    require(id) {
      if (id === "./tehran-time") return load("../app/tehran-time.ts");
      throw Error(`Unexpected module ${id}`);
    },
  });
  return testModule.exports;
}
const {
  summarizeSleep,
  sleepDayWindow,
  sleepDurationMinutes,
  validateSleepSession,
} = load("../app/sleep-data.ts");
const {
  normalizeSleepSession,
  normalizeHealthData,
  createDefaultHealthData,
  mergeHealthData,
} = load("../app/health-data.ts");
const { tehranWallTimeToIso } = load("../app/tehran-time.ts");
const timestamp = "2026-10-04T18:00:00.000Z";
const iso = (wall) => tehranWallTimeToIso(wall);
const json = (value) => JSON.parse(JSON.stringify(value));
function sleep(id, start, end, extra = {}) {
  return {
    id,
    startedAt: iso(start),
    ...(end ? { endedAt: iso(end) } : {}),
    kind: "main",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
}

test("multiple sleep episodes and naps survive normalization, without invented ratings", () => {
  const sessions = [
    sleep("a", "2026-10-03T23:00", "2026-10-04T03:00", { quality: 4 }),
    sleep("b", "2026-10-04T05:00", "2026-10-04T08:00"),
    sleep("c", "2026-10-04T14:00", "2026-10-04T15:00", {
      kind: "nap",
      awakenings: 0,
    }),
  ];
  const normalized = normalizeHealthData({
    ...createDefaultHealthData(),
    sleepSessions: sessions,
  });
  assert.deepEqual(json(normalized.sleepSessions), sessions);
  assert.equal(normalized.sleepSessions[1].quality, undefined);
  assert.equal(normalized.sleepSessions[1].awakenings, undefined);
  assert.equal(normalized.sleepSessions[2].awakenings, 0);
});

test("overnight and split sleep allocate only the actual portion to each Tehran day", () => {
  const sessions = [
    sleep("a", "2026-10-03T22:00", "2026-10-04T02:00"),
    sleep("b", "2026-10-04T05:00", "2026-10-04T08:00"),
    sleep("c", "2026-10-04T14:00", "2026-10-04T15:00", { kind: "nap" }),
  ];
  const previous = sleepDayWindow("2026-10-03");
  const current = sleepDayWindow("2026-10-04");
  assert.equal(
    summarizeSleep(sessions, previous.start, previous.end).minutes,
    120,
  );
  const today = summarizeSleep(sessions, current.start, current.end);
  assert.equal(today.minutes, 360);
  assert.equal(today.sessionCount, 3);
  assert.equal(
    summarizeSleep(
      sessions,
      new Date(iso("2026-10-04T03:00")),
      new Date(iso("2026-10-05T03:00")),
    ).minutes,
    240,
  );
});

test("overlapping records from separate devices never double-count elapsed time", () => {
  const sessions = [
    sleep("a", "2026-10-04T01:00", "2026-10-04T04:00", { quality: 2 }),
    sleep("b", "2026-10-04T02:00", "2026-10-04T03:00"),
    sleep("c", "2026-10-04T03:00", "2026-10-04T05:00", { quality: 4 }),
  ];
  const window = sleepDayWindow("2026-10-04");
  const total = summarizeSleep(sessions, window.start, window.end);
  assert.equal(total.minutes, 240);
  assert.equal(total.sessionCount, 3);
  assert.equal(total.averageQuality, 3);
  assert.equal(total.ratedCount, 2);
});

test("ongoing episodes are preserved but excluded from completed-sleep totals", () => {
  const ongoing = sleep("open", "2026-10-04T14:00");
  assert.equal(normalizeSleepSession(ongoing).endedAt, undefined);
  assert.equal(sleepDurationMinutes(ongoing), null);
  const window = sleepDayWindow("2026-10-04");
  const total = summarizeSleep([ongoing], window.start, window.end);
  assert.equal(total.sessionCount, 0);
  assert.equal(total.averageQuality, null);
});

test("invalid dates, reversed intervals, future times and overlaps are rejected", () => {
  const now = new Date(timestamp);
  assert(
    validateSleepSession(
      sleep("a", "2026-10-04T15:00", "2026-10-04T14:00"),
      [],
      now,
    ),
  );
  assert(
    validateSleepSession(
      sleep("a", "2026-10-05T15:00", "2026-10-05T16:00"),
      [],
      now,
    ),
  );
  assert(
    validateSleepSession(
      sleep("a", "2026-10-01T01:00", "2026-10-04T04:00"),
      [],
      now,
    ),
  );
  const existing = sleep("a", "2026-10-04T12:00", "2026-10-04T15:00");
  assert(
    validateSleepSession(
      sleep("b", "2026-10-04T14:00", "2026-10-04T16:00"),
      [existing],
      now,
    ),
  );
  assert.equal(validateSleepSession(existing, [existing], now), null);
  assert.equal(
    validateSleepSession(
      sleep("b", "2026-10-04T15:00", "2026-10-04T16:00"),
      [existing],
      now,
    ),
    null,
  );
  assert.equal(iso("2026-02-30T12:00"), null);
});

test("an unfinished episode blocks a second overlapping episode until corrected", () => {
  assert(
    validateSleepSession(
      sleep("new", "2026-10-04T14:00"),
      [sleep("open", "2026-10-04T13:00")],
      new Date(timestamp),
    ),
  );
  assert.equal(
    validateSleepSession(
      sleep("old", "2026-10-04T09:00", "2026-10-04T12:00"),
      [sleep("open", "2026-10-04T13:00")],
      new Date(timestamp),
    ),
    null,
  );
});

test("Tehran date boundaries work across the year regardless of host timezone", () => {
  const window = sleepDayWindow("2026-12-31");
  assert.equal(window.start.toISOString(), "2026-12-30T20:30:00.000Z");
  assert.equal(window.end.toISOString(), "2026-12-31T20:30:00.000Z");
  assert.equal(sleepDayWindow("2026-02-30"), null);
});

test("v5 data gains an empty sleep collection without replacing existing health history", () => {
  const old = createDefaultHealthData(new Date(timestamp));
  old.schemaVersion = 5;
  delete old.sleepSessions;
  delete old.deletedEntryIds.sleepSessionIds;
  const snapshot = json(old);
  const normalized = normalizeHealthData(old);
  assert.equal(normalized.schemaVersion, 6);
  assert.equal(normalized.sleepSessions.length, 0);
  for (const key of [
    "weightEntries",
    "waistEntries",
    "bloodPressureSessions",
    "dietCheckIns",
    "activityCheckIns",
    "exerciseSessions",
    "settings",
    "profile",
  ]) {
    assert.deepEqual(json(normalized[key]), snapshot[key]);
  }
  assert.deepEqual(json(old), snapshot);
});

test("an older local document cannot erase cloud sleep; newer edits keep the same ID", () => {
  const first = sleep("a", "2026-10-04T01:00", "2026-10-04T08:00", {
    quality: 2,
  });
  const cloud = normalizeHealthData({
    ...createDefaultHealthData(),
    sleepSessions: [first],
  });
  const oldLocal = createDefaultHealthData();
  delete oldLocal.sleepSessions;
  delete oldLocal.deletedEntryIds.sleepSessionIds;
  assert.deepEqual(
    json(mergeHealthData(cloud, normalizeHealthData(oldLocal)).sleepSessions),
    [first],
  );
  const local = normalizeHealthData({
    ...cloud,
    sleepSessions: [
      { ...first, quality: 4, updatedAt: "2026-10-05T10:00:00Z" },
    ],
  });
  assert.equal(mergeHealthData(cloud, local).sleepSessions[0].quality, 4);
  assert.equal(mergeHealthData(cloud, local).sleepSessions.length, 1);
});

test("sleep tombstones survive merges without affecting other health data", () => {
  const cloud = normalizeHealthData({
    ...createDefaultHealthData(),
    sleepSessions: [sleep("a", "2026-10-04T01:00", "2026-10-04T08:00")],
  });
  const local = normalizeHealthData({
    ...cloud,
    deletedEntryIds: { ...cloud.deletedEntryIds, sleepSessionIds: ["a"] },
  });
  const merged = mergeHealthData(cloud, local);
  assert.equal(merged.sleepSessions.length, 0);
  assert.deepEqual(json(merged.weightEntries), json(cloud.weightEntries));
  assert.deepEqual(json(merged.deletedEntryIds.sleepSessionIds), ["a"]);
});
