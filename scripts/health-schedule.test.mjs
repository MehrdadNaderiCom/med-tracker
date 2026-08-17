import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../app/health-schedule.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const scheduleModule = { exports: {} };

vm.runInNewContext(compiled, {
  exports: scheduleModule.exports,
  module: scheduleModule,
  Intl,
  Date,
  Set,
  RangeError,
});

const {
  addCareDays,
  assessBloodPressureSession,
  averageBloodPressure,
  careDayKeyForInstant,
  careDayMinute,
  diffCareDays,
  entryCareDayKey,
  evaluateBloodPressurePlan,
  evaluateHealthTasks,
} = scheduleModule.exports;

const atTehran = (localIso) => `${localIso}+03:30`;
const reading = (systolic, diastolic, measuredAt) => ({
  systolic,
  diastolic,
  ...(measuredAt ? { measuredAt } : {}),
});
const session = ({
  id = crypto.randomUUID(),
  careDayKey,
  period = "morning",
  arm = "right",
  readings,
  measuredAt = atTehran(`${careDayKey ?? "2026-08-14"}T12:10:00`),
}) => ({ id, careDayKey, period, arm, readings, measuredAt });

test("Tehran 11:59 belongs to the previous Care Day and noon starts the next", () => {
  assert.equal(
    careDayKeyForInstant(atTehran("2026-08-14T11:59:00")),
    "2026-08-13",
  );
  assert.equal(
    careDayKeyForInstant(atTehran("2026-08-14T12:00:00")),
    "2026-08-14",
  );
  assert.equal(
    careDayKeyForInstant("2026-08-13T20:56:02.502Z"),
    "2026-08-13",
    "00:26 Tehran must remain in the Care Day that began the previous noon",
  );
});

test("Care Day minutes correctly order 23:00 before 01:00", () => {
  assert.equal(careDayMinute("12:00"), 0);
  assert.equal(careDayMinute("23:00"), 660);
  assert.equal(careDayMinute("01:00"), 780);
  assert.equal(careDayMinute("08:00"), 1200);
  assert.ok(careDayMinute("23:00") < careDayMinute("01:00"));
  assert.ok(careDayMinute("01:00") < careDayMinute("08:00"));
});

test("Care Day date math remains calendar-safe", () => {
  assert.equal(addCareDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addCareDays("2026-03-21", -1), "2026-03-20");
  assert.equal(diffCareDays("2026-09-02", "2026-08-31"), 2);
});

test("stored Care Day wins while legacy instants are derived", () => {
  assert.equal(
    entryCareDayKey({
      careDayKey: "2026-08-10",
      measuredAt: atTehran("2026-08-14T13:00:00"),
    }),
    "2026-08-10",
  );
  assert.equal(
    entryCareDayKey({ measuredAt: atTehran("2026-08-14T01:00:00") }),
    "2026-08-13",
  );
  assert.equal(entryCareDayKey({ measuredAt: "2026-08-13" }), "2026-08-13");
});

test("one BP reading is saved as partial and its average remains useful", () => {
  const partialSession = session({
    careDayKey: "2026-08-14",
    measuredAt: atTehran("2026-08-14T14:59:00"),
    readings: [reading(142, 91, atTehran("2026-08-14T14:59:00"))],
  });
  const partial = assessBloodPressureSession(partialSession);
  assert.equal(partial.readingCount, 1);
  assert.equal(partial.pairStatus, "partial");
  assert.equal(partial.trendEligible, false);
  assert.equal(partial.average.systolic, 142);

  const tasks = evaluateHealthTasks({
    now: atTehran("2026-08-14T15:00:00"),
    bloodPressureSessions: [partialSession],
    settings: {
      bpReminderEnabled: true,
      bpCycleStartDate: "2026-08-14",
      bpCycleEndDate: "2026-08-20",
    },
  }).tasks;
  assert.equal(
    tasks.find((task) => task.kind === "blood-pressure-morning").status,
    "partial",
  );
});

