import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadTs(relativePath, stubs = {}) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourceUrl.pathname,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (stubs[id]) return stubs[id];
    if (id === "./tehran-time") return loadTs("../app/tehran-time.ts");
    if (id === "./health-schedule") {
      return loadTs("../app/health-schedule.ts", {
        "./tehran-time": loadTs("../app/tehran-time.ts"),
      });
    }
    throw new Error(`Unexpected require: ${id}`);
  };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: localRequire,
    console,
    Date,
    Number,
    String,
    Array,
    Set,
    Map,
    Object,
    Math,
    JSON,
    RangeError,
    Error,
    Intl,
    RegExp,
  });
  return module.exports;
}

const { addCareDays } = loadTs("../app/health-schedule.ts");
const { weekdayIndexForDateKey } = loadTs("../app/tehran-time.ts");
const WEEK_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getNextWeekdayDateKeyAfter(fromDateKey, weekday) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addCareDays(fromDateKey, offset);
    if (WEEK_DAYS[weekdayIndexForDateKey(candidate)] === weekday) {
      return candidate;
    }
  }
  return addCareDays(fromDateKey, 1);
}

test("next Tuesday after Saturday 2026-08-29 is 2026-09-01", () => {
  assert.equal(getNextWeekdayDateKeyAfter("2026-08-29", "tuesday"), "2026-09-01");
});

test("next Tuesday after a Tuesday is the following week", () => {
  assert.equal(getNextWeekdayDateKeyAfter("2026-09-01", "tuesday"), "2026-09-08");
});

test("next Tuesday after Friday is the coming Tuesday", () => {
  assert.equal(getNextWeekdayDateKeyAfter("2026-08-28", "tuesday"), "2026-09-01");
});
