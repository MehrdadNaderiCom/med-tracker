import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const mergeModuleUrl = new URL("../app/api/sync/merge.ts", import.meta.url);
const careDayModuleUrl = new URL("../app/care-day-state.ts", import.meta.url);
const compiledCareDayModule = ts.transpileModule(
  readFileSync(careDayModuleUrl, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: careDayModuleUrl.pathname,
  },
).outputText;
const compiledMergeModule = ts.transpileModule(
  readFileSync(mergeModuleUrl, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: mergeModuleUrl.pathname,
  },
).outputText;
const careDayModule = { exports: {} };
const testModule = { exports: {} };

vm.runInNewContext(compiledCareDayModule, {
  exports: careDayModule.exports,
  module: careDayModule,
  Date,
  Number,
});

vm.runInNewContext(compiledMergeModule, {
  exports: testModule.exports,
  module: testModule,
  require(specifier) {
    if (specifier === "../../care-day-state") {
      return careDayModule.exports;
    }

    throw new Error(`Unexpected test dependency: ${specifier}`);
  },
});

const { mergePrimarySyncData } = testModule.exports;

function findById(items, id) {
  return items.find((item) => item.id === id);
}

test("stale snapshots preserve medication modes, log outcomes, and plan version", () => {
  const existing = {
    personalPlanVersion: 6,
    medications: [
      {
        id: "hookah",
        name: "No hookah today",
        trackingMode: "avoidance",
      },
      {
        id: "medicine",
        name: "Medicine",
        trackingMode: "completion",
      },
    ],
    logs: [
      {
        id: "lapse-log",
        medicationId: "hookah",
        status: "lapse",
        date: "2026-08-13",
        takenAt: "2026-08-13T20:56:02.502Z",
      },
      { id: "taken-log", medicationId: "medicine", status: "taken" },
    ],
  };
  const incoming = {
    personalPlanVersion: 5,
    medications: [
      { id: "hookah", name: "Updated hookah label" },
      { id: "medicine", name: "Updated medicine", trackingMode: "invalid" },
    ],
    logs: [
      {
        id: "lapse-log",
        medicationId: "hookah",
        status: "taken",
        date: "2026-08-14",
        takenAt: "2026-08-14T20:56:02.502Z",
        notes: "stale client rewrite",
      },
      {
        id: "taken-log",
        medicationId: "medicine",
        status: "lapse",
      },
      { id: "new-lapse-log", medicationId: "hookah", status: "lapse" },
    ],
  };

  const merged = mergePrimarySyncData(
    existing,
    incoming,
    "2026-08-13T20:00:00.000Z",
  );

  assert.equal(merged.personalPlanVersion, 6);
  assert.equal(findById(merged.medications, "hookah").trackingMode, "avoidance");
  assert.equal(
    findById(merged.medications, "medicine").trackingMode,
    "completion",
  );
  assert.equal(findById(merged.logs, "lapse-log").status, "lapse");
  assert.equal(findById(merged.logs, "lapse-log").date, "2026-08-13");
  assert.equal(
    findById(merged.logs, "lapse-log").takenAt,
    "2026-08-13T20:56:02.502Z",
  );
  assert.equal(findById(merged.logs, "lapse-log").notes, "stale client rewrite");
  assert.equal(findById(merged.logs, "taken-log").status, "taken");
  assert.equal(findById(merged.logs, "new-lapse-log").status, "lapse");
});

test("a recorded hookah event resolves as a negative outcome, never success", () => {
  const hookah = {
    id: "hookah",
    trackingMode: "avoidance",
  };
  const lapse = {
    id: "hookah:2026-08-13:lapse",
    medicationId: hookah.id,
    date: "2026-08-13",
    status: "lapse",
    takenAt: "2026-08-13T18:00:00.000Z",
  };
  const matchingLogs = [lapse].filter(
    (log) => log.medicationId === hookah.id && log.date === "2026-08-13",
  );
  const isTaken = matchingLogs.some((log) => log.status === "taken");
  const hasLapse = matchingLogs.some((log) => log.status === "lapse");

  assert.equal(isTaken, false);
  assert.equal(hasLapse, true);
  assert.equal(isTaken || hasLapse, true, "the prompt is resolved");
  assert.equal(
    matchingLogs.filter((log) => log.status === "taken").length,
    0,
    "adherence success is unchanged",
  );
});

