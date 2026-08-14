import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../app/tehran-time.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const moduleUnderTest = { exports: {} };

vm.runInNewContext(compiled, {
  exports: moduleUnderTest.exports,
  module: moduleUnderTest,
  Intl,
  Date,
  RegExp,
});

const {
  formatDateKey,
  formatTehranInstant,
  formatTimeOfDay,
  parseDateKey,
  tehranDateKey,
  tehranDateTimeLocal,
  tehranTime24,
  tehranWallTimeToIso,
  weekdayIndexForDateKey,
} = moduleUnderTest.exports;

test("Iran civil date and clock come from Asia/Tehran, not the device zone", () => {
  const instant = "2026-08-13T20:45:00.000Z";
  assert.equal(tehranDateKey(instant), "2026-08-14");
  assert.equal(tehranTime24(instant), "00:15");
  assert.equal(tehranDateTimeLocal(instant), "2026-08-14T00:15");
  assert.equal(
    formatTehranInstant(instant, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    "12:15 AM",
  );
});

test("Iran datetime-local values round-trip to canonical ISO instants", () => {
  assert.equal(
    tehranWallTimeToIso("2026-08-14T08:10"),
    "2026-08-14T04:40:00.000Z",
  );
  assert.equal(
    tehranDateTimeLocal("2026-08-14T04:40:00.000Z"),
    "2026-08-14T08:10",
  );
  assert.equal(tehranWallTimeToIso("2026-02-30T08:10"), null);
});

test("date-only labels and weekdays are deterministic", () => {
  assert.ok(parseDateKey("2026-08-14"));
  assert.equal(parseDateKey("2026-02-30"), null);
  assert.equal(weekdayIndexForDateKey("2026-08-14"), 5);
  assert.equal(
    formatDateKey("2026-08-14", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    "Friday, August 14",
  );
});

test("configured reminder clocks do not use the ambient device timezone", () => {
  assert.equal(formatTimeOfDay("01:00"), "1:00 AM");
  assert.equal(formatTimeOfDay("22:30"), "10:30 PM");
  assert.equal(formatTimeOfDay("24:00"), null);
});
