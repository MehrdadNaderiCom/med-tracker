import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../app/api/health-sync/route.ts", import.meta.url);
const instrumentedSource = `${readFileSync(sourceUrl, "utf8")}
export const __healthSyncTest = { normalizeHealthSyncData, mergeHealthSyncData };
`;
const compiled = ts.transpileModule(instrumentedSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const routeModule = { exports: {} };

vm.runInNewContext(compiled, {
  exports: routeModule.exports,
  module: routeModule,
  require(specifier) {
    if (specifier === "@/app/lib/session") {
      return {
        isSessionAuthorized: () => false,
        isTrustedSessionOrigin: () => false,
      };
    }
    if (specifier === "next/server") {
      return {
        NextResponse: {
          json: () => ({ headers: { set() {} } }),
        },
      };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  },
  process: { env: {} },
  Buffer,
  Date,
  Set,
  Map,
  Number,
  Array,
  Math,
  JSON,
});

const { mergeHealthSyncData } = routeModule.exports.__healthSyncTest;

const timestamp = "2026-08-17T07:00:00.000Z";

function exerciseSession(overrides = {}) {
  return {
    id: "exercise-session-1",
    endedAt: "2026-08-17T06:30:00.000Z",
    activityType: "stationary-bike",
    durationMinutes: 30,
    intensity: "moderate",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function healthDocument(overrides = {}) {
  return {
    schemaVersion: 5,
    weightEntries: [],
    bloodPressureSessions: [],
    dietCheckIns: [],
    waistEntries: [],
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
    profile: {},
    profileUpdatedAt: timestamp,
    settings: {},
    settingsUpdatedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("a schema-v4 client cannot erase stored exercise sessions or tombstones", () => {
  const existing = healthDocument({
    exerciseSessions: [exerciseSession()],
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
      waistEntryIds: [],
      activityCheckInIds: [],
      exerciseSessionIds: ["previously-deleted-session"],
    },
  });
  const oldClientPayload = healthDocument({ schemaVersion: 4 });
  delete oldClientPayload.exerciseSessions;
  delete oldClientPayload.deletedEntryIds.exerciseSessionIds;

  const merged = mergeHealthSyncData(
    existing,
    oldClientPayload,
    "2026-08-17T08:00:00.000Z",
  );

  assert.equal(merged.exerciseSessions.length, 1);
  assert.equal(merged.exerciseSessions[0].id, "exercise-session-1");
  assert.deepEqual(
    [...merged.deletedEntryIds.exerciseSessionIds],
    ["previously-deleted-session"],
  );
  assert.equal(merged.schemaVersion, 5);
});

test("the health sync server keeps the newer version of an exercise session", () => {
  const existing = healthDocument({
    exerciseSessions: [exerciseSession({ durationMinutes: 20 })],
  });
  const incoming = healthDocument({
    exerciseSessions: [
      exerciseSession({
        durationMinutes: 35,
        updatedAt: "2026-08-17T08:00:00.000Z",
      }),
    ],
  });

  const merged = mergeHealthSyncData(
    existing,
    incoming,
    "2026-08-17T08:01:00.000Z",
  );

  assert.equal(merged.exerciseSessions.length, 1);
  assert.equal(merged.exerciseSessions[0].durationMinutes, 35);
});

test("an exercise-session tombstone wins over stored and incoming records", () => {
  const existing = healthDocument({
    exerciseSessions: [exerciseSession()],
  });
  const incoming = healthDocument({
    exerciseSessions: [
      exerciseSession({ updatedAt: "2026-08-17T08:00:00.000Z" }),
    ],
    deletedEntryIds: {
      weightEntryIds: [],
      bloodPressureSessionIds: [],
      dietCheckInIds: [],
      waistEntryIds: [],
      activityCheckInIds: [],
      exerciseSessionIds: ["exercise-session-1"],
    },
  });

  const merged = mergeHealthSyncData(
    existing,
    incoming,
    "2026-08-17T08:01:00.000Z",
  );

  assert.equal(merged.exerciseSessions.length, 0);
  assert.deepEqual(
    [...merged.deletedEntryIds.exerciseSessionIds],
    ["exercise-session-1"],
  );
});