test("a timed pair requires at least 60 seconds; a legacy pair stays trend-eligible", () => {
  const tooSoon = assessBloodPressureSession(
    session({
      readings: [
        reading(140, 90, "2026-08-14T08:40:00.000Z"),
        reading(136, 88, "2026-08-14T08:40:59.000Z"),
      ],
    }),
  );
  assert.equal(tooSoon.pairStatus, "interval-too-short");
  assert.equal(tooSoon.trendEligible, false);

  const tenMinutes = assessBloodPressureSession(
    session({
      readings: [
        reading(140, 90, "2026-08-14T08:40:00.000Z"),
        reading(136, 88, "2026-08-14T08:50:00.000Z"),
      ],
    }),
  );
  assert.equal(tenMinutes.pairStatus, "complete");
  const tooLate = assessBloodPressureSession(
    session({
      readings: [
        reading(140, 90, "2026-08-14T08:40:00.000Z"),
        reading(136, 88, "2026-08-14T08:50:01.000Z"),
      ],
    }),
  );
  assert.equal(tooLate.pairStatus, "interval-too-long");
  assert.equal(tooLate.trendEligible, false);

  const legacy = assessBloodPressureSession(
    session({ readings: [reading(140, 90), reading(136, 88)] }),
  );
  assert.equal(legacy.pairStatus, "complete-legacy");
  assert.equal(legacy.intervalConfirmed, false);
  assert.equal(legacy.trendEligible, true);
});

test("a timed pair is eligible through 600 seconds but not at 601 seconds", () => {
  const atBoundary = assessBloodPressureSession(
    session({
      readings: [
        reading(124, 80, "2026-08-14T08:40:00.000Z"),
        reading(122, 78, "2026-08-14T08:50:00.000Z"),
      ],
    }),
  );
  assert.equal(atBoundary.intervalSeconds, 600);
  assert.equal(atBoundary.pairStatus, "complete");
  assert.equal(atBoundary.trendEligible, true);

  const beyondBoundary = assessBloodPressureSession(
    session({
      readings: [
        reading(124, 80, "2026-08-14T08:40:00.000Z"),
        reading(122, 78, "2026-08-14T08:50:01.000Z"),
      ],
    }),
  );
  assert.equal(beyondBoundary.intervalSeconds, 601);
  assert.equal(beyondBoundary.pairStatus, "interval-too-long");
  assert.equal(beyondBoundary.trendEligible, false);
});

test("non-routine BP contexts exclude an otherwise valid pair from protocol trends", () => {
  const nonRoutineFlags = [
    "emotional-stress",
    "relationship-conflict",
    "acute-pain",
    "acute-illness",
    "rushed",
    "caffeine",
    "nicotine",
    "exercise",
    "alcohol",
    "meal",
    "full-bladder",
    "talking",
    "not-rested",
    "positioning-issue",
    "cuff-issue",
    "other",
  ];

  for (const flag of nonRoutineFlags) {
    const assessed = assessBloodPressureSession({
      ...session({
        readings: [
          reading(181, 88, "2026-08-14T08:40:00.000Z"),
          reading(136, 86, "2026-08-14T08:41:00.000Z"),
        ],
      }),
      standardConditions: true,
      contextFlags: [flag],
    });

    assert.equal(assessed.pairStatus, "complete", flag);
    assert.equal(assessed.trendEligible, false, flag);
    assert.equal(assessed.highPair, false, flag);
    assert.equal(assessed.rawSevere, true, flag);
  }
});

test("poor sleep remains interpretive context rather than a technique failure", () => {
  const assessed = assessBloodPressureSession({
    ...session({
      readings: [
        reading(138, 88, "2026-08-14T08:40:00.000Z"),
        reading(136, 86, "2026-08-14T08:41:00.000Z"),
      ],
    }),
    standardConditions: true,
    contextFlags: ["poor-sleep"],
  });

  assert.equal(assessed.pairStatus, "complete");
  assert.equal(assessed.trendEligible, true);
  assert.equal(assessed.highPair, true);
});

test("a symptom-triggered pair remains visible but stays out of routine trends", () => {
  const assessed = assessBloodPressureSession({
    ...session({
      readings: [
        reading(138, 88, "2026-08-14T08:40:00.000Z"),
        reading(136, 86, "2026-08-14T08:41:00.000Z"),
      ],
    }),
    standardConditions: true,
    contextFlags: [],
    triggeredBySymptoms: true,
  });

  assert.equal(assessed.pairStatus, "complete");
  assert.equal(assessed.trendEligible, false);
  assert.equal(assessed.highPair, false);
});