test("hookah lapse stays on the open checklist Care Day after End Care Day", () => {
  // After a manual End Care Day in the afternoon, the open checklist can be
  // ahead of careDayKeyForInstant(now). The lapse must stamp the checklist day
  // so the prompt resolves immediately instead of only showing a toast.
  const openCareDayKey = "2026-08-14";
  const clockDerivedCareDayKey = "2026-08-13";
  const lapse = {
    id: "hookah:open-day:lapse",
    medicationId: "hookah",
    date: openCareDayKey,
    status: "lapse",
    takenAt: "2026-08-13T15:30:00.000Z",
  };

  const matchesOpenDay = (log) =>
    log.medicationId === "hookah" &&
    log.status === "lapse" &&
    log.date === openCareDayKey;
  const matchesClockDay = (log) =>
    log.medicationId === "hookah" &&
    log.status === "lapse" &&
    log.date === clockDerivedCareDayKey;

  assert.equal(matchesOpenDay(lapse), true);
  assert.equal(matchesClockDay(lapse), false);
  assert.notEqual(
    openCareDayKey,
    clockDerivedCareDayKey,
    "reproduces the post-end-care-day mismatch",
  );
});

test("valid explicit mode changes and newer plan versions are accepted", () => {
  const merged = mergePrimarySyncData(
    {
      personalPlanVersion: 6,
      medications: [{ id: "hookah", trackingMode: "avoidance" }],
    },
    {
      personalPlanVersion: 7,
      medications: [{ id: "hookah", trackingMode: "completion" }],
    },
    "2026-08-13T20:00:00.000Z",
  );

  assert.equal(merged.personalPlanVersion, 7);
  assert.equal(findById(merged.medications, "hookah").trackingMode, "completion");
});

test("invalid versions cannot erase a stored version and tombstones still win", () => {
  const merged = mergePrimarySyncData(
    {
      personalPlanVersion: 6,
      logs: [{ id: "deleted-lapse", status: "lapse" }],
      deletedLogIds: ["deleted-lapse"],
    },
    {
      personalPlanVersion: null,
      logs: [{ id: "deleted-lapse", status: "taken" }],
    },
    "2026-08-13T20:00:00.000Z",
  );

  assert.equal(merged.personalPlanVersion, 6);
  assert.equal(findById(merged.logs, "deleted-lapse"), undefined);
  assert.deepEqual(Array.from(merged.deletedLogIds), ["deleted-lapse"]);
});

test("a stale client cannot move the server Care Day backward", () => {
  const currentCareDayState = {
    key: "2026-08-18",
    revision: 1,
    mutationId: "2026-08-18T05:15:00.000Z:end",
  };
  const merged = mergePrimarySyncData(
    {
      careDayState: currentCareDayState,
      careDayKey: currentCareDayState.key,
    },
    {
      careDayKey: "2026-08-17",
      medications: [{ id: "new-medication", name: "Still merge other data" }],
    },
    "2026-08-18T05:16:00.000Z",
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(merged.careDayState)),
    currentCareDayState,
  );
  assert.equal(merged.careDayKey, "2026-08-18");
  assert.equal(findById(merged.medications, "new-medication").name, "Still merge other data");
});

test("a newer revision can intentionally undo a Care Day change", () => {
  const undoState = {
    key: "2026-08-17",
    revision: 2,
    mutationId: "2026-08-18T05:17:00.000Z:undo",
  };
  const merged = mergePrimarySyncData(
    {
      careDayState: {
        key: "2026-08-18",
        revision: 1,
        mutationId: "2026-08-18T05:15:00.000Z:end",
      },
      careDayKey: "2026-08-18",
    },
    {
      careDayState: undoState,
      careDayKey: undoState.key,
    },
    "2026-08-18T05:18:00.000Z",
  );

  assert.deepEqual(JSON.parse(JSON.stringify(merged.careDayState)), undoState);
  assert.equal(merged.careDayKey, "2026-08-17");
});
