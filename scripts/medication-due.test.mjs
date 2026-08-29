import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadTsModule(relativePath, stubs = {}) {
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
  const sandboxRequire = (id) => {
    if (id in stubs) return stubs[id];
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = new URL(id, sourceUrl);
      if (resolved.pathname.endsWith(".ts")) {
        return loadTsModule(
          "./" +
            resolved.pathname
              .split("/scripts/")[1]
              ?.replace(/^/, "../")
              .replace(/^\.\.\/\.\.\//, "../") || id,
          stubs,
        );
      }
    }
    return require(id);
  };

  // Prefer compiling sibling app modules directly.
  const localRequire = (id) => {
    if (id === "./health-schedule") {
      return loadTsModule("../app/health-schedule.ts", {
        "./tehran-time": loadTsModule("../app/tehran-time.ts"),
      });
    }
    if (id === "./tehran-time") {
      return loadTsModule("../app/tehran-time.ts");
    }
    if (id.startsWith("@/")) {
      return {};
    }
    return require(id);
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
  });

  return module.exports;
}

const {
  isMedicationScheduledOnCareDay,
  resolveMedicationPresenceOnCareDay,
} = loadTsModule("../app/medication-due.ts");

function hibiclens(overrides = {}) {
  return {
    id: "hibiclens-1",
    name: "Hibiclens 4% Chlorhexidine Gluconate Solution",
    dosage: "1",
    unit: "wash",
    category: "skin",
    schedule: {
      type: "ordered",
      dayMode: "weekdays",
      times: [],
      days: ["tuesday", "friday"],
      order: 1,
      routineCategoryId: "morning",
      catchUpUntilNextScheduledDay: true,
    },
    notes: "",
    isActive: true,
    ...overrides,
  };
}

function takenLog(dateKey, id = `log-${dateKey}`) {
  return {
    id,
    medicationId: "hibiclens-1",
    medicationName: "Hibiclens",
    dosage: "1",
    unit: "wash",
    category: "skin",
    scheduleType: "ordered",
    scheduledTime: null,
    takenAt: `${dateKey}T10:00:00.000Z`,
    date: dateKey,
    status: "taken",
  };
}

// 2026-08-25 = Tuesday, 26 Wed, 27 Thu, 28 Fri, 29 Sat, 30 Sun, 31 Mon, 09-01 Tue

test("Hibiclens is scheduled on Tuesday and Friday only", () => {
  const med = hibiclens();
  assert.equal(isMedicationScheduledOnCareDay(med, "2026-08-25"), true);
  assert.equal(isMedicationScheduledOnCareDay(med, "2026-08-26"), false);
  assert.equal(isMedicationScheduledOnCareDay(med, "2026-08-28"), true);
  assert.equal(isMedicationScheduledOnCareDay(med, "2026-08-29"), false);
});

test("taken on Tuesday hides Wednesday and Thursday catch-up", () => {
  const med = hibiclens();
  const logs = [takenLog("2026-08-25")];

  assert.equal(
    resolveMedicationPresenceOnCareDay(med, "2026-08-25", logs).kind,
    "scheduled",
  );
  assert.equal(
    resolveMedicationPresenceOnCareDay(med, "2026-08-25", logs).isTaken,
    true,
  );
  assert.equal(
    resolveMedicationPresenceOnCareDay(med, "2026-08-26", logs).kind,
    "hidden",
  );
  assert.equal(
    resolveMedicationPresenceOnCareDay(med, "2026-08-27", logs).kind,
    "hidden",
  );
});

test("missed Tuesday stays catch-up on Wednesday and Thursday until used", () => {
  const med = hibiclens();
  const empty = [];

  const wed = resolveMedicationPresenceOnCareDay(med, "2026-08-26", empty);
  assert.equal(wed.kind, "catch-up");
  assert.equal(wed.fromDateKey, "2026-08-25");

  const thu = resolveMedicationPresenceOnCareDay(med, "2026-08-27", empty);
  assert.equal(thu.kind, "catch-up");
  assert.equal(thu.fromDateKey, "2026-08-25");

  const afterWedUse = resolveMedicationPresenceOnCareDay(med, "2026-08-27", [
    takenLog("2026-08-26"),
  ]);
  assert.equal(afterWedUse.kind, "hidden");
});

test("missed Tuesday is abandoned when Friday arrives", () => {
  const med = hibiclens();
  const fri = resolveMedicationPresenceOnCareDay(med, "2026-08-28", []);
  assert.equal(fri.kind, "scheduled");
  assert.equal(fri.isTaken, false);
});

test("Wednesday catch-up completion counts Tuesday scheduled day as taken", () => {
  const med = hibiclens();
  const tue = resolveMedicationPresenceOnCareDay(med, "2026-08-25", [
    takenLog("2026-08-26"),
  ]);
  assert.equal(tue.kind, "scheduled");
  assert.equal(tue.isTaken, true);
});

test("missed Friday stays catch-up until next Tuesday", () => {
  const med = hibiclens();
  const sat = resolveMedicationPresenceOnCareDay(med, "2026-08-29", []);
  const sun = resolveMedicationPresenceOnCareDay(med, "2026-08-30", []);
  const mon = resolveMedicationPresenceOnCareDay(med, "2026-08-31", []);
  const nextTue = resolveMedicationPresenceOnCareDay(med, "2026-09-01", []);

  assert.equal(sat.kind, "catch-up");
  assert.equal(sat.fromDateKey, "2026-08-28");
  assert.equal(sun.kind, "catch-up");
  assert.equal(mon.kind, "catch-up");
  assert.equal(nextTue.kind, "scheduled");
});

test("catch-up flag off never carries overdue days", () => {
  const med = hibiclens({
    schedule: {
      type: "ordered",
      dayMode: "weekdays",
      times: [],
      days: ["tuesday", "friday"],
      order: 1,
      routineCategoryId: "morning",
    },
  });
  assert.equal(
    resolveMedicationPresenceOnCareDay(med, "2026-08-26", []).kind,
    "hidden",
  );
});