test("averaging is constrained to one session-level arm", () => {
  const assessed = assessBloodPressureSession(
    session({
      arm: "left",
      readings: [reading(120, 80), reading(122, 82)],
    }),
  );
  assert.equal(assessed.arm, "left");
  assert.deepEqual(
    JSON.parse(JSON.stringify(averageBloodPressure([
      reading(120, 80),
      reading(122, 82),
    ]))),
    { systolic: 121, diastolic: 81 },
  );
  assert.equal("arm" in assessed, true);
  assert.equal("arm" in assessed.average, false);
});

test("either severe raw value triggers immediate urgency even if the other is normal", () => {
  const severe = session({
    id: "severe-first",
    careDayKey: "2026-08-14",
    measuredAt: atTehran("2026-08-14T14:30:00"),
    readings: [reading(181, 70), reading(120, 70)],
  });
  const assessed = assessBloodPressureSession(severe);
  assert.equal(assessed.rawSevere, true);
  const plan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    currentCareDayKey: "2026-08-14",
    sessions: [severe],
    reminderEnabled: false,
  });
  assert.equal(plan.mode, "urgent");
  assert.equal(plan.urgentSessionId, "severe-first");

  const urgentTasks = evaluateHealthTasks({
    now: atTehran("2026-08-14T15:00:00"),
    bloodPressureSessions: [severe],
    settings: { bpReminderEnabled: false },
  }).tasks.filter((task) => task.severity === "urgent");
  assert.equal(urgentTasks.length, 1);
  assert.equal(urgentTasks[0].kind, "blood-pressure-morning");
  assert.equal(urgentTasks[0].status, "due");
});

test("a severe session older than the 60-minute urgent window is historical, not urgent", () => {
  const historicalSevere = session({
    id: "historical-severe",
    careDayKey: "2026-08-14",
    measuredAt: atTehran("2026-08-14T13:30:00"),
    readings: [reading(181, 70)],
  });
  const plan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    currentCareDayKey: "2026-08-14",
    sessions: [historicalSevere],
    reminderEnabled: false,
  });

  assert.equal(plan.urgent, false);
  assert.equal(plan.urgentSessionId, undefined);
  assert.equal(plan.mode, "inactive");
});

test("one non-severe out-of-range day starts observation; recurrence strengthens it", () => {
  const highSameDay = [
    session({ careDayKey: "2026-08-13", readings: [reading(140, 90), reading(138, 88)] }),
    session({ careDayKey: "2026-08-13", period: "evening", readings: [reading(142, 92), reading(138, 88)] }),
  ];
  const singleDayPlan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    sessions: highSameDay,
  });
  assert.equal(singleDayPlan.enhancedReason, "single-high");
  assert.equal(singleDayPlan.enhancedCycleActive, true);
  const highTwoDays = [
    ...highSameDay,
    session({ careDayKey: "2026-08-14", readings: [reading(137, 86), reading(136, 86)] }),
  ];
  const highPlan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    sessions: highTwoDays,
  });
  assert.equal(highPlan.enhancedReason, "recurrent-high");
  assert.equal(highPlan.suggestedCycleEndKey, "2026-08-20");

  const lowPlan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    sessions: [
      session({ careDayKey: "2026-08-13", readings: [reading(88, 58), reading(89, 59)] }),
      session({ careDayKey: "2026-08-14", readings: [reading(87, 61), reading(88, 61)] }),
    ],
  });
  assert.equal(lowPlan.enhancedReason, "recurrent-low");
});

