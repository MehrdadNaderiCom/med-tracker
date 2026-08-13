import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const mergeModuleUrl = new URL("../app/api/sync/merge.ts", import.meta.url);
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
const testModule = { exports: {} };

vm.runInNewContext(compiledMergeModule, {
  exports: testModule.exports,
  module: testModule,
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
      { id: "lapse-log", medicationId: "hookah", status: "lapse" },
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
