import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../app/care-day-state.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const careDayModule = { exports: {} };

vm.runInNewContext(compiled, {
  exports: careDayModule.exports,
  module: careDayModule,
  Date,
  Number,
  RangeError,
});

const {
  createLegacyCareDayState,
  normalizeCareDayState,
  selectCareDayState,
  transitionCareDayState,
} = careDayModule.exports;

test("a late cloud response cannot undo a locally ended Care Day", () => {
  const day17 = createLegacyCareDayState("2026-08-17");
  const delayedCloudResponse = { ...day17 };
  const day18 = transitionCareDayState(
    day17,
    "2026-08-18",
    "2026-08-18T05:15:00.000Z:end",
  );

  assert.deepEqual(
    selectCareDayState(delayedCloudResponse, day18),
    day18,
  );
});

test("Undo moves backward intentionally by creating a newer revision", () => {
  const day17 = createLegacyCareDayState("2026-08-17");
  const day18 = transitionCareDayState(
    day17,
    "2026-08-18",
    "2026-08-18T05:15:00.000Z:end",
  );
  const undo = transitionCareDayState(
    day18,
    "2026-08-17",
    "2026-08-18T05:16:00.000Z:undo",
  );

  assert.equal(undo.revision, 2);
  assert.deepEqual(selectCareDayState(day18, undo), undo);
});

test("legacy snapshots migrate by keeping the later valid Care Day", () => {
  const day17 = normalizeCareDayState(null, "2026-08-17");
  const day18 = normalizeCareDayState(undefined, "2026-08-18");

  assert.deepEqual(selectCareDayState(day17, day18), day18);
  assert.equal(normalizeCareDayState(null, "2026-02-30"), null);
});