test("a new qualifying high or low day renews the enhanced cycle from the latest day", () => {
  const highPlan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    currentCareDayKey: "2026-08-14",
    sessions: [
      session({ careDayKey: "2026-08-01", readings: [reading(140, 90), reading(138, 88)] }),
      session({ careDayKey: "2026-08-02", readings: [reading(141, 91), reading(139, 89)] }),
      session({ careDayKey: "2026-08-14", readings: [reading(137, 86), reading(136, 86)] }),
    ],
  });
  assert.equal(highPlan.enhancedReason, "recurrent-high");
  assert.equal(highPlan.suggestedCycleStartKey, "2026-08-14");
  assert.equal(highPlan.suggestedCycleEndKey, "2026-08-20");
  assert.equal(highPlan.enhancedCycleActive, true);

  const lowPlan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    currentCareDayKey: "2026-08-14",
    sessions: [
      session({ careDayKey: "2026-08-01", readings: [reading(88, 58), reading(89, 59)] }),
      session({ careDayKey: "2026-08-02", readings: [reading(87, 61), reading(88, 61)] }),
      session({ careDayKey: "2026-08-14", readings: [reading(89, 59), reading(88, 58)] }),
    ],
  });
  assert.equal(lowPlan.enhancedReason, "recurrent-low");
  assert.equal(lowPlan.suggestedCycleStartKey, "2026-08-14");
  assert.equal(lowPlan.suggestedCycleEndKey, "2026-08-20");
  assert.equal(lowPlan.enhancedCycleActive, true);
});

test("missing reminders escalate only inside the active plan", () => {
  const outside = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    cycleStartKey: "2026-08-01",
    cycleEndKey: "2026-08-07",
    sessions: [],
  });
  assert.equal(outside.active, false);
  assert.equal(outside.missingStreak, 0);
  assert.equal(outside.missingLevel, "none");

  const one = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    cycleStartKey: "2026-08-13",
    cycleEndKey: "2026-08-20",
    sessions: [],
  });
  assert.equal(one.missingLevel, "gentle");
  const two = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    cycleStartKey: "2026-08-12",
    cycleEndKey: "2026-08-20",
    sessions: [],
  });
  assert.equal(two.missingLevel, "amber");
  const three = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    cycleStartKey: "2026-08-11",
    cycleEndKey: "2026-08-20",
    sessions: [],
  });
  assert.equal(three.missingLevel, "restart");
  assert.equal(three.recommendRestartOrExtend, true);

  const enhanced = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    sessions: [
      session({ careDayKey: "2026-08-10", readings: [reading(140, 90), reading(138, 88)] }),
      session({ careDayKey: "2026-08-11", readings: [reading(141, 91), reading(139, 89)] }),
    ],
  });
  assert.equal(enhanced.mode, "enhanced");
  assert.equal(enhanced.enhancedCycleActive, true);
  assert.equal(enhanced.missingStreak, 2);
  assert.equal(enhanced.missingLevel, "amber");
});

test("an incomplete scheduled cycle keeps a capped three-Care-Day follow-up", () => {
  const followUp = evaluateBloodPressurePlan({
    now: atTehran("2026-08-08T15:00:00"),
    currentCareDayKey: "2026-08-08",
    cycleStartKey: "2026-08-01",
    cycleEndKey: "2026-08-07",
    sessions: [],
  });
  assert.equal(followUp.postCycleFollowUp, true);
  assert.equal(followUp.active, true);
  assert.equal(followUp.recommendRestartOrExtend, true);

  const capped = evaluateBloodPressurePlan({
    now: atTehran("2026-08-11T15:00:00"),
    currentCareDayKey: "2026-08-11",
    cycleStartKey: "2026-08-01",
    cycleEndKey: "2026-08-07",
    sessions: [],
  });
  assert.equal(capped.postCycleFollowUp, false);
  assert.equal(capped.active, false);

  const recovered = evaluateBloodPressurePlan({
    now: atTehran("2026-08-08T15:00:00"),
    currentCareDayKey: "2026-08-08",
    cycleStartKey: "2026-08-01",
    cycleEndKey: "2026-08-07",
    sessions: [
      session({
        careDayKey: "2026-08-08",
        readings: [
          reading(124, 78, atTehran("2026-08-08T14:00:00")),
          reading(122, 76, atTehran("2026-08-08T14:01:00")),
        ],
      }),
    ],
  });
  assert.equal(recovered.postCycleFollowUp, false);

  const partialDoesNotClear = evaluateBloodPressurePlan({
    now: atTehran("2026-08-08T15:00:00"),
    currentCareDayKey: "2026-08-08",
    cycleStartKey: "2026-08-01",
    cycleEndKey: "2026-08-07",
    sessions: [
      session({ careDayKey: "2026-08-08", readings: [reading(124, 78)] }),
    ],
  });
  assert.equal(partialDoesNotClear.postCycleFollowUp, true);
});

test("absence never becomes an abnormal BP trend", () => {
  const plan = evaluateBloodPressurePlan({
    now: atTehran("2026-08-14T15:00:00"),
    cycleStartKey: "2026-08-11",
    cycleEndKey: "2026-08-20",
    sessions: [],
  });
  assert.equal(plan.qualifyingHighCareDays.length, 0);
  assert.equal(plan.qualifyingLowCareDays.length, 0);
  assert.equal(plan.enhancedReason, null);
  assert.equal(plan.urgent, false);
});

test("waist recurs at 14 Care Days while activity defaults to seven", () => {
  const common = {
    now: atTehran("2026-08-14T15:00:00"),
    careDayKey: "2026-08-14",
    settings: {
      bpReminderEnabled: false,
      waistReminderEnabled: true,
      waistReminderTime: "12:20",
      waistReminderIntervalDays: 14,
      activityReminderEnabled: true,
      activityReminderTime: "12:20",
      activityReminderIntervalDays: 7,
    },
  };
  const notYet = evaluateHealthTasks({
    ...common,
    waistEntries: [{ careDayKey: "2026-08-01" }],
    activityCheckIns: [{ careDayKey: "2026-08-07" }],
  });
  assert.equal(notYet.tasks.find((task) => task.kind === "waist").status, "inactive");
  assert.equal(notYet.tasks.find((task) => task.kind === "activity").status, "due");

  const due = evaluateHealthTasks({
    ...common,
    waistEntries: [{ careDayKey: "2026-07-31" }],
  });
  assert.equal(due.tasks.find((task) => task.kind === "waist").status, "due");
  assert.equal(due.tasks.find((task) => task.kind === "waist").reason, "interval-due");
});

test("the unified engine keeps the 01:00 BP task after the 23:00 diet task", () => {
  const evaluation = evaluateHealthTasks({
    now: atTehran("2026-08-15T00:30:00"),
    careDayKey: "2026-08-14",
    settings: {
      weightReminderEnabled: true,
      weightReminderTime: "08:00",
      dietReminderEnabled: true,
      dietReminderTime: "23:00",
      bpReminderEnabled: true,
      bpMorningReminderTime: "08:10",
      bpEveningReminderTime: "01:00",
      bpCycleStartDate: "2026-08-14",
      bpCycleEndDate: "2026-08-20",
    },
  });
  assert.equal(evaluation.currentMinute, 750);
  assert.equal(evaluation.tasks.find((task) => task.kind === "diet").status, "due");
  assert.equal(
    evaluation.tasks.find((task) => task.kind === "blood-pressure-evening").status,
    "upcoming",
  );
});

test("next-morning reminders become due inside the same noon-to-noon Care Day", () => {
  const settings = {
    weightReminderEnabled: true,
    weightReminderTime: "08:00",
    bpReminderEnabled: true,
    bpMorningReminderTime: "08:10",
    bpEveningReminderTime: "01:00",
    bpCycleStartDate: "2026-08-14",
    bpCycleEndDate: "2026-08-20",
    waistReminderEnabled: true,
    waistReminderTime: "08:20",
    waistReminderIntervalDays: 14,
  };
  const at0815 = evaluateHealthTasks({
    now: atTehran("2026-08-15T08:15:00"),
    careDayKey: "2026-08-14",
    settings,
    waistEntries: [{ careDayKey: "2026-07-31" }],
  });
  assert.equal(at0815.currentMinute, 1215);
  assert.equal(at0815.tasks.find((task) => task.kind === "weight").status, "due");
  assert.equal(
    at0815.tasks.find((task) => task.kind === "blood-pressure-morning").status,
    "due",
  );
  assert.equal(at0815.tasks.find((task) => task.kind === "waist").status, "upcoming");

  const at0825 = evaluateHealthTasks({
    now: atTehran("2026-08-15T08:25:00"),
    careDayKey: "2026-08-14",
    settings,
    waistEntries: [{ careDayKey: "2026-07-31" }],
  });
  assert.equal(at0825.tasks.find((task) => task.kind === "waist").status, "due");
});
