"use client";

import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Info,
  Plus,
  Salad,
  Scale,
  Settings2,
  ShieldAlert,
  Trash2,
  TrendingDown,
  Ruler,
  Dumbbell,
  Edit3,
} from "lucide-react";
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  ActivityCheckIn,
  BloodPressureArm,
  BloodPressureContextFlag,
  BloodPressureCuffSite,
  BloodPressureEmergencySymptom,
  BloodPressureMedicationTiming,
  BloodPressurePeriod,
  BloodPressurePosition,
  BloodPressureReading,
  BloodPressureSession,
  BloodPressureSymptom,
  DietAdherence,
  DietCheckIn,
  ExerciseActivityType,
  ExerciseIntensity,
  ExerciseSession,
  HealthProfile,
  HealthSettings,
  StrengthExerciseLog,
  StrengthMuscleGroup,
  StrengthResistanceType,
  WaistEntry,
  WaistMeasurementMethod,
  WeightEntry,
} from "@/types/health";
import {
  assessBloodPressureSession,
  careDayKeyForInstant,
  careDayMinute,
  entryCareDayKey,
  evaluateHealthTasks,
} from "@/app/health-schedule";
import {
  getExerciseSessionTehranDateKey,
  getTrailingTehranDateKeys,
  isAerobicExerciseActivityType,
  normalizeNewBloodPressureReading,
  summarizeExerciseSessions,
  type NewBloodPressureReading,
} from "@/app/health-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HEALTH_TIME_ZONE = "Asia/Tehran";
const SAFE_WEEKLY_LOSS_MIN_KG = 0.45;
const SAFE_WEEKLY_LOSS_MAX_KG = 0.91;
const URGENT_READING_WINDOW_MS = 60 * MINUTE_MS;
const RECENT_SESSION_WINDOW_MS = 12 * 60 * MINUTE_MS;
const MORNING_BP_WINDOW_END_TIME = "10:00";

const INPUT_CLASS =
  "w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-base text-zinc-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-zinc-100 sm:text-sm";
const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-zinc-700";
const CARD_CLASS =
  "rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5";
const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-300 sm:w-auto";

const EMERGENCY_SYMPTOMS: {
  id: BloodPressureEmergencySymptom;
  label: string;
}[] = [
  { id: "chest-pain", label: "Chest pain" },
  { id: "shortness-of-breath", label: "Severe or unexplained shortness of breath" },
  { id: "back-pain", label: "Back pain" },
  { id: "numbness", label: "Sudden numbness" },
  { id: "weakness", label: "Sudden weakness" },
  { id: "vision-change", label: "Sudden vision change" },
  { id: "difficulty-speaking", label: "Sudden difficulty speaking" },
];

const BP_PERIOD_LABELS: Record<BloodPressurePeriod, string> = {
  morning: "After waking",
  evening: "Before sleep",
  other: "Other time",
};

const BP_ARM_LABELS: Record<BloodPressureArm, string> = {
  left: "Left arm",
  right: "Right arm",
  unknown: "Arm not recorded",
};

const BP_POSITION_LABELS: Record<BloodPressurePosition, string> = {
  seated: "Seated",
  standing: "Standing",
  lying: "Lying down",
  unknown: "Position not recorded",
};

const BP_CUFF_SITE_LABELS: Record<BloodPressureCuffSite, string> = {
  "upper-arm": "Upper-arm cuff",
  wrist: "Wrist cuff",
  other: "Other cuff site",
  unknown: "Cuff site not recorded",
};

const BP_MEDICATION_TIMING_LABELS: Record<BloodPressureMedicationTiming, string> = {
  "before-dose": "Before blood-pressure medicine",
  "after-dose": "After blood-pressure medicine",
  unknown: "Medicine timing not recorded",
};

const BP_CONTEXT_LABELS: Record<BloodPressureContextFlag, string> = {
  "emotional-stress": "Acute emotional stress or anxiety",
  "relationship-conflict": "After an argument or relationship conflict",
  "acute-pain": "Pain during measurement",
  "acute-illness": "Acute illness or fever",
  "poor-sleep": "Poor or insufficient sleep the night before",
  rushed: "Rushed shortly before settling for the measurement",
  caffeine: "Caffeine within 30 minutes",
  nicotine: "Nicotine or hookah within 30 minutes",
  exercise: "Exercise within 30 minutes",
  alcohol: "Alcohol within 30 minutes",
  meal: "Recent meal",
  "full-bladder": "Full bladder",
  talking: "Talking or phone use during rest or measurement",
  "not-rested": "Did not rest for 5 minutes",
  "positioning-issue": "Feet, back, or arm not correctly supported",
  "cuff-issue": "Cuff fit, placement, or clothing concern",
  other: "Other non-standard condition",
};

const BP_STANDARD_SETUP_EXCEPTION_FLAGS = new Set<BloodPressureContextFlag>([
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
]);

const BP_CONTEXT_GROUPS = [
  {
    label: "Emotional / physical context",
    options: [
      ["emotional-stress", "Stress / anxiety"],
      ["relationship-conflict", "Argument / relationship conflict"],
      ["acute-pain", "Pain"],
      ["acute-illness", "Illness / fever"],
      ["rushed", "Rushed shortly beforehand"],
      ["poor-sleep", "Poor sleep"],
    ],
  },
  {
    label: "Within 30 minutes",
    options: [
      ["caffeine", "Caffeine"],
      ["nicotine", "Hookah / nicotine"],
      ["exercise", "Exercise"],
      ["alcohol", "Alcohol"],
      ["meal", "Meal"],
    ],
  },
  {
    label: "Measurement setup exceptions",
    options: [
      ["full-bladder", "Full bladder"],
      ["talking", "Talking / phone use"],
      ["not-rested", "No 5-min rest"],
      ["positioning-issue", "Feet / back / arm position"],
      ["cuff-issue", "Cuff concern"],
      ["other", "Other"],
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  options: ReadonlyArray<readonly [BloodPressureContextFlag, string]>;
}>;

const BP_SYMPTOM_LABELS: Record<BloodPressureSymptom, string> = {
  dizziness: "Dizziness",
  fainting: "Fainting",
  nausea: "Nausea",
  confusion: "Confusion",
  "blurred-vision": "Blurred vision",
  palpitations: "Palpitations",
};

const EXERCISE_ACTIVITY_OPTIONS: ReadonlyArray<{
  id: ExerciseActivityType;
  label: string;
}> = [
  { id: "stationary-bike", label: "Stationary bike" },
  { id: "walking", label: "Walking" },
  { id: "outdoor-cycling", label: "Outdoor cycling" },
  { id: "running", label: "Running / jogging" },
  { id: "elliptical", label: "Elliptical" },
  { id: "swimming", label: "Swimming" },
  { id: "strength-training", label: "Strength training" },
  { id: "mobility", label: "Mobility / stretching" },
  { id: "other-aerobic", label: "Other aerobic activity" },
  { id: "other", label: "Other movement" },
];

const EXERCISE_ACTIVITY_LABELS = Object.fromEntries(
  EXERCISE_ACTIVITY_OPTIONS.map(({ id, label }) => [id, label]),
) as Record<ExerciseActivityType, string>;

const EXERCISE_INTENSITY_LABELS: Record<ExerciseIntensity, string> = {
  light: "Light",
  moderate: "Moderate",
  vigorous: "Vigorous",
  unknown: "Not recorded",
};

const BIKE_OR_MACHINE_TYPES = new Set<ExerciseActivityType>([
  "stationary-bike",
  "outdoor-cycling",
  "elliptical",
]);

const DISTANCE_EXERCISE_TYPES = new Set<ExerciseActivityType>([
  "stationary-bike",
  "walking",
  "outdoor-cycling",
  "running",
  "elliptical",
  "swimming",
  "other-aerobic",
]);

const STEP_EXERCISE_TYPES = new Set<ExerciseActivityType>([
  "walking",
  "running",
]);

const STRENGTH_MUSCLE_GROUP_LABELS: Record<StrengthMuscleGroup, string> = {
  legs: "Legs",
  hips: "Hips",
  back: "Back",
  abdomen: "Abdomen",
  chest: "Chest",
  shoulders: "Shoulders",
  arms: "Arms",
};

const STRENGTH_RESISTANCE_LABELS: Record<StrengthResistanceType, string> = {
  bodyweight: "Bodyweight",
  "free-weight": "Free weight",
  machine: "Machine",
  band: "Resistance band",
  other: "Other",
};

type ExerciseReportRange = "today" | "7-days" | "30-days" | "all";

const EXERCISE_REPORT_RANGE_OPTIONS: ReadonlyArray<{
  id: ExerciseReportRange;
  label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "7-days", label: "7 days" },
  { id: "30-days", label: "30 days" },
  { id: "all", label: "All" },
];

type MaybePromise = void | Promise<void>;

export interface HealthTrackerProps {
  careDayKey: string;
  weightEntries: WeightEntry[];
  bloodPressureSessions: BloodPressureSession[];
  dietCheckIns: DietCheckIn[];
  waistEntries: WaistEntry[];
  activityCheckIns: ActivityCheckIn[];
  exerciseSessions: ExerciseSession[];
  profile: HealthProfile;
  settings: HealthSettings;
  now: Date;
  onAddWeight: (entry: WeightEntry) => MaybePromise;
  onDeleteWeight: (entryId: string) => MaybePromise;
  onAddBloodPressure: (session: BloodPressureSession) => MaybePromise;
  onDeleteBloodPressure: (sessionId: string) => MaybePromise;
  onAddDiet: (checkIn: DietCheckIn) => MaybePromise;
  onDeleteDiet: (checkInId: string) => MaybePromise;
  onAddWaist: (entry: WaistEntry) => MaybePromise;
  onDeleteWaist: (entryId: string) => MaybePromise;
  onAddActivity: (entry: ActivityCheckIn) => MaybePromise;
  onDeleteActivity: (entryId: string) => MaybePromise;
  onAddExerciseSession: (session: ExerciseSession) => MaybePromise;
  onDeleteExerciseSession: (sessionId: string) => MaybePromise;
  onUpdateProfile: (profile: HealthProfile) => MaybePromise;
  onUpdateSettings: (settings: HealthSettings) => MaybePromise;
}

type BpCategory =
  | "normal"
  | "elevated"
  | "stage-1"
  | "stage-2"
  | "severe";

type BpAverage = {
  systolic: number;
  diastolic: number;
  pulseBpm: number | null;
};

type DueAction = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  dueNow: boolean;
  windowPassed?: boolean;
  href: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HEALTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toDateTimeLocal(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HEALTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function tehranOffsetMinutes(date: Date) {
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: HEALTH_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zoneName ?? "");
  if (!match) return 210;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function toIsoTimestamp(localValue: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const wallClockUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  const approximateDate = new Date(wallClockUtc);
  const date = new Date(
    wallClockUtc - tehranOffsetMinutes(approximateDate) * MINUTE_MS,
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: HEALTH_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTimeOnly(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: HEALTH_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatChartDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: HEALTH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatShortDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: HEALTH_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(date);
}

function makeId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

function isFutureTimestamp(value: string, now: Date) {
  const date = new Date(value);
  return date.getTime() > now.getTime() + 10 * MINUTE_MS;
}

function ageAt(dateOfBirth: string, now: Date) {
  const birth = parseDateOnly(dateOfBirth);
  const today = parseDateOnly(localDateKey(now));
  if (!birth || !today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function bmiScreeningLabel(bmi: number) {
  if (bmi < 18.5) return "underweight range";
  if (bmi < 25) return "healthy-weight range";
  if (bmi < 30) return "overweight range";
  return "obesity range";
}

function waistHeightScreeningLabel(ratio: number) {
  if (ratio < 0.5) return "below the 0.5 screening threshold";
  if (ratio < 0.6) return "increased-risk screening range";
  return "further-increased-risk screening range";
}

function isMeasurementWithin(value: string, now: Date, windowMs: number) {
  const timestamp = new Date(value).getTime();
  const age = now.getTime() - timestamp;
  return Number.isFinite(timestamp) && age >= -10 * MINUTE_MS && age <= windowMs;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function inclusiveCalendarDays(start: string, end: string) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) return null;
  const startUtc = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const endUtc = Date.UTC(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  return Math.round((endUtc - startUtc) / DAY_MS) + 1;
}

function tehranHour(now: Date) {
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: HEALTH_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((item) => item.type === "hour")?.value;
  return Number(part ?? 0);
}

function isInCycle(dateKey: string, settings: HealthSettings) {
  return (
    Boolean(settings.bpCycleStartDate) &&
    Boolean(settings.bpCycleEndDate) &&
    dateKey >= settings.bpCycleStartDate &&
    dateKey <= settings.bpCycleEndDate
  );
}

function sessionAverage(session: BloodPressureSession): BpAverage {
  const readings = session.readings.filter(
    (reading): reading is BloodPressureReading => Boolean(reading),
  );
  const pulses = readings.map((reading) => reading.pulseBpm).filter(
    (pulse): pulse is number => typeof pulse === "number",
  );
  return {
    systolic:
      readings.reduce((total, reading) => total + reading.systolic, 0) /
      readings.length,
    diastolic:
      readings.reduce((total, reading) => total + reading.diastolic, 0) /
      readings.length,
    pulseBpm:
      pulses.length > 0
        ? pulses.reduce((total, pulse) => total + pulse, 0) / pulses.length
        : null,
  };
}

function isSevereReading(reading: BloodPressureReading) {
  return reading.systolic >= 180 || reading.diastolic >= 120;
}

function isExtremeGuardrailReading(reading: BloodPressureReading) {
  return (
    reading.systolic < 60 ||
    reading.systolic > 260 ||
    reading.diastolic < 35 ||
    reading.diastolic > 160 ||
    (typeof reading.pulseBpm === "number" &&
      (reading.pulseBpm < 30 || reading.pulseBpm > 220))
  );
}

function hasIndependentEmergencySymptom(
  symptoms: readonly BloodPressureEmergencySymptom[],
) {
  return symptoms.some((symptom) => symptom !== "back-pain");
}

function bpCategory(systolic: number, diastolic: number): BpCategory {
  if (systolic >= 180 || diastolic >= 120) return "severe";
  if (systolic >= 140 || diastolic >= 90) return "stage-2";
  if (systolic >= 130 || diastolic >= 80) return "stage-1";
  if (systolic >= 120 && diastolic < 80) return "elevated";
  return "normal";
}

function categoryLabel(category: BpCategory) {
  switch (category) {
    case "normal":
      return "Normal range";
    case "elevated":
      return "Elevated range";
    case "stage-1":
      return "Stage 1 range";
    case "stage-2":
      return "Stage 2 range";
    case "severe":
      return "Severe range";
  }
}

function categoryClass(category: BpCategory) {
  switch (category) {
    case "normal":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "elevated":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "stage-1":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "stage-2":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "severe":
      return "border-red-300 bg-red-100 text-red-900";
  }
}

function sortByMeasuredAt<T extends { measuredAt: string }>(entries: T[]) {
  return [...entries].sort(
    (left, right) =>
      new Date(left.measuredAt).getTime() - new Date(right.measuredAt).getTime(),
  );
}

function rollingWeightTrend(entries: WeightEntry[]) {
  const sorted = sortByMeasuredAt(entries);
  return sorted.map((entry, index) => {
    const timestamp = new Date(entry.measuredAt).getTime();
    const windowEntries = sorted.filter((candidate) => {
      const candidateTime = new Date(candidate.measuredAt).getTime();
      return candidateTime <= timestamp && candidateTime > timestamp - 7 * DAY_MS;
    });
    const trend =
      windowEntries.reduce((total, candidate) => total + candidate.weightKg, 0) /
      windowEntries.length;
    return {
      id: entry.id,
      entry,
      measuredAt: entry.measuredAt,
      raw: entry.weightKg,
      trend,
      trendMeasurementCount: windowEntries.length,
      differenceFromTrend: entry.weightKg - trend,
      differenceFromPrevious:
        index > 0 ? entry.weightKg - sorted[index - 1].weightKg : null,
    };
  });
}

function recentWeightPace(entries: WeightEntry[]) {
  const sorted = sortByMeasuredAt(entries);
  const latest = sorted.at(-1);
  if (!latest) return null;
  const anchor = new Date(latest.measuredAt).getTime();
  const recent = sorted.filter((entry) => {
    const value = new Date(entry.measuredAt).getTime();
    return value <= anchor && value > anchor - 7 * DAY_MS;
  });
  const previous = sorted.filter((entry) => {
    const value = new Date(entry.measuredAt).getTime();
    return value <= anchor - 7 * DAY_MS && value > anchor - 14 * DAY_MS;
  });
  const distinctDays = (items: WeightEntry[]) =>
    new Set(items.map((entry) => entryCareDayKey(entry))).size;
  if (distinctDays(recent) < 2 || distinctDays(previous) < 2) return null;
  const mean = (items: WeightEntry[]) =>
    items.reduce((total, entry) => total + entry.weightKg, 0) / items.length;
  return mean(previous) - mean(recent);
}

function linePath(
  values: number[],
  xForIndex: (index: number) => number,
  yForValue: (value: number) => number,
) {
  return values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${xForIndex(index).toFixed(2)},${yForValue(
          value,
        ).toFixed(2)}`,
    )
    .join(" ");
}

function formatChartNumber(value: number, digits = 1) {
  const threshold = 0.5 * 10 ** -digits;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  return Number.isInteger(normalized)
    ? normalized.toFixed(0)
    : normalized.toFixed(digits);
}

function nearestSequentialPointIndex(
  event:
    | ReactPointerEvent<SVGRectElement>
    | ReactMouseEvent<SVGRectElement>,
  pointCount: number,
) {
  if (pointCount <= 1) return 0;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width <= 0) return 0;
  const position = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  return Math.round(position * (pointCount - 1));
}

function formatBpInterval(seconds: number | null) {
  if (seconds === null) return null;
  if (seconds < 0) {
    return `${Math.round(Math.abs(seconds))} seconds, with timestamps out of order`;
  }
  if (seconds < 120) return `${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  return `${formatChartNumber(minutes)} minutes`;
}

function bpPairStatusLabel(session: BloodPressureSession) {
  const assessment = assessBloodPressureSession(session);
  if (assessment.pairStatus === "partial") {
    return session.pairingClosedAt
      ? "Single reading kept intentionally"
      : "Single reading — provisional";
  }
  if (assessment.pairStatus === "complete-legacy") {
    return "Legacy two-reading pair — interval not recorded";
  }
  if (assessment.pairStatus === "interval-too-short") {
    return assessment.intervalSeconds !== null && assessment.intervalSeconds < 0
      ? "Two readings — timestamps are out of order"
      : "Two readings — less than 1 minute apart";
  }
  if (assessment.pairStatus === "interval-too-long") {
    return "Two readings — more than 10 minutes apart";
  }
  return "Two readings — 1–10 minute interval";
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-5 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function WeightChart({
  entries,
  goalWeightKg,
}: {
  entries: WeightEntry[];
  goalWeightKg: number;
}) {
  const points = rollingWeightTrend(entries).slice(-90);
  const titleId = useId();
  const descriptionId = useId();
  const detailId = useId();
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const lastPreviewPointId = useRef<string | null>(null);
  if (points.length === 0) {
    return <EmptyChart>Add a weight to begin the trend chart.</EmptyChart>;
  }

  const fallbackPoint = points.at(-1) ?? points[0];
  const selectedPoint =
    points.find((point) => point.id === selectedPointId) ?? fallbackPoint;
  const activePoint =
    points.find((point) => point.id === hoveredPointId) ?? selectedPoint;
  const activeIndex = Math.max(
    0,
    points.findIndex((point) => point.id === activePoint.id),
  );
  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === selectedPoint.id),
  );

  const pinPoint = (index: number) => {
    const point = points[clamp(index, 0, points.length - 1)];
    if (point) setSelectedPointId(point.id);
  };

  const previewNearestPoint = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType === "touch") return;
    const point = points[nearestSequentialPointIndex(event, points.length)];
    if (point) {
      lastPreviewPointId.current = point.id;
      setHoveredPointId(point.id);
    }
  };

  const selectNearestPoint = (event: ReactMouseEvent<SVGRectElement>) => {
    pinPoint(nearestSequentialPointIndex(event, points.length));
  };

  const keepLastPreview = () => {
    if (lastPreviewPointId.current) {
      setSelectedPointId(lastPreviewPointId.current);
    }
    lastPreviewPointId.current = null;
    setHoveredPointId(null);
  };

  const width = 680;
  const height = 240;
  const padding = { left: 48, right: 18, top: 18, bottom: 34 };
  const values = points.flatMap((point) => [point.raw, point.trend]);
  const minimum = Math.floor((Math.min(...values) - 0.8) * 2) / 2;
  const maximum = Math.ceil((Math.max(...values) + 0.8) * 2) / 2;
  const range = Math.max(1, maximum - minimum);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xForIndex = (index: number) =>
    points.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (points.length - 1)) * plotWidth;
  const yForValue = (value: number) =>
    padding.top + ((maximum - value) / range) * plotHeight;
  const rawPath = linePath(
    points.map((point) => point.raw),
    xForIndex,
    yForValue,
  );
  const trendPath = linePath(
    points.map((point) => point.trend),
    xForIndex,
    yForValue,
  );

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white p-2">
      <div className="mb-2 flex flex-wrap gap-4 px-2 text-xs font-medium text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" /> Raw
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-5 rounded-full bg-emerald-600" /> 7-day trend
        </span>
      </div>
      <svg
        className="h-56 w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Weight history and seven-day trend</title>
        <desc id={descriptionId}>
          Raw weight measurements are shown with a smoothed seven-day rolling
          measurement-weighted average. Move across the plot or tap it to inspect the
          nearest measurement in the details below. Horizontal spacing represents log
          order, not equal elapsed time.
        </desc>
        {[0, 0.5, 1].map((fraction) => {
          const value = maximum - fraction * range;
          const y = yForValue(value);
          return (
            <g key={fraction}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth="1"
              />
              <text x="4" y={y + 4} fill="#71717a" fontSize="12">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        <path
          d={rawPath}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line
          x1={xForIndex(activeIndex)}
          x2={xForIndex(activeIndex)}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="#047857"
          strokeDasharray="4 4"
          strokeWidth="1.5"
          aria-hidden="true"
        />
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={xForIndex(index)}
            cy={yForValue(point.raw)}
            r={point.id === activePoint.id ? 5 : 3}
            fill={point.id === activePoint.id ? "#047857" : "#71717a"}
            stroke="white"
            strokeWidth={point.id === activePoint.id ? 2 : 0}
          >
            <title>{`${formatChartNumber(point.raw)} kg — ${formatChartDateTime(point.measuredAt)} Iran time`}</title>
          </circle>
        ))}
        <path
          d={trendPath}
          fill="none"
          stroke="#059669"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          className="cursor-crosshair touch-pan-y"
          onPointerEnter={previewNearestPoint}
          onPointerMove={previewNearestPoint}
          onPointerLeave={keepLastPreview}
          onClick={selectNearestPoint}
          aria-hidden="true"
        />
        <text x={padding.left} y={height - 8} fill="#71717a" fontSize="12">
          {formatShortDate(points[0].measuredAt)}
        </text>
        <text
          x={width - padding.right}
          y={height - 8}
          fill="#71717a"
          fontSize="12"
          textAnchor="end"
        >
          {formatShortDate(points.at(-1)?.measuredAt ?? "")}
        </text>
      </svg>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-2 py-2">
        <button
          type="button"
          className="min-h-11 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
          disabled={activeIndex === 0}
          onClick={() => pinPoint(activeIndex - 1)}
          aria-controls={detailId}
          aria-label="Show previous weight measurement"
        >
          Previous
        </button>
        <p className="text-center text-xs text-zinc-500">
          {activeIndex + 1} of {points.length} · hover or tap the plot
        </p>
        <button
          type="button"
          className="min-h-11 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
          disabled={activeIndex === points.length - 1}
          onClick={() => pinPoint(activeIndex + 1)}
          aria-controls={detailId}
          aria-label="Show next weight measurement"
        >
          Next
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Selected weight measurement {selectedIndex + 1} of {points.length}:{" "}
        {formatChartNumber(selectedPoint.raw)} kilograms, recorded{" "}
        {formatChartDateTime(selectedPoint.measuredAt)} Iran time.
      </p>
      <div id={detailId} className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-950">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              {formatChartNumber(activePoint.raw)} kg
            </p>
            <p className="text-xs text-emerald-800">
              {formatChartDateTime(activePoint.measuredAt)} Iran time · Care Day{" "}
              {entryCareDayKey(activePoint.entry)}
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {activePoint.raw === goalWeightKg
              ? "At goal"
              : `${formatChartNumber(Math.abs(activePoint.raw - goalWeightKg))} kg ${
                  activePoint.raw > goalWeightKg ? "above" : "below"
                } goal`}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-md bg-white p-2.5">
            <p className="text-xs text-zinc-500">7-day rolling mean</p>
            <p className="font-semibold text-zinc-900">
              {formatChartNumber(activePoint.trend)} kg
            </p>
          </div>
          <div className="rounded-md bg-white p-2.5">
            <p className="text-xs text-zinc-500">Vs. rolling mean</p>
            <p className="font-semibold text-zinc-900">
              {activePoint.differenceFromTrend > 0 ? "+" : ""}
              {formatChartNumber(activePoint.differenceFromTrend)} kg
            </p>
          </div>
          <div className="col-span-2 rounded-md bg-white p-2.5 sm:col-span-1">
            <p className="text-xs text-zinc-500">Vs. previous log</p>
            <p className="font-semibold text-zinc-900">
              {activePoint.differenceFromPrevious === null
                ? "First log"
                : `${activePoint.differenceFromPrevious > 0 ? "+" : ""}${formatChartNumber(
                    activePoint.differenceFromPrevious,
                  )} kg`}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-emerald-800">
          Rolling mean uses {activePoint.trendMeasurementCount} logged measurement
          {activePoint.trendMeasurementCount === 1 ? "" : "s"} from the preceding 7×24
          hours; it is not a mean of seven daily averages.
        </p>
        {activePoint.entry.notes ? (
          <p className="mt-2 break-words rounded-md border border-emerald-200 bg-white p-2.5 text-zinc-700">
            <strong>Note:</strong> {activePoint.entry.notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BloodPressureChart({
  sessions,
  targetSystolic,
  targetDiastolic,
}: {
  sessions: BloodPressureSession[];
  targetSystolic: number;
  targetDiastolic: number;
}) {
  const points = sortByMeasuredAt(sessions)
    .slice(-42)
    .map((session) => {
      const average = sessionAverage(session);
      const assessment = assessBloodPressureSession(session, {
        targetSystolic,
        targetDiastolic,
      });
      return {
        id: session.id,
        session,
        measuredAt: session.measuredAt,
        average,
        assessment,
        category: bpCategory(average.systolic, average.diastolic),
        pulseRecordedCount: session.readings.filter(
          (reading) => typeof reading?.pulseBpm === "number",
        ).length,
      };
    });
  const titleId = useId();
  const descriptionId = useId();
  const pulseTitleId = useId();
  const pulseDescriptionId = useId();
  const detailId = useId();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const lastPreviewSessionId = useRef<string | null>(null);
  if (points.length === 0) {
    return <EmptyChart>Add a session to begin the blood pressure chart.</EmptyChart>;
  }

  const fallbackPoint = points.at(-1) ?? points[0];
  const selectedPoint =
    points.find((point) => point.id === selectedSessionId) ?? fallbackPoint;
  const activePoint =
    points.find((point) => point.id === hoveredSessionId) ?? selectedPoint;
  const activeIndex = Math.max(
    0,
    points.findIndex((point) => point.id === activePoint.id),
  );
  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === selectedPoint.id),
  );

  const pinPoint = (index: number) => {
    const point = points[clamp(index, 0, points.length - 1)];
    if (point) setSelectedSessionId(point.id);
  };

  const previewNearestPoint = (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.pointerType === "touch") return;
    const point = points[nearestSequentialPointIndex(event, points.length)];
    if (point) {
      lastPreviewSessionId.current = point.id;
      setHoveredSessionId(point.id);
    }
  };

  const selectNearestPoint = (event: ReactMouseEvent<SVGRectElement>) => {
    pinPoint(nearestSequentialPointIndex(event, points.length));
  };

  const keepLastPreview = () => {
    if (lastPreviewSessionId.current) {
      setSelectedSessionId(lastPreviewSessionId.current);
    }
    lastPreviewSessionId.current = null;
    setHoveredSessionId(null);
  };

  const width = 680;
  const height = 240;
  const padding = { left: 44, right: 18, top: 18, bottom: 34 };
  const allValues = points.flatMap((point) => [
    point.average.systolic,
    point.average.diastolic,
  ]);
  const minimum = Math.max(20, Math.floor((Math.min(...allValues) - 10) / 10) * 10);
  const maximum = Math.max(
    150,
    Math.ceil((Math.max(...allValues) + 10) / 10) * 10,
  );
  const range = Math.max(20, maximum - minimum);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xForIndex = (index: number) =>
    points.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (points.length - 1)) * plotWidth;
  const yForValue = (value: number) =>
    padding.top + ((maximum - value) / range) * plotHeight;
  const pulsePoints = points.flatMap((point, pointIndex) =>
    typeof point.average.pulseBpm === "number"
      ? [
          {
            id: point.id,
            measuredAt: point.measuredAt,
            pointIndex,
            pulseBpm: point.average.pulseBpm,
          },
        ]
      : [],
  );
  const pulseValues = pulsePoints.map((point) => point.pulseBpm);
  const pulseMinimum =
    pulseValues.length > 0
      ? Math.max(20, Math.floor((Math.min(...pulseValues) - 5) / 10) * 10)
      : 40;
  const pulseMaximum =
    pulseValues.length > 0
      ? Math.max(
          pulseMinimum + 20,
          Math.ceil((Math.max(...pulseValues) + 5) / 10) * 10,
        )
      : 120;
  const pulseRange = pulseMaximum - pulseMinimum;
  const pulseHeight = 170;
  const pulsePlotHeight = pulseHeight - padding.top - padding.bottom;
  const pulseYForValue = (value: number) =>
    padding.top + ((pulseMaximum - value) / pulseRange) * pulsePlotHeight;
  const pulsePath = points
    .map((point, index) => {
      if (typeof point.average.pulseBpm !== "number") {
        return "";
      }
      const previousPoint = points[index - 1];
      const command =
        previousPoint && typeof previousPoint.average.pulseBpm === "number"
          ? "L"
          : "M";
      return `${command}${xForIndex(index).toFixed(2)},${pulseYForValue(
        point.average.pulseBpm,
      ).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
  const activeAverage = activePoint.average;
  const activeSession = activePoint.session;
  const activeAssessment = activePoint.assessment;
  const intervalLabel = formatBpInterval(activeAssessment.intervalSeconds);
  const contextLabels = activeSession.contextFlags.map(
    (flag) => BP_CONTEXT_LABELS[flag],
  );
  const symptomLabels = activeSession.symptoms.map(
    (symptom) => BP_SYMPTOM_LABELS[symptom],
  );
  const emergencyLabels = activeSession.emergencySymptoms.map(
    (symptom) =>
      EMERGENCY_SYMPTOMS.find((candidate) => candidate.id === symptom)?.label ??
      symptom,
  );

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white p-2">
      <div className="mb-2 flex flex-wrap gap-4 px-2 text-xs font-medium text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-5 rounded-full bg-rose-600" /> Systolic average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-5 rounded-full bg-sky-600" /> Diastolic average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-orange-400" />
          Systolic threshold: {targetSystolic}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-sky-400" />
          Diastolic threshold: {targetDiastolic}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-zinc-500 bg-white" />
          Provisional or non-protocol point
        </span>
      </div>
      <p className="px-2 text-xs leading-5 text-zinc-500">
        Showing {points.length === 42 && sessions.length > 42 ? "the latest " : ""}
        {points.length} sequential session{points.length === 1 ? "" : "s"}. Hover on
        desktop or tap on mobile; exact Iran time is shown below.
      </p>
      <svg
        className="h-56 w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Blood pressure session averages</title>
        <desc id={descriptionId}>
          Systolic and diastolic values from each session. Two-reading sessions use
          their average; a single-reading session remains a provisional point. Dashed
          lines mark the configured systolic and diastolic home thresholds. Horizontal
          spacing represents session order, not equal elapsed time.
        </desc>
        {[minimum, minimum + range / 2, maximum].map((value) => {
          const y = yForValue(value);
          return (
            <g key={value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e4e4e7"
              />
              <text x="3" y={y + 4} fill="#71717a" fontSize="12">
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        {[
          { value: targetSystolic, color: "#fb923c", key: "systolic-target" },
          { value: targetDiastolic, color: "#38bdf8", key: "diastolic-target" },
        ].map((threshold) =>
          threshold.value >= minimum && threshold.value <= maximum ? (
            <line
              key={threshold.key}
              x1={padding.left}
              x2={width - padding.right}
              y1={yForValue(threshold.value)}
              y2={yForValue(threshold.value)}
              stroke={threshold.color}
              strokeDasharray="5 5"
            />
          ) : null,
        )}
        <path
          d={linePath(
            points.map((point) => point.average.systolic),
            xForIndex,
            yForValue,
          )}
          fill="none"
          stroke="#e11d48"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath(
            points.map((point) => point.average.diastolic),
            xForIndex,
            yForValue,
          )}
          fill="none"
          stroke="#0284c7"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={xForIndex(activeIndex)}
          x2={xForIndex(activeIndex)}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="#52525b"
          strokeDasharray="4 4"
          strokeWidth="1.5"
          aria-hidden="true"
        />
        {points.map((point, index) => (
          <g key={point.id}>
            <circle
              cx={xForIndex(index)}
              cy={yForValue(point.average.systolic)}
              r={point.id === activePoint.id ? 5 : 3.5}
              fill={point.assessment.trendEligible ? "#be123c" : "white"}
              stroke="#be123c"
              strokeWidth={point.assessment.trendEligible ? 1 : 2}
            >
              <title>{`${formatChartNumber(point.average.systolic)}/${formatChartNumber(
                point.average.diastolic,
              )} average — ${formatChartDateTime(point.measuredAt)} Iran time`}</title>
            </circle>
            <circle
              cx={xForIndex(index)}
              cy={yForValue(point.average.diastolic)}
              r={point.id === activePoint.id ? 5 : 3.5}
              fill={point.assessment.trendEligible ? "#0369a1" : "white"}
              stroke="#0369a1"
              strokeWidth={point.assessment.trendEligible ? 1 : 2}
            >
              <title>{`${formatChartNumber(point.average.systolic)}/${formatChartNumber(
                point.average.diastolic,
              )} average — ${formatChartDateTime(point.measuredAt)} Iran time`}</title>
            </circle>
          </g>
        ))}
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          className="cursor-crosshair touch-pan-y"
          onPointerEnter={previewNearestPoint}
          onPointerMove={previewNearestPoint}
          onPointerLeave={keepLastPreview}
          onClick={selectNearestPoint}
          aria-hidden="true"
        />
        <text x={padding.left} y={height - 8} fill="#71717a" fontSize="12">
          {formatShortDate(points[0].measuredAt)}
        </text>
        <text
          x={width - padding.right}
          y={height - 8}
          fill="#71717a"
          fontSize="12"
          textAnchor="end"
        >
          {formatShortDate(points.at(-1)?.measuredAt ?? "")}
        </text>
      </svg>
      <div className="mx-2 mb-2 grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm sm:grid-cols-[1fr_auto]">
        <div>
          <p className="font-semibold text-zinc-950">
            {formatChartNumber(activeAverage.systolic)}/
            {formatChartNumber(activeAverage.diastolic)} average ·{" "}
            {activeAverage.pulseBpm === null
              ? "pulse not recorded"
              : `${formatChartNumber(activeAverage.pulseBpm)} bpm pulse`}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            {formatChartDateTime(activeSession.measuredAt)} Iran time · Care Day{" "}
            {entryCareDayKey(activeSession)}
          </p>
        </div>
        <p className="text-xs leading-5 text-zinc-600 sm:text-right">
          {activeSession.readings
            .map(
              (reading, index) =>
                `R${index + 1} ${reading.systolic}/${reading.diastolic}${
                  typeof reading.pulseBpm === "number"
                    ? ` · ${reading.pulseBpm} bpm`
                    : " · pulse —"
                }`,
            )
            .join("  |  ")}
        </p>
      </div>
      {pulsePoints.length > 0 ? (
        <div className="mt-2 border-t border-zinc-100 pt-2">
          <div className="px-2 text-xs font-medium text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-5 rounded-full bg-violet-600" /> Pulse average
              (bpm)
            </span>
          </div>
          <svg
            className="h-36 w-full"
            viewBox={`0 0 ${width} ${pulseHeight}`}
            role="img"
            aria-labelledby={`${pulseTitleId} ${pulseDescriptionId}`}
          >
            <title id={pulseTitleId}>Pulse averages by blood pressure session</title>
            <desc id={pulseDescriptionId}>
              Average pulse in beats per minute for each blood pressure session that
              includes pulse. Legacy sessions without pulse remain gaps. Pulse is the
              device reading during blood pressure measurement, not necessarily a
              resting heart rate.
            </desc>
            {[pulseMinimum, pulseMinimum + pulseRange / 2, pulseMaximum].map(
              (value) => {
                const y = pulseYForValue(value);
                return (
                  <g key={value}>
                    <line
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={y}
                      y2={y}
                      stroke="#e4e4e7"
                    />
                    <text x="3" y={y + 4} fill="#71717a" fontSize="12">
                      {Math.round(value)}
                    </text>
                  </g>
                );
              },
            )}
            <path
              d={pulsePath}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1={xForIndex(activeIndex)}
              x2={xForIndex(activeIndex)}
              y1={padding.top}
              y2={pulseHeight - padding.bottom}
              stroke="#52525b"
              strokeDasharray="4 4"
              strokeWidth="1.5"
              aria-hidden="true"
            />
            {pulsePoints.map((point) => (
              <circle
                key={point.id}
                cx={xForIndex(point.pointIndex)}
                cy={pulseYForValue(point.pulseBpm)}
                r={point.id === activePoint.id ? 5 : 3.5}
                fill="#6d28d9"
                stroke="white"
                strokeWidth={point.id === activePoint.id ? 2 : 0}
              >
                <title>{`${formatChartNumber(point.pulseBpm)} bpm — ${formatChartDateTime(
                  point.measuredAt,
                )} Iran time`}</title>
              </circle>
            ))}
            <rect
              x={padding.left}
              y={padding.top}
              width={plotWidth}
              height={pulsePlotHeight}
              fill="transparent"
              className="cursor-crosshair touch-pan-y"
              onPointerEnter={previewNearestPoint}
              onPointerMove={previewNearestPoint}
              onPointerLeave={keepLastPreview}
              onClick={selectNearestPoint}
              aria-hidden="true"
            />
            <text x={padding.left} y={pulseHeight - 8} fill="#71717a" fontSize="12">
              {formatShortDate(points[0].measuredAt)}
            </text>
            <text
              x={width - padding.right}
              y={pulseHeight - 8}
              fill="#71717a"
              fontSize="12"
              textAnchor="end"
            >
              {formatShortDate(points.at(-1)?.measuredAt ?? "")}
            </text>
          </svg>
        </div>
      ) : (
        <p className="border-t border-zinc-100 px-2 py-3 text-xs text-zinc-500">
          Pulse trend begins with the next reading that includes pulse; legacy blood
          pressure records remain unchanged.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-2 py-2">
        <button
          type="button"
          className="min-h-11 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
          disabled={activeIndex === 0}
          onClick={() => pinPoint(activeIndex - 1)}
          aria-controls={detailId}
          aria-label="Show previous blood-pressure session"
        >
          Previous
        </button>
        <p className="text-center text-xs text-zinc-500">
          Session {activeIndex + 1} of {points.length}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
          disabled={activeIndex === points.length - 1}
          onClick={() => pinPoint(activeIndex + 1)}
          aria-controls={detailId}
          aria-label="Show next blood-pressure session"
        >
          Next
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Selected blood-pressure session {selectedIndex + 1} of {points.length}:{" "}
        {formatChartNumber(selectedPoint.average.systolic)} over{" "}
        {formatChartNumber(selectedPoint.average.diastolic)} millimeters of mercury,
        {selectedPoint.average.pulseBpm === null
          ? " pulse not recorded,"
          : ` pulse ${formatChartNumber(selectedPoint.average.pulseBpm)} beats per minute,`}{" "}
        recorded {formatChartDateTime(selectedPoint.measuredAt)} Iran time.
      </p>
      <section
        id={detailId}
        className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800"
        aria-label="Selected blood pressure session details"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-zinc-950">
              {formatChartNumber(activeAverage.systolic)}/
              {formatChartNumber(activeAverage.diastolic)} mm Hg average
            </p>
            <p className="text-xs leading-5 text-zinc-500">
              {formatChartDateTime(activeSession.measuredAt)} Iran time · Care Day{" "}
              {entryCareDayKey(activeSession)} · {BP_PERIOD_LABELS[activeSession.period]}
            </p>
          </div>
          <span
            className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${categoryClass(
              activePoint.category,
            )}`}
          >
            {categoryLabel(activePoint.category)} · not a diagnosis
          </span>
        </div>

        {activeAssessment.rawSevere ? (
          <div className="mt-3 rounded-md border border-red-300 bg-red-100 p-2.5 text-sm font-semibold text-red-950">
            At least one raw reading reached the app&apos;s severe-value threshold, even
            if the session average is lower. Review the raw values and recorded
            symptoms below.
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-white p-2.5">
            <p className="text-xs text-zinc-500">Pulse during BP check</p>
            <p className="font-semibold text-zinc-950">
              {activeAverage.pulseBpm === null
                ? "Not recorded"
                : `${formatChartNumber(activeAverage.pulseBpm)} bpm`}
            </p>
            <p className="text-xs text-zinc-500">
              {activePoint.pulseRecordedCount} of {activeSession.readings.length} reading
              {activeSession.readings.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-md bg-white p-2.5">
            <p className="text-xs text-zinc-500">Configured threshold</p>
            <p className="font-semibold text-zinc-950">
              {targetSystolic}/{targetDiastolic} mm Hg
            </p>
          </div>
          <div className="col-span-2 rounded-md bg-white p-2.5">
            <p className="text-xs text-zinc-500">Session quality</p>
            <p className="font-semibold text-zinc-950">
              {bpPairStatusLabel(activeSession)}
            </p>
            <p className="text-xs text-zinc-500">
              {intervalLabel ? `Recorded interval: ${intervalLabel}. ` : ""}
              {activeAssessment.trendEligible
                ? "Included in protocol trend."
                : "Shown on this history chart but excluded from protocol trend."}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {activeSession.readings.map((reading, index) => (
            <div key={index} className="rounded-md border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Reading {index + 1}
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">
                {reading.systolic}/{reading.diastolic} mm Hg
              </p>
              <p className="text-sm text-zinc-700">
                Pulse: {typeof reading.pulseBpm === "number" ? `${reading.pulseBpm} bpm` : "not recorded"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {reading.measuredAt
                  ? `${formatChartDateTime(reading.measuredAt)} Iran time`
                  : "Individual reading time not recorded (legacy data)"}
              </p>
            </div>
          ))}
        </div>

        <details className="mt-3 rounded-md border border-zinc-200 bg-white">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 font-semibold text-zinc-800">
            Measurement conditions, symptoms and note
          </summary>
          <div className="border-t border-zinc-100 p-3">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-zinc-500">Arm</dt><dd className="font-medium">{BP_ARM_LABELS[activeSession.arm]}</dd></div>
              <div><dt className="text-xs text-zinc-500">Position</dt><dd className="font-medium">{BP_POSITION_LABELS[activeSession.position]}</dd></div>
              <div><dt className="text-xs text-zinc-500">Cuff</dt><dd className="font-medium">{BP_CUFF_SITE_LABELS[activeSession.cuffSite]}</dd></div>
              <div><dt className="text-xs text-zinc-500">Medicine timing</dt><dd className="font-medium">{BP_MEDICATION_TIMING_LABELS[activeSession.medicationTiming]}</dd></div>
              <div><dt className="text-xs text-zinc-500">Standard setup</dt><dd className="font-medium">{activeSession.standardConditions === null ? "Not recorded" : activeSession.standardConditions ? "Marked as followed" : "Not marked as followed"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Triggered by symptoms</dt><dd className="font-medium">{activeSession.triggeredBySymptoms ? "Yes" : "No"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Device irregular-heartbeat flag</dt><dd className="font-medium">{activeSession.irregularHeartbeat === null ? "Not recorded" : activeSession.irregularHeartbeat ? "Flag shown by device — not a diagnosis" : "No flag recorded"}</dd></div>
            </dl>
            {contextLabels.length > 0 ? (
              <p className="mt-3"><strong>Recorded context:</strong> {contextLabels.join(", ")}</p>
            ) : null}
            {symptomLabels.length > 0 ? (
              <p className="mt-2"><strong>Symptoms:</strong> {symptomLabels.join(", ")}</p>
            ) : null}
            {emergencyLabels.length > 0 ? (
              <p className="mt-2 text-red-900"><strong>Emergency symptoms recorded:</strong> {emergencyLabels.join(", ")}</p>
            ) : null}
            {activeSession.notes ? (
              <p className="mt-2 break-words"><strong>Note:</strong> {activeSession.notes}</p>
            ) : null}
            {contextLabels.length === 0 &&
            symptomLabels.length === 0 &&
            emergencyLabels.length === 0 &&
            !activeSession.notes ? (
              <p className="mt-3 text-zinc-500">No context flags, symptom selections, or note were recorded.</p>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <p className="mt-0.5 text-sm leading-5 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-100"
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function WeightForm({
  now,
  onAdd,
}: {
  now: Date;
  onAdd: (entry: WeightEntry) => MaybePromise;
}) {
  const [weight, setWeight] = useState("");
  const [measuredAt, setMeasuredAt] = useState(() => toDateTimeLocal(now));
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const parsedWeight = parseNumber(weight);
    const iso = toIsoTimestamp(measuredAt);
    if (parsedWeight === null || parsedWeight < 30 || parsedWeight > 350) {
      setMessage("Enter a weight from 30.0 to 350.0 kg.");
      return;
    }
    if (!iso || isFutureTimestamp(iso, now)) {
      setMessage("Choose a valid time that is not in the future.");
      return;
    }
    const savedAt = new Date().toISOString();
    setSaving(true);
    try {
      await onAdd({
        id: makeId("weight"),
        weightKg: Math.round(parsedWeight * 10) / 10,
        measuredAt: iso,
        notes: notes.trim() || undefined,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      setWeight("");
      setNotes("");
      setMeasuredAt(toDateTimeLocal(now));
      setMessage("Weight saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="weight-entry" onSubmit={submit} className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4">
      <h3 className="font-semibold text-zinc-950">Quick weight entry</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Best comparison: first thing in the morning, after using the bathroom and
        before food or drink, on the same scale.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL_CLASS}>Weight (kg)</span>
          <input
            className={INPUT_CLASS}
            type="number"
            inputMode="decimal"
            min="30"
            max="350"
            step="0.1"
            required
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="93.6"
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>Measured at (Iran time)</span>
          <input
            className={INPUT_CLASS}
            type="datetime-local"
            required
            max={toDateTimeLocal(new Date(now.getTime() + 10 * MINUTE_MS))}
            value={measuredAt}
            onChange={(event) => setMeasuredAt(event.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Note (optional)</span>
        <input
          className={INPUT_CLASS}
          maxLength={300}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Sleep, meal, travel, or measurement context"
        />
      </label>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save weight"}
        </button>
        <p
          className={`text-sm ${message === "Weight saved." ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>
    </form>
  );
}

function BloodPressureForm({
  now,
  settings,
  resumeSession,
  onAdd,
}: {
  now: Date;
  settings: HealthSettings;
  resumeSession?: BloodPressureSession;
  onAdd: (session: BloodPressureSession) => MaybePromise;
}) {
  const currentHour = tehranHour(now);
  const defaultPeriod: BloodPressurePeriod =
    currentHour < 5 || currentHour >= 18
      ? "evening"
      : currentHour < 14
        ? "morning"
        : "other";
  const [measuredAt, setMeasuredAt] = useState(() =>
    resumeSession
      ? toDateTimeLocal(new Date(resumeSession.measuredAt))
      : toDateTimeLocal(now),
  );
  const [period, setPeriod] = useState<BloodPressurePeriod>(
    resumeSession?.period ?? defaultPeriod,
  );
  const [firstSystolic, setFirstSystolic] = useState(() =>
    resumeSession ? String(resumeSession.readings[0].systolic) : "",
  );
  const [firstDiastolic, setFirstDiastolic] = useState(() =>
    resumeSession ? String(resumeSession.readings[0].diastolic) : "",
  );
  const [firstPulse, setFirstPulse] = useState(() =>
    typeof resumeSession?.readings[0].pulseBpm === "number"
      ? String(resumeSession.readings[0].pulseBpm)
      : "",
  );
  const [secondSystolic, setSecondSystolic] = useState("");
  const [secondDiastolic, setSecondDiastolic] = useState("");
  const [secondPulse, setSecondPulse] = useState("");
  const [symptoms, setSymptoms] = useState<BloodPressureEmergencySymptom[]>(
    resumeSession?.emergencySymptoms ?? [],
  );
  const [otherSymptoms, setOtherSymptoms] = useState<BloodPressureSymptom[]>(
    resumeSession?.symptoms ?? [],
  );
  const [arm, setArm] = useState<BloodPressureArm>(
    resumeSession?.arm ?? settings.preferredBpArm,
  );
  const [position, setPosition] = useState<BloodPressurePosition>(
    resumeSession?.position ?? "seated",
  );
  const [cuffSite, setCuffSite] = useState<BloodPressureCuffSite>(
    resumeSession?.cuffSite ?? "upper-arm",
  );
  const [medicationTiming, setMedicationTiming] =
    useState<BloodPressureMedicationTiming>(
      resumeSession?.medicationTiming ?? "unknown",
    );
  const [standardConditions, setStandardConditions] = useState<boolean | null>(
    resumeSession?.standardConditions ?? null,
  );
  const [contextFlags, setContextFlags] = useState<BloodPressureContextFlag[]>(
    resumeSession?.contextFlags ?? [],
  );
  const [triggeredBySymptoms, setTriggeredBySymptoms] = useState(
    resumeSession?.triggeredBySymptoms ?? false,
  );
  const [irregularHeartbeat, setIrregularHeartbeat] = useState<boolean | null>(
    resumeSession?.irregularHeartbeat ?? null,
  );
  const [notes, setNotes] = useState(resumeSession?.notes ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedPartial, setSavedPartial] = useState<BloodPressureSession | null>(
    resumeSession ?? null,
  );
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    if (!savedPartial) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [savedPartial]);

  const firstReadingTimestamp = savedPartial?.readings[0].measuredAt
    ? new Date(savedPartial.readings[0].measuredAt).getTime()
    : Number.NaN;
  const elapsedSeconds = Number.isFinite(firstReadingTimestamp)
    ? Math.max(0, Math.floor((clockNow - firstReadingTimestamp) / 1000))
    : 60;
  const secondReady = elapsedSeconds >= 60;
  const pairWindowExpired = elapsedSeconds > 10 * 60;

  const draftReadings = useMemo(() => {
    const firstSys = parseNumber(firstSystolic);
    const firstDia = parseNumber(firstDiastolic);
    const firstPulseValue = parseNumber(firstPulse);
    const secondSys = parseNumber(secondSystolic);
    const secondDia = parseNumber(secondDiastolic);
    const secondPulseValue = parseNumber(secondPulse);
    if (firstSys === null || firstDia === null) return null;
    const readings: BloodPressureReading[] = [
      {
        systolic: firstSys,
        diastolic: firstDia,
        ...(firstPulseValue === null ? {} : { pulseBpm: firstPulseValue }),
      },
    ];
    if (secondSys !== null && secondDia !== null) {
      readings.push({
        systolic: secondSys,
        diastolic: secondDia,
        ...(secondPulseValue === null ? {} : { pulseBpm: secondPulseValue }),
      });
    }
    return readings;
  }, [
    firstDiastolic,
    firstPulse,
    firstSystolic,
    secondDiastolic,
    secondPulse,
    secondSystolic,
  ]);

  const anyDraftSevere = draftReadings?.some(isSevereReading) ?? false;
  const persistentDraftSevere =
    draftReadings?.length === 2 && draftReadings.every(isSevereReading);
  const anyDraftExtreme = draftReadings?.some(isExtremeGuardrailReading) ?? false;
  const independentEmergencySelected = hasIndependentEmergencySymptom(symptoms);
  const severeWithBackPain = anyDraftSevere && symptoms.includes("back-pain");
  const liveEmergency = independentEmergencySelected || severeWithBackPain;

  function readingFromFields(
    systolicValue: string,
    diastolicValue: string,
    pulseValue: string,
  ): NewBloodPressureReading | null {
    const systolic = parseNumber(systolicValue);
    const diastolic = parseNumber(diastolicValue);
    const pulse = parseNumber(pulseValue);
    if (systolic === null || diastolic === null || pulse === null) return null;
    return normalizeNewBloodPressureReading({
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
      pulseBpm: Math.round(pulse),
    });
  }

  function buildSession(
    readings: BloodPressureReading[],
    iso: string,
    savedAt: string,
  ): BloodPressureSession {
    return {
      id: savedPartial?.id ?? makeId("bp"),
      measuredAt: savedPartial?.measuredAt ?? iso,
      careDayKey: careDayKeyForInstant(savedPartial?.measuredAt ?? iso),
      period,
      readings: readings as BloodPressureSession["readings"],
      arm,
      position,
      cuffSite,
      medicationTiming,
      standardConditions,
      contextFlags,
      symptoms: otherSymptoms,
      emergencySymptoms: symptoms,
      triggeredBySymptoms,
      irregularHeartbeat,
      notes: notes.trim() || undefined,
      createdAt: savedPartial?.createdAt ?? savedAt,
      updatedAt: savedAt,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const first = readingFromFields(firstSystolic, firstDiastolic, firstPulse);
    const iso = toIsoTimestamp(measuredAt);
    if (!first) {
      setMessage(
        "Enter systolic 50–280, diastolic 30–180, and pulse 25–240 for this reading. Pulse is required. Systolic must be higher than diastolic. If the device genuinely shows a value outside this guardrail or you feel very unwell, repeat promptly and seek urgent medical help rather than dismissing it as a form error.",
      );
      return;
    }
    if (!iso || isFutureTimestamp(iso, now)) {
      setMessage("Choose a valid session time that is not in the future.");
      return;
    }
    const savedAt = new Date().toISOString();
    const readingAt =
      Math.abs(new Date(iso).getTime() - now.getTime()) <= 15 * MINUTE_MS
        ? savedAt
        : iso;
    const session = buildSession([{ ...first, measuredAt: readingAt }], iso, savedAt);
    setSaving(true);
    try {
      await onAdd(session);
      setSavedPartial(session);
      setClockNow(Date.now());
      setMessage(
        isSevereReading(first)
          ? "Reading 1 saved. It is severe-range: stay seated, wait at least one minute, and repeat."
          : "Reading 1 saved. Stay seated and quiet for one minute.",
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveSecond() {
    if (!savedPartial || !secondReady) return;
    const second = readingFromFields(secondSystolic, secondDiastolic, secondPulse);
    if (!second) {
      setMessage("Enter a valid second systolic, diastolic, and pulse. Pulse is required.");
      return;
    }
    const savedAt = new Date().toISOString();
    const session = buildSession(
      [savedPartial.readings[0], { ...second, measuredAt: savedAt }],
      savedPartial.measuredAt,
      savedAt,
    );
    setSaving(true);
    try {
      await onAdd(session);
      setSavedPartial(session);
      const interval = new Date(savedAt).getTime() - firstReadingTimestamp;
      setMessage(
        interval <= 10 * MINUTE_MS
          ? "Two-reading session saved."
          : "Reading 2 saved, but the gap was over 10 minutes; the app will not treat these as one protocol pair.",
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  function toggleSymptom(symptom: BloodPressureEmergencySymptom) {
    setSymptoms((current) =>
      current.includes(symptom)
        ? current.filter((item) => item !== symptom)
        : [...current, symptom],
    );
  }

  function toggleOtherSymptom(symptom: BloodPressureSymptom) {
    setOtherSymptoms((current) =>
      current.includes(symptom)
        ? current.filter((item) => item !== symptom)
        : [...current, symptom],
    );
  }

  function toggleContext(flag: BloodPressureContextFlag) {
    if (BP_STANDARD_SETUP_EXCEPTION_FLAGS.has(flag)) {
      setStandardConditions(false);
    }
    setContextFlags((current) =>
      current.includes(flag)
        ? current.filter((item) => item !== flag)
        : [...current, flag],
    );
  }

  async function keepSingleReading() {
    if (!savedPartial) return;
    const updatedAt = new Date().toISOString();
    const updatedPartial = buildSession(
      [savedPartial.readings[0]],
      savedPartial.measuredAt,
      updatedAt,
    );
    updatedPartial.pairingClosedAt = updatedAt;
    setSaving(true);
    try {
      await onAdd(updatedPartial);
      setSavedPartial(null);
      setFirstSystolic("");
      setFirstDiastolic("");
      setFirstPulse("");
      setSecondSystolic("");
      setSecondDiastolic("");
      setSecondPulse("");
      setMeasuredAt(toDateTimeLocal(now));
      setMessage(
        "Single reading and its details were kept. The form is ready for a separate session.",
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="bp-entry" onSubmit={submit} className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4">
      <h3 className="font-semibold text-zinc-950">Guided blood pressure session</h3>
      <div className="mt-1 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
        For 30 minutes beforehand, avoid caffeine, alcohol, smoking, and exercise.
        Empty your bladder, then sit quietly for at least 5 minutes with back supported,
        feet flat, and legs uncrossed. Use a validated upper-arm cuff that fits your arm
        on bare skin; support the arm at heart level and do not talk. Enter the pulse
        shown by the monitor with every new reading. Save reading 1, stay seated, then
        take reading 2 on the same arm after the one-minute timer. Never delay or skip
        medicine just to measure first.
      </div>
      <details className="mt-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs leading-5 text-zinc-700">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-zinc-800">
          Which arm? Is repeating safe?
        </summary>
        <p className="mt-2">
          Routine pairs use the same arm. Compare both arms only as a separate initial
          check: if systolic differs by more than 15 mm Hg, repeat the comparison and
          then use the consistently higher arm. One-minute repeat inflation is the
          standard home protocol for most adults. Stop for marked pain, numbness, or
          unusual bruising; never use an arm with a dialysis fistula, and ask your
          clinician which arm to use after lymph-node surgery, lymphoedema, or injury.
        </p>
      </details>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL_CLASS}>Session time (Iran time)</span>
          <input
            className={INPUT_CLASS}
            type="datetime-local"
            required
            max={toDateTimeLocal(new Date(now.getTime() + 10 * MINUTE_MS))}
            value={measuredAt}
            disabled={Boolean(savedPartial)}
            onChange={(event) => setMeasuredAt(event.target.value)}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>Period</span>
          <select
            className={INPUT_CLASS}
            value={period}
            disabled={Boolean(savedPartial)}
            onChange={(event) => setPeriod(event.target.value as BloodPressurePeriod)}
          >
            <option value="morning">After waking / first Care Day session</option>
            <option value="evening">Evening, before sleep</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span className={LABEL_CLASS}>Arm for both readings</span>
          <select
            className={INPUT_CLASS}
            value={arm}
            disabled={Boolean(savedPartial)}
            onChange={(event) => setArm(event.target.value as BloodPressureArm)}
          >
            <option value="unknown">Not selected</option>
            <option value="left">Left arm</option>
            <option value="right">Right arm</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <fieldset className="rounded-md border border-zinc-200 bg-white p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">Reading 1</legend>
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-xs text-zinc-500">Systolic</span>
              <input
                aria-label="First systolic reading"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="50"
                max="280"
                required
                disabled={Boolean(savedPartial)}
                value={firstSystolic}
                onChange={(event) => setFirstSystolic(event.target.value)}
                placeholder="120"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-zinc-500">Diastolic</span>
              <input
                aria-label="First diastolic reading"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="30"
                max="180"
                required
                disabled={Boolean(savedPartial)}
                value={firstDiastolic}
                onChange={(event) => setFirstDiastolic(event.target.value)}
                placeholder="80"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-zinc-500">
                Pulse <span aria-hidden="true">*</span>
              </span>
              <input
                aria-label="First pulse reading, required"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="25"
                max="240"
                required
                value={firstPulse}
                disabled={Boolean(savedPartial)}
                onChange={(event) => setFirstPulse(event.target.value)}
                placeholder="72"
              />
            </label>
          </div>
          {savedPartial && firstPulse === "" ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              This legacy reading did not include pulse. It remains saved; pulse is
              required for every new reading.
            </p>
          ) : null}
        </fieldset>
        <fieldset className="rounded-md border border-zinc-200 bg-white p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">
            Reading 2 — same arm, after ≥1 minute
          </legend>
          {savedPartial ? (
            <p
              className={`mb-2 rounded px-2 py-1 text-xs font-semibold ${
                secondReady
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-800"
              }`}
              aria-live="polite"
            >
              {pairWindowExpired
                ? "The 10-minute pairing window passed. This reading remains saved; start a fresh session for a protocol pair."
                : secondReady
                ? "Ready for reading 2. Stay seated and use the same arm."
                : `${60 - elapsedSeconds}s remaining — stay seated, quiet, and still.`}
            </p>
          ) : (
            <p className="mb-2 text-xs text-zinc-500">
              Save reading 1 first; it is kept even if you cannot finish the pair.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-xs text-zinc-500">Systolic</span>
              <input
                aria-label="Second systolic reading"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="50"
                max="280"
                disabled={!savedPartial || !secondReady || pairWindowExpired}
                value={secondSystolic}
                onChange={(event) => setSecondSystolic(event.target.value)}
                placeholder="118"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-zinc-500">Diastolic</span>
              <input
                aria-label="Second diastolic reading"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="30"
                max="180"
                disabled={!savedPartial || !secondReady || pairWindowExpired}
                value={secondDiastolic}
                onChange={(event) => setSecondDiastolic(event.target.value)}
                placeholder="78"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs text-zinc-500">
                Pulse <span aria-hidden="true">*</span>
              </span>
              <input
                aria-label="Second pulse reading, required"
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="25"
                max="240"
                required
                value={secondPulse}
                disabled={!savedPartial || !secondReady || pairWindowExpired}
                onChange={(event) => setSecondPulse(event.target.value)}
                placeholder="72"
              />
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        {!savedPartial ? (
          <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save reading 1 & start 60s"}
          </button>
        ) : (
          <>
            <button
              className={PRIMARY_BUTTON_CLASS}
              type="button"
              disabled={saving || !secondReady || pairWindowExpired}
              onClick={() => void saveSecond()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {saving
                ? "Saving…"
                : pairWindowExpired
                  ? "Pair window expired"
                  : secondReady
                    ? "Save reading 2 & complete"
                    : `Wait ${60 - elapsedSeconds}s`}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
              onClick={() => void keepSingleReading()}
            >
              Keep one & start new later
            </button>
          </>
        )}
        <p
          className={`text-sm ${
            message.includes("saved") || message.includes("kept")
              ? "text-emerald-700"
              : "text-rose-700"
          }`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>

      {liveEmergency ? (
        <div
          role="alert"
          className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm font-medium leading-6 text-red-950"
        >
          {independentEmergencySelected ? (
            <>
              Chest pain, severe or unexplained shortness of breath, or a sudden stroke
              warning sign requires emergency care regardless of the blood pressure
              number. Call your local emergency service now; do not finish data entry.
            </>
          ) : (
            <>
              A severe-range reading and back pain are selected. Call your local
              emergency service now. This app does not interpret back pain by itself.
            </>
          )}
        </div>
      ) : anyDraftSevere ? (
        <div
          role="alert"
          className="mt-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm font-medium leading-6 text-red-950"
        >
          {persistentDraftSevere ? (
            <>
              Both readings remain at least 180 systolic or 120 diastolic. Contact your
              health care professional immediately. If an emergency symptom appears,
              call your local emergency service now.
            </>
          ) : (
            <>
              One reading is at least 180 systolic or 120 diastolic. Rest at least one
              minute and repeat carefully. If a repeat remains this high, contact your
              health care professional immediately.
            </>
          )}
        </div>
      ) : anyDraftExtreme ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <strong>Extreme-value check:</strong> this entry is outside the app&apos;s usual
          data-quality guardrail. Recheck the digits, cuff fit and placement, posture,
          and repeat after resting. Do not change a genuine reading merely to clear this
          flag; seek clinical advice if the value is confirmed or you feel unwell.
        </div>
      ) : null}

      <fieldset className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
        <legend className="px-1 text-sm font-semibold text-zinc-800">
          Symptoms present now
        </legend>
        <p className="mb-2 text-xs leading-5 text-zinc-500">
          Chest pain, severe or unexplained shortness of breath, and sudden stroke signs
          need emergency care regardless of BP. Back pain with a severe BP reading is
          also an emergency warning; this app does not interpret back pain alone.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EMERGENCY_SYMPTOMS.map((symptom) => (
            <label
              key={symptom.id}
              className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-rose-600"
                checked={symptoms.includes(symptom.id)}
                onChange={() => toggleSymptom(symptom.id)}
              />
              {symptom.label}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-zinc-800">
          Measurement details (optional but useful)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className={LABEL_CLASS}>Body position</span>
            <select
              className={INPUT_CLASS}
              value={position}
              onChange={(event) =>
                setPosition(event.target.value as BloodPressurePosition)
              }
            >
              <option value="seated">Seated (routine)</option>
              <option value="standing">Standing (separate orthostatic check)</option>
              <option value="lying">Lying</option>
              <option value="unknown">Not recorded</option>
            </select>
          </label>
          <label>
            <span className={LABEL_CLASS}>Blood-pressure medicine</span>
            <select
              className={INPUT_CLASS}
              value={medicationTiming}
              onChange={(event) =>
                setMedicationTiming(
                  event.target.value as BloodPressureMedicationTiming,
                )
              }
            >
              <option value="unknown">Not recorded</option>
              <option value="before-dose">Before today&apos;s dose</option>
              <option value="after-dose">After today&apos;s dose</option>
            </select>
          </label>
          <label>
            <span className={LABEL_CLASS}>Cuff / device site</span>
            <select
              className={INPUT_CLASS}
              value={cuffSite}
              onChange={(event) =>
                setCuffSite(event.target.value as BloodPressureCuffSite)
              }
            >
              <option value="upper-arm">Validated upper-arm cuff (preferred)</option>
              <option value="wrist">Wrist device</option>
              <option value="other">Other device</option>
              <option value="unknown">Not recorded</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={standardConditions === true}
              onChange={(event) => {
                setStandardConditions(event.target.checked);
                if (event.target.checked) {
                  setContextFlags((current) =>
                    current.filter(
                      (flag) => !BP_STANDARD_SETUP_EXCEPTION_FLAGS.has(flag),
                    ),
                  );
                }
              }}
            />
            Full standard protocol followed (pre-check preparation, empty bladder,
            5-min rest, bare arm, supported, quiet)
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={triggeredBySymptoms}
              onChange={(event) => setTriggeredBySymptoms(event.target.checked)}
            />
            Measured because of symptoms
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={irregularHeartbeat === true}
              onChange={(event) => setIrregularHeartbeat(event.target.checked)}
            />
            Device showed irregular heartbeat
          </label>
        </div>
        {BP_CONTEXT_GROUPS.map((group) => (
          <div key={group.label} className="mt-3">
            <p className="text-xs font-semibold text-zinc-600">{group.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.options.map(([id, label]) => (
                <label
                  key={id}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={contextFlags.includes(id)}
                    onChange={() => toggleContext(id)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Emotional and physical context can coexist with a correctly performed
          measurement. Chest pain still belongs in the emergency symptoms above.
        </p>
        <p className="mt-3 text-xs font-semibold text-zinc-600">Non-emergency symptoms</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["dizziness", "Dizziness"],
              ["fainting", "Fainting"],
              ["nausea", "Nausea"],
              ["confusion", "Confusion"],
              ["blurred-vision", "Blurred vision"],
              ["palpitations", "Palpitations"],
            ] as const
          ).map(([id, label]) => (
            <label
              key={id}
              className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={otherSymptoms.includes(id)}
                onChange={() => toggleOtherSymptom(id)}
              />
              {label}
            </label>
          ))}
        </div>
      </details>

      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Context (optional)</span>
        <input
          className={INPUT_CLASS}
          maxLength={300}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Stress, conflict, pain, illness, sleep, medication, or other detail"
        />
      </label>
    </form>
  );
}

function DietForm({
  now,
  onAdd,
}: {
  now: Date;
  onAdd: (checkIn: DietCheckIn) => MaybePromise;
}) {
  const [measuredAt, setMeasuredAt] = useState(() => toDateTimeLocal(now));
  const [adherence, setAdherence] = useState<DietAdherence>("on-plan");
  const [sodiumAware, setSodiumAware] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const iso = toIsoTimestamp(measuredAt);
    if (!iso || isFutureTimestamp(iso, now)) {
      setMessage("Choose a valid check-in time that is not in the future.");
      return;
    }
    const savedAt = new Date().toISOString();
    setSaving(true);
    try {
      await onAdd({
        id: makeId("diet"),
        measuredAt: iso,
        adherence,
        sodiumAware,
        notes: notes.trim() || undefined,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      setNotes("");
      setMeasuredAt(toDateTimeLocal(now));
      setMessage("Diet check-in saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="diet-entry" onSubmit={submit} className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4">
      <h3 className="font-semibold text-zinc-950">Daily adherence check-in</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        This records consistency without prescribing calories. A partial day is useful
        data, not failure.
      </p>
      <fieldset className="mt-3">
        <legend className={LABEL_CLASS}>How closely did you follow your plan?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["on-plan", "On plan"],
              ["mostly-on-plan", "Mostly on plan"],
              ["off-plan", "Off plan"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold transition ${
                adherence === value
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-200"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="diet-adherence"
                value={value}
                checked={adherence === value}
                onChange={() => setAdherence(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL_CLASS}>Check-in time (Iran time)</span>
          <input
            className={INPUT_CLASS}
            type="datetime-local"
            required
            max={toDateTimeLocal(new Date(now.getTime() + 10 * MINUTE_MS))}
            value={measuredAt}
            onChange={(event) => setMeasuredAt(event.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 self-end rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            checked={sodiumAware}
            onChange={(event) => setSodiumAware(event.target.checked)}
          />
          I paid attention to sodium today
        </label>
      </div>
      <label className="mt-3 block">
        <span className={LABEL_CLASS}>What helped or got in the way? (optional)</span>
        <textarea
          className={`${INPUT_CLASS} min-h-20 resize-y`}
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Meals, hunger, sleep, stress, wins, or obstacles"
        />
      </label>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save check-in"}
        </button>
        <p
          className={`text-sm ${
            message === "Diet check-in saved." ? "text-emerald-700" : "text-rose-700"
          }`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>
    </form>
  );
}

function WaistForm({
  now,
  onAdd,
}: {
  now: Date;
  onAdd: (entry: WaistEntry) => MaybePromise;
}) {
  const [value, setValue] = useState("");
  const [measuredAt, setMeasuredAt] = useState(() => toDateTimeLocal(now));
  const [method, setMethod] = useState<WaistMeasurementMethod>("midpoint");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const waist = parseNumber(value);
    const iso = toIsoTimestamp(measuredAt);
    if (
      waist === null ||
      waist < 30 ||
      waist > 250 ||
      !iso ||
      isFutureTimestamp(iso, now)
    ) {
      setMessage("Enter a valid waist measurement from 30–250 cm and time.");
      return;
    }
    const savedAt = new Date().toISOString();
    setSaving(true);
    try {
      await onAdd({
        id: makeId("waist"),
        waistCircumferenceCm: waist,
        measuredAt: iso,
        measuredAtPrecision: "instant",
        careDayKey: careDayKeyForInstant(iso),
        measurementMethod: method,
        notes: notes.trim() || undefined,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      setValue("");
      setNotes("");
      setMessage("Waist measurement saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="waist-entry" onSubmit={submit} className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4">
      <h3 className="font-semibold text-zinc-950">Waist measurement</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-600">
        The configured low-noise reminder is every 14 Care Days; adjust it with your
        clinician if needed. Use the same
        method and conditions: stand, tape level at the midpoint between the lowest
        palpable rib and top of the hip bone, snug without compressing, after a normal
        exhale. Take two; if they differ by more than 1 cm, repeat, then record the
        closest-pair average.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label>
          <span className={LABEL_CLASS}>Waist (cm)</span>
          <input className={INPUT_CLASS} type="number" inputMode="decimal" min="30" max="250" step="0.1" required value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>Measured at (Iran time)</span>
          <input className={INPUT_CLASS} type="datetime-local" required max={toDateTimeLocal(new Date(now.getTime() + 10 * MINUTE_MS))} value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} />
        </label>
        <label>
          <span className={LABEL_CLASS}>Method</span>
          <select className={INPUT_CLASS} value={method} onChange={(event) => setMethod(event.target.value as WaistMeasurementMethod)}>
            <option value="midpoint">WHO midpoint</option>
            <option value="other">Another consistent method</option>
            <option value="unspecified">Not recorded</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Note (optional)</span>
        <input className={INPUT_CLASS} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
          <Ruler className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save waist"}
        </button>
        <p className={`text-sm ${message.includes("saved") ? "text-emerald-700" : "text-rose-700"}`} aria-live="polite">{message}</p>
      </div>
    </form>
  );
}

function ExerciseSessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: ExerciseSession;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label =
    session.customActivityName?.trim() ||
    EXERCISE_ACTIVITY_LABELS[session.activityType];
  const exerciseCount = session.strengthExercises?.length ?? 0;
  const setCount =
    session.strengthExercises?.reduce(
      (total, exercise) => total + exercise.setCount,
      0,
    ) ?? 0;

  return (
    <article className="rounded-md bg-zinc-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 className="font-semibold text-zinc-950">{label}</h5>
          <p className="mt-0.5 text-sm text-zinc-700">
            {session.durationMinutes.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })} min · {EXERCISE_INTENSITY_LABELS[session.intensity]}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ended {formatTimeOnly(session.endedAt)} Iran time
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            aria-label={`Edit ${label} session`}
            onClick={onEdit}
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" />
          </button>
          <DeleteButton label={`Delete ${label} session`} onDelete={onDelete} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-700">
        {session.perceivedExertion === undefined ? null : (
          <span className="rounded-full bg-white px-2 py-1">
            Perceived effort {session.perceivedExertion}/10
          </span>
        )}
        {session.distanceKm === undefined ? null : (
          <span className="rounded-full bg-white px-2 py-1">
            {session.distanceKm.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })} km
          </span>
        )}
        {session.steps === undefined ? null : (
          <span className="rounded-full bg-white px-2 py-1">
            {session.steps.toLocaleString()} steps
          </span>
        )}
        {session.averageHeartRateBpm === undefined ? null : (
          <span className="rounded-full bg-white px-2 py-1">
            Avg HR {session.averageHeartRateBpm} bpm
          </span>
        )}
        {session.averageCadenceRpm === undefined ? null : (
          <span className="rounded-full bg-white px-2 py-1">
            Avg {session.averageCadenceRpm} rpm
          </span>
        )}
        {session.equipmentName ? (
          <span className="rounded-full bg-white px-2 py-1">
            {session.equipmentName}
          </span>
        ) : null}
        {session.resistanceLevel ? (
          <span className="rounded-full bg-white px-2 py-1">
            Level {session.resistanceLevel}
          </span>
        ) : null}
        {exerciseCount ? (
          <span className="rounded-full bg-white px-2 py-1">
            {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} · {setCount} sets
          </span>
        ) : null}
      </div>
      {session.strengthExercises?.length ? (
        <details className="mt-2 rounded-md border border-zinc-200 bg-white text-xs">
          <summary className="cursor-pointer px-2.5 py-2 font-semibold text-zinc-700">
            Strength details
          </summary>
          <ul className="space-y-1.5 border-t border-zinc-100 px-2.5 py-2 text-zinc-600">
            {session.strengthExercises.map((exercise) => (
              <li key={exercise.id}>
                <strong className="text-zinc-800">{exercise.name}</strong>: {exercise.setCount} sets
                {` · ${STRENGTH_RESISTANCE_LABELS[exercise.resistanceType]}`}
                {exercise.totalReps === undefined
                  ? ""
                  : ` · ${exercise.totalReps} total reps`}
                {exercise.loadKg === undefined ? "" : ` · ${exercise.loadKg} kg`}
                {exercise.muscleGroups.length
                  ? ` · ${exercise.muscleGroups
                      .map((group) => STRENGTH_MUSCLE_GROUP_LABELS[group])
                      .join(", ")}`
                  : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {session.symptoms ? (
        <p className="mt-2 break-words text-xs text-amber-900">
          <strong>Symptoms:</strong> {session.symptoms}
        </p>
      ) : null}
      {session.notes ? (
        <p className="mt-1 break-words text-xs text-zinc-600">
          <strong>Note:</strong> {session.notes}
        </p>
      ) : null}
    </article>
  );
}

type StrengthExerciseDraft = {
  id: string;
  name: string;
  muscleGroups: StrengthMuscleGroup[];
  resistanceType: StrengthResistanceType;
  setCount: string;
  totalReps: string;
  loadKg: string;
};

function createStrengthExerciseDraft(): StrengthExerciseDraft {
  return {
    id: makeId("strength-exercise"),
    name: "",
    muscleGroups: [],
    resistanceType: "bodyweight",
    setCount: "",
    totalReps: "",
    loadKg: "",
  };
}

function ExerciseSessionForm({
  now,
  onAdd,
  editingSession,
  onCancelEdit,
}: {
  now: Date;
  onAdd: (session: ExerciseSession) => MaybePromise;
  editingSession: ExerciseSession | null;
  onCancelEdit: () => void;
}) {
  const [activityType, setActivityType] = useState<ExerciseActivityType>(
    () => editingSession?.activityType ?? "stationary-bike",
  );
  const [customActivityName, setCustomActivityName] = useState(
    () => editingSession?.customActivityName ?? "",
  );
  const [endedAt, setEndedAt] = useState(() =>
    editingSession
      ? toDateTimeLocal(new Date(editingSession.endedAt))
      : toDateTimeLocal(now),
  );
  const [endTimeEdited, setEndTimeEdited] = useState(
    () => Boolean(editingSession),
  );
  const endedAtInputId = useId();
  const [durationMinutes, setDurationMinutes] = useState(() =>
    editingSession ? String(editingSession.durationMinutes) : "",
  );
  const [intensity, setIntensity] = useState<ExerciseIntensity | "">(
    () => editingSession?.intensity ?? "",
  );
  const [perceivedExertion, setPerceivedExertion] = useState(() =>
    editingSession?.perceivedExertion === undefined
      ? ""
      : String(editingSession.perceivedExertion),
  );
  const [distanceKm, setDistanceKm] = useState(() =>
    editingSession?.distanceKm === undefined
      ? ""
      : String(editingSession.distanceKm),
  );
  const [steps, setSteps] = useState(() =>
    editingSession?.steps === undefined ? "" : String(editingSession.steps),
  );
  const [averageHeartRateBpm, setAverageHeartRateBpm] = useState(() =>
    editingSession?.averageHeartRateBpm === undefined
      ? ""
      : String(editingSession.averageHeartRateBpm),
  );
  const [averageCadenceRpm, setAverageCadenceRpm] = useState(() =>
    editingSession?.averageCadenceRpm === undefined
      ? ""
      : String(editingSession.averageCadenceRpm),
  );
  const [equipmentName, setEquipmentName] = useState(
    () => editingSession?.equipmentName ?? "",
  );
  const [resistanceLevel, setResistanceLevel] = useState(
    () => editingSession?.resistanceLevel ?? "",
  );
  const [strengthExercises, setStrengthExercises] = useState<
    StrengthExerciseDraft[]
  >(() =>
    editingSession?.activityType === "strength-training"
      ? editingSession.strengthExercises?.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          muscleGroups: exercise.muscleGroups,
          resistanceType: exercise.resistanceType,
          setCount: String(exercise.setCount),
          totalReps:
            exercise.totalReps === undefined
              ? ""
              : String(exercise.totalReps),
          loadKg:
            exercise.loadKg === undefined ? "" : String(exercise.loadKg),
        })) ?? [createStrengthExerciseDraft()]
      : [],
  );
  const [symptoms, setSymptoms] = useState(
    () => editingSession?.symptoms ?? "",
  );
  const [notes, setNotes] = useState(() => editingSession?.notes ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const isCustomActivity =
    activityType === "other" || activityType === "other-aerobic";
  const supportsDistance = DISTANCE_EXERCISE_TYPES.has(activityType);
  const supportsSteps = STEP_EXERCISE_TYPES.has(activityType);
  const supportsMachineMetrics = BIKE_OR_MACHINE_TYPES.has(activityType);
  const isStrength = activityType === "strength-training";
  const isAerobicActivity = isAerobicExerciseActivityType(activityType);
  const displayedEndedAt = endTimeEdited ? endedAt : toDateTimeLocal(now);

  function resetForm(nextActivityType = activityType) {
    setActivityType(nextActivityType);
    setEndedAt(toDateTimeLocal(new Date()));
    setEndTimeEdited(false);
    setCustomActivityName("");
    setDurationMinutes("");
    setIntensity("");
    setPerceivedExertion("");
    setDistanceKm("");
    setSteps("");
    setAverageHeartRateBpm("");
    setAverageCadenceRpm("");
    setEquipmentName("");
    setResistanceLevel("");
    setStrengthExercises(
      nextActivityType === "strength-training"
        ? [createStrengthExerciseDraft()]
        : [],
    );
    setSymptoms("");
    setNotes("");
  }

  function focusExerciseFormOnNextFrame() {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLSelectElement>("#exercise-session-entry select")
        ?.focus();
    });
  }

  function updateStrengthExercise(
    id: string,
    update: Partial<StrengthExerciseDraft>,
  ) {
    setStrengthExercises((current) =>
      current.map((exercise) =>
        exercise.id === id ? { ...exercise, ...update } : exercise,
      ),
    );
  }

  function toggleMuscleGroup(id: string, group: StrengthMuscleGroup) {
    setStrengthExercises((current) =>
      current.map((exercise) =>
        exercise.id !== id
          ? exercise
          : {
              ...exercise,
              muscleGroups: exercise.muscleGroups.includes(group)
                ? exercise.muscleGroups.filter((item) => item !== group)
                : [...exercise.muscleGroups, group],
            },
      ),
    );
  }

  function changeActivityType(nextType: ExerciseActivityType) {
    setActivityType(nextType);
    setMessage("");
    if (nextType === "strength-training" && strengthExercises.length === 0) {
      setStrengthExercises([createStrengthExerciseDraft()]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const endIso = toIsoTimestamp(
      endTimeEdited ? endedAt : toDateTimeLocal(new Date()),
    );
    const duration = parseNumber(durationMinutes);
    const effort = parseNumber(perceivedExertion);
    const distance = parseNumber(distanceKm);
    const stepCount = parseNumber(steps);
    const averageHeartRate = parseNumber(averageHeartRateBpm);
    const averageCadence = parseNumber(averageCadenceRpm);

    if (!endIso || isFutureTimestamp(endIso, now)) {
      setMessage("Choose a valid end time that is not in the future.");
      return;
    }
    if (duration === null || duration < 1 || duration > 1_440) {
      setMessage("Enter 1–1,440 active minutes.");
      return;
    }
    if (!intensity) {
      setMessage("Choose how intense the session felt.");
      return;
    }
    if (isCustomActivity && !customActivityName.trim()) {
      setMessage("Name the custom activity so it remains useful in reports.");
      return;
    }
    if (
      perceivedExertion.trim() &&
      (effort === null || effort < 0 || effort > 10)
    ) {
      setMessage("Use a perceived effort from 0 to 10, or leave it blank.");
      return;
    }
    if (
      supportsDistance &&
      distanceKm.trim() &&
      (distance === null || distance <= 0 || distance > 1_000)
    ) {
      setMessage("Use a distance above 0 and up to 1,000 km, or leave it blank.");
      return;
    }
    if (
      supportsSteps &&
      steps.trim() &&
      (stepCount === null ||
        !Number.isInteger(stepCount) ||
        stepCount < 1 ||
        stepCount > 250_000)
    ) {
      setMessage("Use a whole-number step count from 1 to 250,000.");
      return;
    }
    if (
      averageHeartRateBpm.trim() &&
      (averageHeartRate === null ||
        !Number.isInteger(averageHeartRate) ||
        averageHeartRate < 25 ||
        averageHeartRate > 240)
    ) {
      setMessage("Use an average heart rate from 25 to 240 bpm.");
      return;
    }
    if (
      supportsMachineMetrics &&
      averageCadenceRpm.trim() &&
      (averageCadence === null ||
        !Number.isInteger(averageCadence) ||
        averageCadence < 1 ||
        averageCadence > 250)
    ) {
      setMessage("Use an average cadence from 1 to 250 rpm.");
      return;
    }

    const strengthExerciseLogs: StrengthExerciseLog[] = [];
    if (isStrength) {
      for (const exercise of strengthExercises) {
        const hasAnyDetail =
          exercise.name.trim() ||
          exercise.setCount.trim() ||
          exercise.totalReps.trim() ||
          exercise.loadKg.trim() ||
          exercise.muscleGroups.length > 0;
        if (!hasAnyDetail) continue;
        const setCount = parseNumber(exercise.setCount);
        const totalReps = parseNumber(exercise.totalReps);
        const loadKg = parseNumber(exercise.loadKg);
        if (!exercise.name.trim()) {
          setMessage("Name each strength exercise that has details.");
          return;
        }
        if (
          setCount === null ||
          !Number.isInteger(setCount) ||
          setCount < 1 ||
          setCount > 100
        ) {
          setMessage("Use 1–100 sets for each recorded strength exercise.");
          return;
        }
        if (
          exercise.totalReps.trim() &&
          (totalReps === null ||
            !Number.isInteger(totalReps) ||
            totalReps < 1 ||
            totalReps > 10_000)
        ) {
          setMessage("Use a whole-number total rep count, or leave it blank.");
          return;
        }
        const supportsRecordedLoad =
          exercise.resistanceType === "free-weight" ||
          exercise.resistanceType === "machine";
        if (
          supportsRecordedLoad &&
          exercise.loadKg.trim() &&
          (loadKg === null || loadKg <= 0 || loadKg > 1_000)
        ) {
          setMessage("Use a load above 0 and up to 1,000 kg, or leave it blank.");
          return;
        }
        strengthExerciseLogs.push({
          id: exercise.id,
          name: exercise.name.trim(),
          muscleGroups: exercise.muscleGroups,
          resistanceType: exercise.resistanceType,
          setCount,
          ...(totalReps === null ? {} : { totalReps }),
          ...(loadKg === null || !supportsRecordedLoad
            ? {}
            : { loadKg }),
        });
      }
    }

    const savedAt = new Date().toISOString();
    setSaving(true);
    try {
      await onAdd({
        id: editingSession?.id ?? makeId("exercise-session"),
        endedAt: endIso,
        activityType,
        ...(isCustomActivity
          ? { customActivityName: customActivityName.trim() }
          : {}),
        durationMinutes: duration,
        intensity,
        ...(effort === null ? {} : { perceivedExertion: effort }),
        ...(supportsDistance && distance !== null ? { distanceKm: distance } : {}),
        ...(supportsSteps && stepCount !== null ? { steps: stepCount } : {}),
        ...(averageHeartRate === null
          ? {}
          : { averageHeartRateBpm: averageHeartRate }),
        ...(supportsMachineMetrics && averageCadence !== null
          ? { averageCadenceRpm: averageCadence }
          : {}),
        ...(supportsMachineMetrics && equipmentName.trim()
          ? { equipmentName: equipmentName.trim() }
          : {}),
        ...(supportsMachineMetrics && resistanceLevel.trim()
          ? { resistanceLevel: resistanceLevel.trim() }
          : {}),
        ...(strengthExerciseLogs.length
          ? { strengthExercises: strengthExerciseLogs }
          : {}),
        symptoms: symptoms.trim() || undefined,
        notes: notes.trim() || undefined,
        createdAt: editingSession?.createdAt ?? savedAt,
        updatedAt: savedAt,
      });
      const wasEditing = Boolean(editingSession);
      resetForm(activityType);
      onCancelEdit();
      if (wasEditing) focusExerciseFormOnNextFrame();
      setMessage(
        wasEditing ? "Exercise session updated." : "Exercise session saved.",
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="exercise-session-entry"
      onSubmit={submit}
      className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4"
    >
      <h3 className="font-semibold text-zinc-950">
        {editingSession ? "Edit exercise session" : "Log daily activity"}
      </h3>
      <p className="mt-1 text-xs leading-5 text-zinc-600">
        Add one or more sessions for the day. The Iran end date decides which
        calendar day the session belongs to; blank optional details stay unknown,
        not zero.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className={LABEL_CLASS}>Activity</span>
          <select
            className={INPUT_CLASS}
            autoFocus={Boolean(editingSession)}
            value={activityType}
            onChange={(event) =>
              changeActivityType(event.target.value as ExerciseActivityType)
            }
          >
            {EXERCISE_ACTIVITY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <div>
          <label className={LABEL_CLASS} htmlFor={endedAtInputId}>Ended (Iran time)</label>
          <div className="flex gap-2">
            <input
              id={endedAtInputId}
              className={INPUT_CLASS}
              type="datetime-local"
              required
              max={toDateTimeLocal(new Date(now.getTime() + 10 * MINUTE_MS))}
              value={displayedEndedAt}
              onChange={(event) => {
                setEndedAt(event.target.value);
                setEndTimeEdited(true);
              }}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                setEndedAt(toDateTimeLocal(new Date()));
                setEndTimeEdited(true);
              }}
            >
              Now
            </button>
          </div>
        </div>
        <label>
          <span className={LABEL_CLASS}>Active duration (min)</span>
          <input
            className={INPUT_CLASS}
            type="number"
            inputMode="decimal"
            min="1"
            max="1440"
            step="0.5"
            required
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>Relative intensity</span>
          <select
            className={INPUT_CLASS}
            required
            value={intensity}
            onChange={(event) =>
              setIntensity(event.target.value as ExerciseIntensity | "")
            }
          >
            <option value="">Choose…</option>
            {isAerobicActivity ? (
              <>
                <option value="light">Light — easy conversation / singing</option>
                <option value="moderate">Moderate — talk, but not sing</option>
                <option value="vigorous">Vigorous — only a few words</option>
              </>
            ) : (
              <>
                <option value="light">Light — easy effort</option>
                <option value="moderate">Moderate — clear, sustainable effort</option>
                <option value="vigorous">Vigorous — hard effort</option>
              </>
            )}
            <option value="unknown">Not sure / not recorded</option>
          </select>
        </label>
      </div>

      {isCustomActivity ? (
        <label className="mt-3 block">
          <span className={LABEL_CLASS}>Activity name</span>
          <input
            className={INPUT_CLASS}
            maxLength={100}
            required
            value={customActivityName}
            onChange={(event) => setCustomActivityName(event.target.value)}
            placeholder="For example: dancing or stair climbing"
          />
        </label>
      ) : null}

      <details className="mt-3 rounded-md border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-zinc-800">
          Optional details for better analysis
        </summary>
        <div className="border-t border-zinc-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className={LABEL_CLASS}>Perceived effort (0–10)</span>
              <input
                className={INPUT_CLASS}
                type="number"
                inputMode="decimal"
                min="0"
                max="10"
                step="0.5"
                value={perceivedExertion}
                onChange={(event) => setPerceivedExertion(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Average heart rate (bpm)</span>
              <input
                className={INPUT_CLASS}
                type="number"
                inputMode="numeric"
                min="25"
                max="240"
                value={averageHeartRateBpm}
                onChange={(event) => setAverageHeartRateBpm(event.target.value)}
                placeholder="Optional"
              />
            </label>
            {supportsDistance ? (
              <label>
                <span className={LABEL_CLASS}>Distance (km)</span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  value={distanceKm}
                  onChange={(event) => setDistanceKm(event.target.value)}
                  placeholder={supportsMachineMetrics ? "Machine / route value" : "Optional"}
                />
              </label>
            ) : null}
            {supportsSteps ? (
              <label>
                <span className={LABEL_CLASS}>Steps during session</span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="250000"
                  step="1"
                  value={steps}
                  onChange={(event) => setSteps(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            ) : null}
            {supportsMachineMetrics ? (
              <>
                <label>
                  <span className={LABEL_CLASS}>Average cadence (rpm)</span>
                  <input
                    className={INPUT_CLASS}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="250"
                    value={averageCadenceRpm}
                    onChange={(event) => setAverageCadenceRpm(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Bike / machine name</span>
                  <input
                    className={INPUT_CLASS}
                    maxLength={100}
                    value={equipmentName}
                    onChange={(event) => setEquipmentName(event.target.value)}
                    placeholder="Helps compare like with like"
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Resistance / level</span>
                  <input
                    className={INPUT_CLASS}
                    maxLength={60}
                    value={resistanceLevel}
                    onChange={(event) => setResistanceLevel(event.target.value)}
                    placeholder="Machine-specific value"
                  />
                </label>
              </>
            ) : null}
          </div>

          {isStrength ? (
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Strength exercises</h4>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Optional. Record actual work; do not enter missing load as zero.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                  disabled={strengthExercises.length >= 50}
                  onClick={() =>
                    setStrengthExercises((current) => [
                      ...current,
                      createStrengthExerciseDraft(),
                    ])
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {strengthExercises.length >= 50 ? "50-exercise limit" : "Add exercise"}
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {strengthExercises.map((exercise, index) => (
                  <div key={exercise.id} className="rounded-md border border-zinc-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-800">Exercise {index + 1}</p>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Remove strength exercise ${index + 1}`}
                        onClick={() =>
                          setStrengthExercises((current) =>
                            current.filter((item) => item.id !== exercise.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="xl:col-span-2">
                        <span className={LABEL_CLASS}>Exercise name</span>
                        <input
                          className={INPUT_CLASS}
                          maxLength={100}
                          value={exercise.name}
                          onChange={(event) =>
                            updateStrengthExercise(exercise.id, { name: event.target.value })
                          }
                          placeholder="For example: chair squat"
                        />
                      </label>
                      <label>
                        <span className={LABEL_CLASS}>Resistance</span>
                        <select
                          className={INPUT_CLASS}
                          value={exercise.resistanceType}
                          onChange={(event) =>
                            updateStrengthExercise(exercise.id, {
                              resistanceType: event.target.value as StrengthResistanceType,
                              ...(
                                event.target.value === "free-weight" ||
                                event.target.value === "machine"
                                  ? {}
                                  : { loadKg: "" }
                              ),
                            })
                          }
                        >
                          {Object.entries(STRENGTH_RESISTANCE_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={LABEL_CLASS}>Sets</span>
                        <input
                          className={INPUT_CLASS}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="100"
                          step="1"
                          value={exercise.setCount}
                          onChange={(event) =>
                            updateStrengthExercise(exercise.id, { setCount: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span className={LABEL_CLASS}>Total reps</span>
                        <input
                          className={INPUT_CLASS}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="10000"
                          step="1"
                          value={exercise.totalReps}
                          onChange={(event) =>
                            updateStrengthExercise(exercise.id, { totalReps: event.target.value })
                          }
                          placeholder="Optional"
                        />
                      </label>
                      {exercise.resistanceType === "free-weight" ||
                      exercise.resistanceType === "machine" ? (
                        <label>
                          <span className={LABEL_CLASS}>Load (kg)</span>
                          <input
                            className={INPUT_CLASS}
                            type="number"
                            inputMode="decimal"
                            min="0.1"
                            max="1000"
                            step="0.1"
                            value={exercise.loadKg}
                            onChange={(event) =>
                              updateStrengthExercise(exercise.id, { loadKg: event.target.value })
                            }
                            placeholder="Optional"
                          />
                        </label>
                      ) : null}
                    </div>
                    <fieldset className="mt-3">
                      <legend className={LABEL_CLASS}>Major muscle groups (optional)</legend>
                      <div className="flex flex-wrap gap-2">
                        {(Object.entries(STRENGTH_MUSCLE_GROUP_LABELS) as Array<[
                          StrengthMuscleGroup,
                          string,
                        ]>).map(([group, label]) => (
                          <label key={group} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700">
                            <input
                              type="checkbox"
                              checked={exercise.muscleGroups.includes(group)}
                              onChange={() => toggleMuscleGroup(exercise.id, group)}
                              className="h-4 w-4 accent-emerald-600"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className={LABEL_CLASS}>Symptoms / pain (optional)</span>
              <input
                className={INPUT_CLASS}
                maxLength={500}
                value={symptoms}
                onChange={(event) => setSymptoms(event.target.value)}
                placeholder="What happened and when"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Session note (optional)</span>
              <input
                className={INPUT_CLASS}
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Route, intervals, conditions, or anything useful later"
              />
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Heart rate and machine distance are context, not universal truth. Medicines can
            change heart-rate response, and machine levels are most comparable on the same device.
          </p>
        </div>
      </details>

      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
          <Activity className="h-4 w-4" aria-hidden="true" />
          {saving
            ? "Saving…"
            : editingSession
              ? "Update exercise session"
              : "Save exercise session"}
        </button>
        {editingSession ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            onClick={() => {
              onCancelEdit();
              resetForm("stationary-bike");
              setMessage("");
              focusExerciseFormOnNextFrame();
            }}
          >
            Cancel edit
          </button>
        ) : null}
        <p
          className={`text-sm ${message.includes("saved") || message.includes("updated") ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        Stop and seek urgent medical help for chest pain, fainting, or severe unexplained
        breathlessness. This log records what happened; it does not set a safe exercise dose.
      </p>
    </form>
  );
}

function ActivityForm({
  onAdd,
}: {
  onAdd: (entry: ActivityCheckIn) => MaybePromise;
}) {
  const [sedentaryHours, setSedentaryHours] = useState("");
  const [conditioning, setConditioning] = useState<"better" | "same" | "worse">("same");
  const [symptoms, setSymptoms] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sedentary = parseNumber(sedentaryHours);
    if (
      sedentaryHours.trim() &&
      (sedentary === null || sedentary < 0 || sedentary > 24)
    ) {
      setMessage("Use 0–24 sedentary hours per day, or leave it blank.");
      return;
    }
    const savedAt = new Date().toISOString();
    setSaving(true);
    try {
      await onAdd({
        id: makeId("activity"),
        measuredAt: savedAt,
        careDayKey: careDayKeyForInstant(savedAt),
        sedentaryHoursPerDay: sedentary ?? undefined,
        perceivedConditioning: conditioning,
        symptoms: symptoms.trim() || undefined,
        notes: notes.trim() || undefined,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      setSedentaryHours("");
      setSymptoms("");
      setNotes("");
      setMessage("Weekly context reflection saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="activity-context-form" onSubmit={submit} className="scroll-mt-4 rounded-lg bg-zinc-50 p-3 sm:p-4">
      <h3 className="font-semibold text-zinc-950">Weekly context reflection</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-600">Session minutes and strength days are calculated above from the raw log. This review captures sitting, conditioning, symptoms and barriers without creating a second source of truth.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span className={LABEL_CLASS}>Sitting hours/day</span><input className={INPUT_CLASS} type="number" inputMode="decimal" min="0" max="24" step="0.5" value={sedentaryHours} onChange={(event) => setSedentaryHours(event.target.value)} /></label>
        <label><span className={LABEL_CLASS}>Conditioning feels</span><select className={INPUT_CLASS} value={conditioning} onChange={(event) => setConditioning(event.target.value as "better" | "same" | "worse")}><option value="better">Better</option><option value="same">Same</option><option value="worse">Worse</option></select></label>
      </div>
      <label className="mt-3 block"><span className={LABEL_CLASS}>Symptoms / limitation (optional)</span><input className={INPUT_CLASS} maxLength={500} value={symptoms} onChange={(event) => setSymptoms(event.target.value)} placeholder="Pain, breathlessness, dizziness, or other limitation" /></label>
      <label className="mt-3 block"><span className={LABEL_CLASS}>Weekly note (optional)</span><input className={INPUT_CLASS} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Changes in routine, barriers, or recovery" /></label>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center"><button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}><Dumbbell className="h-4 w-4" aria-hidden="true" />{saving ? "Saving…" : "Save weekly review"}</button><p className={`text-sm ${message.includes("saved") ? "text-emerald-700" : "text-rose-700"}`} aria-live="polite">{message}</p></div>
    </form>
  );
}

type ProfileDraft = Omit<HealthProfile, "heightCm"> & {
  heightCm: string;
};

function profileToDraft(profile: HealthProfile): ProfileDraft {
  return {
    ...profile,
    heightCm: String(profile.heightCm),
  };
}

function ProfilePanel({
  profile,
  currentWeight,
  goalWeight,
  now,
  onUpdate,
}: {
  profile: HealthProfile;
  currentWeight: number;
  goalWeight: number;
  now: Date;
  onUpdate: (profile: HealthProfile) => MaybePromise;
}) {
  const [draft, setDraft] = useState(() => profileToDraft(profile));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const age = ageAt(profile.dateOfBirth, now);
  const heightM = profile.heightCm / 100;
  const bmi = currentWeight / (heightM * heightM);
  const goalBmi = goalWeight / (heightM * heightM);
  const waistHeightRatio = profile.waistCircumferenceCm / profile.heightCm;
  const waistMethodLabel =
    profile.waistMeasurementMethod === "midpoint"
      ? "midpoint method recorded"
      : profile.waistMeasurementMethod === "other"
        ? "other method recorded"
        : "measurement method not recorded";

  function setField<K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const today = localDateKey(now);
    const age = ageAt(draft.dateOfBirth, now);
    const heightCm = parseNumber(draft.heightCm);

    if (age === null || age < 18 || age > 120 || draft.dateOfBirth > today) {
      setMessage("Choose a valid adult date of birth.");
      return;
    }
    if (
      heightCm === null ||
      heightCm < 100 ||
      heightCm > 250
    ) {
      setMessage("Use a height from 100–250 cm and waist from 30–250 cm.");
      return;
    }
    if (!parseDateOnly(draft.dietStartDate) || draft.dietStartDate > today) {
      setMessage("Choose a valid diet start date that is not in the future.");
      return;
    }
    if (!draft.dietClinicianName.trim()) {
      setMessage("Enter the clinician supervising the diet plan.");
      return;
    }

    setSaving(true);
    try {
      await onUpdate({
        ...draft,
        heightCm,
        activityNotes: draft.activityNotes.trim().slice(0, 1000),
        dietClinicianName: draft.dietClinicianName.trim().slice(0, 200),
      });
      setMessage("Health profile saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="profile-title">
      <SectionHeading
        icon={<Activity className="h-5 w-5" aria-hidden="true" />}
        title="Health profile"
        description="Personal context for interpreting your trends; editable without changing your logs."
      />
      <span id="profile-title" className="sr-only">Health profile</span>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="min-w-0 rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-medium text-zinc-500">Age / height</p>
          <p className="mt-1 text-lg font-semibold text-zinc-950">
            {age ?? "—"} yr · {profile.heightCm} cm
          </p>
          <p className="text-xs text-zinc-500">Born {profile.dateOfBirth}</p>
        </div>
        <div className="min-w-0 rounded-md bg-sky-50 p-3">
          <p className="text-xs font-medium text-sky-700">BMI screening</p>
          <p className="mt-1 text-lg font-semibold text-sky-950">{bmi.toFixed(1)}</p>
          <p className="text-xs text-sky-700">
            {bmiScreeningLabel(bmi)} · goal BMI {goalBmi.toFixed(2)}
          </p>
        </div>
        <div className="min-w-0 rounded-md bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700">Waist / height</p>
          <p className="mt-1 text-lg font-semibold text-amber-950">
            {profile.waistCircumferenceCm} cm · {waistHeightRatio.toFixed(2)}
          </p>
          <p className="text-xs text-amber-700">
            {waistHeightScreeningLabel(waistHeightRatio)}
          </p>
        </div>
        <div className="min-w-0 rounded-md bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-700">Diet plan</p>
          <p className="mt-1 break-words text-sm font-semibold text-emerald-950" dir="auto">
            {profile.dietClinicianName}
          </p>
          <p className="text-xs text-emerald-700">Started {profile.dietStartDate}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
        <strong className="text-zinc-900">Activity context:</strong>{" "}
        {profile.activityLevel === "sedentary"
          ? "Very little movement / sedentary"
          : `${profile.activityLevel} activity`}
        {profile.activityNotes ? ` — ${profile.activityNotes}` : "."}
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          BMI and waist-to-height ratio are screening tools, not diagnoses. The waist
          ratio is provisional because the {waistMethodLabel}. Given the blood-pressure
          concern and long inactivity, review the log and a gradual starting plan with
          your clinician before vigorous exercise.
        </p>
      </div>

      <details className="mt-3 rounded-md border border-zinc-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
          Edit profile details
          <span className="text-xs font-normal text-zinc-500">Open</span>
        </summary>
        <form onSubmit={submit} className="border-t border-zinc-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <span className={LABEL_CLASS}>Date of birth</span>
              <input
                className={INPUT_CLASS}
                type="date"
                required
                max={localDateKey(now)}
                value={draft.dateOfBirth}
                onChange={(event) => setField("dateOfBirth", event.target.value)}
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Height (cm)</span>
              <input
                className={INPUT_CLASS}
                type="number"
                min="100"
                max="250"
                step="0.1"
                required
                inputMode="decimal"
                value={draft.heightCm}
                onChange={(event) => setField("heightCm", event.target.value)}
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Activity level</span>
              <select
                className={INPUT_CLASS}
                value={draft.activityLevel}
                onChange={(event) =>
                  setField(
                    "activityLevel",
                    event.target.value as HealthProfile["activityLevel"],
                  )
                }
              >
                <option value="sedentary">Very little / sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              <span className={LABEL_CLASS}>Diet clinician</span>
              <input
                className={INPUT_CLASS}
                type="text"
                required
                maxLength={200}
                dir="auto"
                value={draft.dietClinicianName}
                onChange={(event) =>
                  setField("dietClinicianName", event.target.value)
                }
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Diet started</span>
              <input
                className={INPUT_CLASS}
                type="date"
                required
                max={localDateKey(now)}
                value={draft.dietStartDate}
                onChange={(event) => setField("dietStartDate", event.target.value)}
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className={LABEL_CLASS}>Activity and strength notes</span>
            <textarea
              className={`${INPUT_CLASS} min-h-24 resize-y`}
              maxLength={1000}
              dir="auto"
              value={draft.activityNotes}
              onChange={(event) => setField("activityNotes", event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            <p
              className={`text-sm ${
                message === "Health profile saved."
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
              aria-live="polite"
            >
              {message}
            </p>
          </div>
        </form>
      </details>
    </section>
  );
}

function SettingsPanel({
  settings,
  onUpdate,
}: {
  settings: HealthSettings;
  onUpdate: (settings: HealthSettings) => MaybePromise;
}) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof HealthSettings>(key: K, value: HealthSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (
      !Number.isFinite(draft.baselineWeightKg) ||
      draft.baselineWeightKg < 30 ||
      draft.baselineWeightKg > 350 ||
      !Number.isFinite(draft.goalWeightKg) ||
      draft.goalWeightKg < 30 ||
      draft.goalWeightKg > 350 ||
      draft.goalWeightKg >= draft.baselineWeightKg
    ) {
      setMessage("Use valid weights from 30–350 kg, with goal below baseline.");
      return;
    }
    if (!parseDateOnly(draft.baselineDate)) {
      setMessage("Choose a valid baseline date.");
      return;
    }
    const cycleDays = inclusiveCalendarDays(
      draft.bpCycleStartDate,
      draft.bpCycleEndDate,
    );
    if (cycleDays === null || cycleDays < 3 || cycleDays > 7) {
      setMessage("Blood pressure cycles must cover 3–7 calendar days; 7 is preferred.");
      return;
    }
    const times = [
      draft.weightReminderTime,
      draft.bpMorningReminderTime,
      draft.bpEveningReminderTime,
      draft.dietReminderTime,
      draft.waistReminderTime,
      draft.activityReminderTime,
    ];
    if (times.some((time) => !/^\d{2}:\d{2}$/.test(time))) {
      setMessage("Choose valid reminder times.");
      return;
    }
    if (
      draft.bpTargetSystolic < 80 ||
      draft.bpTargetSystolic > 180 ||
      draft.bpTargetDiastolic < 40 ||
      draft.bpTargetDiastolic > 120 ||
      draft.waistReminderIntervalDays < 7 ||
      draft.waistReminderIntervalDays > 90 ||
      draft.activityReminderIntervalDays < 3 ||
      draft.activityReminderIntervalDays > 30
    ) {
      setMessage("Check the BP target and recurring reminder intervals.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate(draft);
      setMessage("Health settings saved.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className={CARD_CLASS}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
        <span className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          Health goals and reminders
        </span>
        <span className="text-xs font-medium text-zinc-500">Open settings</span>
      </summary>
      <form onSubmit={submit} className="mt-4 border-t border-zinc-100 pt-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
          <strong>Reminder limits:</strong> these controls store reminder preferences.
          Alerts from this screen are dependable only while the app is open. Background
          or closed-app notifications require separate service-worker or server delivery
          and are not guaranteed here. Every entry and reminder time below is Iran time
          (Asia/Tehran), regardless of the phone or browser time zone.
        </div>

        <fieldset className="mt-4 rounded-md border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">Weight goal</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className={LABEL_CLASS}>Baseline kg</span>
              <input
                className={INPUT_CLASS}
                type="number"
                min="30"
                max="350"
                step="0.1"
                value={draft.baselineWeightKg}
                onChange={(event) =>
                  setField("baselineWeightKg", Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Baseline date</span>
              <input
                className={INPUT_CLASS}
                type="date"
                value={draft.baselineDate}
                onChange={(event) => setField("baselineDate", event.target.value)}
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Goal kg</span>
              <input
                className={INPUT_CLASS}
                type="number"
                min="30"
                max="350"
                step="0.1"
                value={draft.goalWeightKg}
                onChange={(event) => setField("goalWeightKg", Number(event.target.value))}
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label>
              <span className={LABEL_CLASS}>Morning reminder</span>
              <input
                className={INPUT_CLASS}
                type="time"
                value={draft.weightReminderTime}
                onChange={(event) => setField("weightReminderTime", event.target.value)}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={draft.weightReminderEnabled}
                onChange={(event) =>
                  setField("weightReminderEnabled", event.target.checked)
                }
              />
              Enabled
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-4 rounded-md border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">
            Blood pressure measurement cycle
          </legend>
          <p className="mb-3 text-xs leading-5 text-zinc-500">
            Use 3 days minimum and 7 days preferred. Each morning and evening session
            contains two readings at least one minute apart.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={LABEL_CLASS}>Cycle starts</span>
              <input
                className={INPUT_CLASS}
                type="date"
                value={draft.bpCycleStartDate}
                onChange={(event) => setField("bpCycleStartDate", event.target.value)}
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Cycle ends</span>
              <input
                className={INPUT_CLASS}
                type="date"
                value={draft.bpCycleEndDate}
                onChange={(event) => setField("bpCycleEndDate", event.target.value)}
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>After-waking reminder</span>
              <input
                className={INPUT_CLASS}
                type="time"
                value={draft.bpMorningReminderTime}
                onChange={(event) =>
                  setField("bpMorningReminderTime", event.target.value)
                }
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>Evening, before sleep</span>
              <input
                className={INPUT_CLASS}
                type="time"
                value={draft.bpEveningReminderTime}
                onChange={(event) =>
                  setField("bpEveningReminderTime", event.target.value)
                }
              />
            </label>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-600"
              checked={draft.bpReminderEnabled}
              onChange={(event) => setField("bpReminderEnabled", event.target.checked)}
            />
            Enable morning and evening cycle reminders
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className={LABEL_CLASS}>Preferred arm</span><select className={INPUT_CLASS} value={draft.preferredBpArm} onChange={(event) => setField("preferredBpArm", event.target.value as BloodPressureArm)}><option value="unknown">Not determined</option><option value="left">Left</option><option value="right">Right</option></select></label>
            <label><span className={LABEL_CLASS}>Home target systolic</span><input className={INPUT_CLASS} type="number" min="80" max="180" value={draft.bpTargetSystolic} onChange={(event) => setField("bpTargetSystolic", Number(event.target.value))} /></label>
            <label><span className={LABEL_CLASS}>Home target diastolic</span><input className={INPUT_CLASS} type="number" min="40" max="120" value={draft.bpTargetDiastolic} onChange={(event) => setField("bpTargetDiastolic", Number(event.target.value))} /></label>
            <label><span className={LABEL_CLASS}>Device / cuff</span><input className={INPUT_CLASS} maxLength={120} value={draft.bpDeviceModel} onChange={(event) => setField("bpDeviceModel", event.target.value)} placeholder="Validated model" /></label>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">The default 135/85 is a home-monitoring reference, not a personalised treatment target. Replace it with Dr. Jahangiri or your prescriber&apos;s target.</p>
        </fieldset>

        <fieldset className="mt-4 rounded-md border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">Waist and activity cadence</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className={LABEL_CLASS}>Waist reminder</span><input className={INPUT_CLASS} type="time" value={draft.waistReminderTime} onChange={(event) => setField("waistReminderTime", event.target.value)} /></label>
            <label><span className={LABEL_CLASS}>Every Care Days</span><input className={INPUT_CLASS} type="number" min="7" max="90" value={draft.waistReminderIntervalDays} onChange={(event) => setField("waistReminderIntervalDays", Number(event.target.value))} /></label>
            <label><span className={LABEL_CLASS}>Activity review</span><input className={INPUT_CLASS} type="time" value={draft.activityReminderTime} onChange={(event) => setField("activityReminderTime", event.target.value)} /></label>
            <label><span className={LABEL_CLASS}>Every Care Days</span><input className={INPUT_CLASS} type="number" min="3" max="30" value={draft.activityReminderIntervalDays} onChange={(event) => setField("activityReminderIntervalDays", Number(event.target.value))} /></label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700"><input type="checkbox" checked={draft.waistReminderEnabled} onChange={(event) => setField("waistReminderEnabled", event.target.checked)} />Enable waist reminders</label>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700"><input type="checkbox" checked={draft.activityReminderEnabled} onChange={(event) => setField("activityReminderEnabled", event.target.checked)} />Enable optional weekly context reminder</label>
          </div>
        </fieldset>

        <fieldset className="mt-4 rounded-md border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-semibold text-zinc-800">
            Diet and browser preferences
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={LABEL_CLASS}>Diet check-in reminder</span>
              <input
                className={INPUT_CLASS}
                type="time"
                value={draft.dietReminderTime}
                onChange={(event) => setField("dietReminderTime", event.target.value)}
              />
            </label>
            <div className="space-y-2 sm:self-end">
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={draft.dietReminderEnabled}
                  onChange={(event) =>
                    setField("dietReminderEnabled", event.target.checked)
                  }
                />
                Enable diet reminder
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={draft.browserNotifications}
                  onChange={(event) =>
                    setField("browserNotifications", event.target.checked)
                  }
                />
                Browser notification preference
              </label>
            </div>
          </div>
        </fieldset>

        <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <button className={PRIMARY_BUTTON_CLASS} type="submit" disabled={saving}>
            <BellRing className="h-4 w-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save health settings"}
          </button>
          <p
            className={`text-sm ${
              message === "Health settings saved."
                ? "text-emerald-700"
                : "text-rose-700"
            }`}
            aria-live="polite"
          >
            {message}
          </p>
        </div>
      </form>
    </details>
  );
}

export function HealthTracker({
  careDayKey,
  weightEntries,
  bloodPressureSessions,
  dietCheckIns,
  waistEntries,
  activityCheckIns,
  exerciseSessions,
  profile,
  settings,
  now,
  onAddWeight,
  onDeleteWeight,
  onAddBloodPressure,
  onDeleteBloodPressure,
  onAddDiet,
  onDeleteDiet,
  onAddWaist,
  onDeleteWaist,
  onAddActivity,
  onDeleteActivity,
  onAddExerciseSession,
  onDeleteExerciseSession,
  onUpdateProfile,
  onUpdateSettings,
}: HealthTrackerProps) {
  const [exerciseReportRange, setExerciseReportRange] =
    useState<ExerciseReportRange>("today");
  const [editingExerciseSession, setEditingExerciseSession] =
    useState<ExerciseSession | null>(null);
  const validNow = Number.isFinite(now.getTime()) ? now : new Date(0);
  const todayKey = careDayKey;
  const cycleActive = isInCycle(todayKey, settings);
  const sortedWeights = useMemo(() => sortByMeasuredAt(weightEntries), [weightEntries]);
  const sortedBp = useMemo(
    () => sortByMeasuredAt(bloodPressureSessions),
    [bloodPressureSessions],
  );
  const sortedDiet = useMemo(() => sortByMeasuredAt(dietCheckIns), [dietCheckIns]);
  const sortedWaist = useMemo(() => sortByMeasuredAt(waistEntries), [waistEntries]);
  const sortedActivity = useMemo(
    () => sortByMeasuredAt(activityCheckIns),
    [activityCheckIns],
  );
  const sortedExerciseSessions = useMemo(
    () =>
      [...exerciseSessions].sort(
        (first, second) =>
          Date.parse(first.endedAt) - Date.parse(second.endedAt),
      ),
    [exerciseSessions],
  );

  const latestWeight = sortedWeights.at(-1);
  const currentWeight = latestWeight?.weightKg ?? settings.baselineWeightKg;
  const totalPlannedLoss = Math.max(
    0.1,
    settings.baselineWeightKg - settings.goalWeightKg,
  );
  const lossSoFar = settings.baselineWeightKg - currentWeight;
  const progress = clamp((lossSoFar / totalPlannedLoss) * 100, 0, 100);
  const remaining = Math.max(0, currentWeight - settings.goalWeightKg);
  const fivePercentMilestone = settings.baselineWeightKg * 0.95;
  const tenPercentMilestone = settings.baselineWeightKg * 0.9;
  const pace = recentWeightPace(sortedWeights);
  const weightTrend = rollingWeightTrend(sortedWeights);
  const latestTrend = weightTrend.at(-1);
  const unusualWeightDifference =
    latestTrend &&
    Math.abs(latestTrend.raw - latestTrend.trend) >=
      Math.max(1, settings.baselineWeightKg * 0.015)
      ? Math.abs(latestTrend.raw - latestTrend.trend)
      : null;

  const latestBp = sortedBp.at(-1);
  const resumableBpSession = [...sortedBp]
    .reverse()
    .find(
      (session) =>
        session.readings.length === 1 &&
        !session.pairingClosedAt &&
        entryCareDayKey(session) === todayKey &&
        (() => {
          const firstAt = session.readings[0].measuredAt;
          if (!firstAt) return false;
          const age = validNow.getTime() - Date.parse(firstAt);
          return age >= -10 * MINUTE_MS && age <= 10 * MINUTE_MS;
        })(),
    );
  const latestBpAverage = latestBp ? sessionAverage(latestBp) : null;
  const latestBpWithinUrgentWindow = latestBp
    ? isMeasurementWithin(latestBp.measuredAt, validNow, URGENT_READING_WINDOW_MS)
    : false;
  const hasRecentBpSession = latestBp
    ? isMeasurementWithin(latestBp.measuredAt, validNow, RECENT_SESSION_WINDOW_MS)
    : false;
  const latestAnySevereRecorded =
    latestBp?.readings.some(isSevereReading) ?? false;
  const latestPersistentSevereRecorded =
    (latestBp?.readings.length ?? 0) >= 2 &&
    (latestBp?.readings.every(isSevereReading) ?? false);
  const latestIndependentEmergencyRecorded = latestBp
    ? hasIndependentEmergencySymptom(latestBp.emergencySymptoms)
    : false;
  const latestBackPainRecorded =
    latestBp?.emergencySymptoms.includes("back-pain") ?? false;
  const latestEmergency =
    latestBpWithinUrgentWindow &&
    (latestIndependentEmergencyRecorded ||
      (latestAnySevereRecorded && latestBackPainRecorded));
  const latestPersistentSevere =
    latestBpWithinUrgentWindow && latestPersistentSevereRecorded;
  const latestAnySevere = latestBpWithinUrgentWindow && latestAnySevereRecorded;
  const latestHistoricalSevere =
    !latestBpWithinUrgentWindow && latestAnySevereRecorded;
  const currentCycleBp = cycleActive
    ? sortedBp.filter((session) => {
        const key = entryCareDayKey(session) ?? "";
        const timestamp = new Date(session.measuredAt).getTime();
        return (
          key >= settings.bpCycleStartDate &&
          key <= settings.bpCycleEndDate &&
          assessBloodPressureSession(session, {
            targetSystolic: settings.bpTargetSystolic,
            targetDiastolic: settings.bpTargetDiastolic,
          }).trendEligible &&
          timestamp <= validNow.getTime()
        );
      })
    : [];
  const recurringStageTwoDayCount = new Set(
    currentCycleBp
      .filter((session) => {
        const average = sessionAverage(session);
        return average.systolic >= 140 || average.diastolic >= 90;
      })
      .map((session) => entryCareDayKey(session))
      .filter(Boolean),
  ).size;
  const recurringStageTwo = cycleActive && recurringStageTwoDayCount >= 2;
  const sevenDayBp = sortedBp.filter((session) => {
    const timestamp = new Date(session.measuredAt).getTime();
    return (
      assessBloodPressureSession(session, {
        targetSystolic: settings.bpTargetSystolic,
        targetDiastolic: settings.bpTargetDiastolic,
      }).trendEligible &&
      timestamp <= validNow.getTime() &&
      timestamp > validNow.getTime() - 7 * DAY_MS
    );
  });
  const sevenDayBpAverage =
    sevenDayBp.length > 0
      ? sevenDayBp.reduce(
          (result, session) => {
            const average = sessionAverage(session);
            return {
              systolic: result.systolic + average.systolic / sevenDayBp.length,
              diastolic: result.diastolic + average.diastolic / sevenDayBp.length,
            };
          },
          { systolic: 0, diastolic: 0 },
        )
      : null;
  const sevenDayBpDayCount = new Set(
    sevenDayBp.map((session) => entryCareDayKey(session)).filter(Boolean),
  ).size;
  const sevenDayBpTrendReady = sevenDayBpDayCount >= 3;

  const latestDietByDay = new Map<string, DietCheckIn>();
  for (const checkIn of sortedDiet) {
    const key = entryCareDayKey(checkIn);
    if (key) latestDietByDay.set(key, checkIn);
  }
  const lastSevenDayKeys = Array.from({ length: 7 }, (_, index) => {
    const [year, month, day] = todayKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day - index));
    return date.toISOString().slice(0, 10);
  });
  const weeklyDiet = lastSevenDayKeys
    .map((key) => latestDietByDay.get(key))
    .filter((entry): entry is DietCheckIn => Boolean(entry));
  const onPlanDays = weeklyDiet.filter((entry) => entry.adherence === "on-plan").length;
  const mostlyDays = weeklyDiet.filter(
    (entry) => entry.adherence === "mostly-on-plan",
  ).length;
  const offPlanDays = weeklyDiet.filter((entry) => entry.adherence === "off-plan").length;
  const sodiumAwareDays = weeklyDiet.filter((entry) => entry.sodiumAware).length;

  const todayCalendarKey = localDateKey(validNow);
  const exerciseRangeDateKeys =
    exerciseReportRange === "all"
      ? null
      : getTrailingTehranDateKeys(
          todayCalendarKey,
          exerciseReportRange === "today"
            ? 1
            : exerciseReportRange === "7-days"
              ? 7
              : 30,
        );
  const exerciseSummary = summarizeExerciseSessions(
    sortedExerciseSessions,
    exerciseRangeDateKeys,
  );
  const selectedExerciseSessions = exerciseSummary.sessions;
  const selectedExerciseMinutes = exerciseSummary.totalMinutes;
  const moderateEquivalentMinutes =
    exerciseSummary.moderateEquivalentMinutes;
  const strengthDayCount = exerciseSummary.strengthDayCount;
  const exerciseMinutesByType = Array.from(
    selectedExerciseSessions.reduce((minutesByType, session) => {
      const label =
        session.customActivityName?.trim() ||
        EXERCISE_ACTIVITY_LABELS[session.activityType];
      minutesByType.set(
        label,
        (minutesByType.get(label) ?? 0) + session.durationMinutes,
      );
      return minutesByType;
    }, new Map<string, number>()),
  ).sort((first, second) => second[1] - first[1]);
  const generalAerobicReferenceProgress = clamp(
    (moderateEquivalentMinutes / 150) * 100,
    0,
    100,
  );
  const exerciseSessionsByDate = Array.from(
    selectedExerciseSessions.reduce((sessionsByDate, session) => {
      const dateKey = getExerciseSessionTehranDateKey(session);
      if (!dateKey) return sessionsByDate;
      sessionsByDate.set(dateKey, [
        ...(sessionsByDate.get(dateKey) ?? []),
        session,
      ]);
      return sessionsByDate;
    }, new Map<string, ExerciseSession[]>()),
  )
    .map(([dateKey, sessions]) => ({
      dateKey,
      sessions,
      summary: summarizeExerciseSessions(sessions, [dateKey]),
      distanceKm: sessions.reduce(
        (total, session) => total + (session.distanceKm ?? 0),
        0,
      ),
      steps: sessions.reduce(
        (total, session) => total + (session.steps ?? 0),
        0,
      ),
    }))
    .sort((first, second) => second.dateKey.localeCompare(first.dateKey));
  const selectedExerciseRangeStart =
    exerciseRangeDateKeys?.[0] ??
    exerciseSessionsByDate.at(-1)?.dateKey ??
    todayCalendarKey;
  const selectedExerciseRangeEnd =
    exerciseRangeDateKeys?.at(-1) ??
    exerciseSessionsByDate[0]?.dateKey ??
    todayCalendarKey;
  const selectedExerciseRangeLabel =
    exerciseReportRange === "all" && exerciseSessionsByDate.length === 0
      ? "No sessions yet"
      : selectedExerciseRangeStart === selectedExerciseRangeEnd
      ? selectedExerciseRangeStart
      : `${selectedExerciseRangeStart} – ${selectedExerciseRangeEnd}`;

  const todayWeights = sortedWeights.filter(
    (entry) => entryCareDayKey(entry) === todayKey,
  );
  const todayDiet = sortedDiet.filter(
    (entry) => entryCareDayKey(entry) === todayKey,
  );
  const taskEvaluation = evaluateHealthTasks({
    now: validNow,
    careDayKey: todayKey,
    settings,
    weightEntries,
    bloodPressureSessions,
    dietCheckIns,
    waistEntries,
    activityCheckIns,
  });
  const taskById = new Map(taskEvaluation.tasks.map((task) => [task.id, task]));
  const morningTaskStatus = taskById.get("blood-pressure-morning")?.status;
  const eveningTaskStatus = taskById.get("blood-pressure-evening")?.status;
  const morningTaskReason = taskById.get("blood-pressure-morning")?.reason;
  const eveningTaskReason = taskById.get("blood-pressure-evening")?.reason;
  const morningBpDone = morningTaskStatus === "complete";
  const morningBpWindowPassed =
    !morningBpDone &&
    taskEvaluation.currentMinute >= careDayMinute(MORNING_BP_WINDOW_END_TIME);
  const bpMissingStreak = taskEvaluation.bloodPressurePlan.missingStreak;
  const dueActions: DueAction[] = [
    ...(settings.weightReminderEnabled
      ? [
          {
            id: "weight",
            label: "Morning weight",
            detail: todayWeights.length > 0
              ? `${todayWeights.at(-1)?.weightKg.toFixed(1)} kg logged`
              : `Best before food or drink · ${settings.weightReminderTime}`,
            done: todayWeights.length > 0,
            dueNow: taskById.get("weight")?.status === "due",
            href: "#weight-entry",
          },
        ]
      : []),
    ...(settings.bpReminderEnabled && taskEvaluation.bloodPressurePlan.active
      ? [
          {
            id: "bp-morning",
            label: "Morning blood pressure",
            detail: morningBpDone
              ? "Morning pair logged"
              : morningTaskStatus === "partial"
                ? "One reading saved; add the second on the same arm within 10 minutes"
              : morningTaskReason === "incomplete-session-saved"
                ? "Single reading kept; its pairing window ended, so start a fresh pair"
              : morningBpWindowPassed
                ? "Preferred window passed. You can still record a clearly timed session; never delay or skip medicine to measure first."
                : "Take two readings at a consistent after-waking time; record whether this was before or after medicine, and never delay a dose.",
            done: morningTaskStatus === "complete",
            dueNow:
              !morningBpWindowPassed &&
              ["due", "partial"].includes(
                taskById.get("blood-pressure-morning")?.status ?? "",
              ),
            windowPassed: morningBpWindowPassed,
            href: "#bp-entry",
          },
          {
            id: "bp-evening",
            label: "Evening blood pressure",
            detail:
              eveningTaskStatus === "partial"
                ? "One reading saved; add the second on the same arm within 10 minutes"
                : eveningTaskReason === "incomplete-session-saved"
                  ? "Single reading kept; start a fresh same-arm pair"
                : "Two readings, before sleep",
            done: eveningTaskStatus === "complete",
            dueNow: ["due", "partial"].includes(
              taskById.get("blood-pressure-evening")?.status ?? "",
            ),
            href: "#bp-entry",
          },
        ]
      : []),
    ...(settings.dietReminderEnabled
      ? [
          {
            id: "diet",
            label: "Diet check-in",
            detail: "Record adherence, sodium awareness, and context",
            done: todayDiet.length > 0,
            dueNow: taskById.get("diet")?.status === "due",
            href: "#diet-entry",
          },
        ]
      : []),
    ...(settings.waistReminderEnabled &&
    taskById.get("waist")?.status !== "inactive"
      ? [
          {
            id: "waist",
            label: "Waist measurement",
            detail: `Every ${settings.waistReminderIntervalDays} Care Days`,
            done: taskById.get("waist")?.status === "complete",
            dueNow: taskById.get("waist")?.status === "due",
            href: "#waist-entry",
          },
        ]
      : []),
    ...(settings.activityReminderEnabled &&
    taskById.get("activity")?.status !== "inactive"
      ? [
          {
            id: "activity",
            label: "Optional weekly context",
            detail: "Sitting, conditioning, symptoms, and barriers",
            done: taskById.get("activity")?.status === "complete",
            dueNow: taskById.get("activity")?.status === "due",
            href: "#activity-entry",
          },
        ]
      : []),
  ];

  async function saveExerciseSession(session: ExerciseSession) {
    await Promise.resolve(onAddExerciseSession(session));
    const sessionDate = getExerciseSessionTehranDateKey(session);
    if (
      !sessionDate ||
      exerciseRangeDateKeys === null ||
      exerciseRangeDateKeys.includes(sessionDate)
    ) {
      return;
    }
    const sevenDayKeys = getTrailingTehranDateKeys(todayCalendarKey, 7);
    if (sevenDayKeys.includes(sessionDate)) {
      setExerciseReportRange("7-days");
      return;
    }
    const thirtyDayKeys = getTrailingTehranDateKeys(todayCalendarKey, 30);
    setExerciseReportRange(
      thirtyDayKeys.includes(sessionDate) ? "30-days" : "all",
    );
  }

  function confirmDelete(label: string, callback: () => MaybePromise) {
    if (!window.confirm(`Delete ${label}? This action will sync as a deletion.`)) return;
    void Promise.resolve(callback()).catch((error) => {
      window.alert(errorText(error));
    });
  }

  return (
    <section className="space-y-5 pb-24 text-zinc-950" aria-labelledby="health-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Health tracking
          </p>
          <h1 id="health-title" className="mt-1 text-2xl font-semibold tracking-tight">
            Weight, pressure, waist, and activity
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
            A measurement and habit record for discussing care with your clinician —
            not a diagnosis or medication dosing tool.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600">
          <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          Care Day {todayKey} · closes at noon
        </span>
      </header>

      {hasRecentBpSession && latestBp ? (
        <details className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950 shadow-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-sm font-semibold marker:hidden">
            <ShieldAlert className="h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
            <span>
              Blood pressure safety guidance
              <span className="mt-0.5 block text-xs font-normal text-sky-700">
                Latest session logged {formatDateTime(latestBp.measuredAt)} · Tap to expand
              </span>
            </span>
          </summary>
          <div className="mt-3 border-t border-sky-200 pt-3 text-sm leading-6 text-sky-900">
            <p>
              Keep taking medicine exactly as prescribed; never delay, change, or stop a
              dose because of this screen.
            </p>
            <p className="mt-2 font-semibold">
              Call your local emergency service now for chest pain, severe or unexplained
              shortness of breath, or stroke warning signs such as sudden numbness or
              weakness, vision change, or difficulty speaking, regardless of BP.
            </p>
            <p className="mt-2">
              If a repeat remains at least 180 systolic or 120 diastolic and any listed
              symptom—including back pain—is present, call emergency services. This app
              does not interpret back pain alone.
            </p>
          </div>
        </details>
      ) : (
        <section className="rounded-lg border-2 border-rose-300 bg-rose-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-rose-950">Check your blood pressure now</h2>
              <p className="mt-1 text-sm leading-6 text-rose-900">
                Because you take blood pressure medicine and recently felt your pressure
                may be high, take one properly prepared two-reading session now if you can
                safely do so. Keep taking medicine as prescribed; never delay, change, or
                stop a dose because of this screen.
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-rose-950">
                Call your local emergency service now for chest pain, severe or unexplained
                shortness of breath, or stroke warning signs such as sudden numbness or
                weakness, vision change, or difficulty speaking, regardless of BP.
              </p>
              <p className="mt-2 text-sm leading-6 text-rose-900">
                If a repeat remains at least 180 systolic or 120 diastolic and any listed
                symptom—including back pain—is present, call emergency services. This app
                does not interpret back pain alone.
              </p>
              <a
                href="#bp-entry"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                Record two readings
              </a>
            </div>
          </div>
        </section>
      )}

      {latestEmergency && latestBp ? (
        <section role="alert" className="rounded-lg border-2 border-red-500 bg-red-100 p-4 text-red-950">
          <h2 className="font-bold">Recent record may still need emergency action</h2>
          <p className="mt-1 text-sm leading-6">
            The session recorded {formatDateTime(latestBp.measuredAt)} included
            symptoms selected as present at measurement time. This screen cannot tell
            whether they continue now. If chest pain, severe or unexplained shortness of
            breath, or a sudden stroke warning sign is still present or has returned,
            call your local emergency service now regardless of BP. If back pain is
            present and a repeat remains at least 180 systolic or 120 diastolic, call now.
          </p>
        </section>
      ) : latestPersistentSevere && latestBp ? (
        <section className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-950">
          <h2 className="font-bold">Repeated severe readings need immediate contact</h2>
          <p className="mt-1 text-sm leading-6">
            Both readings recorded {formatDateTime(latestBp.measuredAt)} were at
            least 180 systolic or 120 diastolic. Contact your health care professional
            immediately. If an emergency symptom is present now, follow the emergency
            guidance above.
          </p>
        </section>
      ) : latestAnySevere && latestBp ? (
        <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-950">
          <h2 className="font-semibold">A severe-range reading was recorded</h2>
          <p className="mt-1 text-sm leading-6">
            The recent session recorded {formatDateTime(latestBp.measuredAt)}
            included one reading at least 180 systolic or 120 diastolic. Follow the
            repeat-measurement instructions and share both readings with your health care
            professional promptly.
          </p>
        </section>
      ) : latestHistoricalSevere && latestBp ? (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-800">
          <h2 className="text-sm font-semibold">Historical severe-range record</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            The latest stored session, measured {formatDateTime(latestBp.measuredAt)},
            included a value at least 180 systolic or 120 diastolic. This historical entry
            does not establish your pressure or symptoms now. If a current repeat remains
            this high, use the safety guidance above and contact your clinician promptly;
            emergency symptoms require emergency care as described above.
          </p>
        </section>
      ) : null}

      <section className={CARD_CLASS} aria-labelledby="today-actions-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="today-actions-title" className="text-lg font-semibold">
              Today
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">Small actions, one screen.</p>
          </div>
          <Clock3 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        </div>
        {dueActions.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {dueActions.map((action) => (
              <a
                key={action.id}
                href={action.href}
                className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 transition focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                  action.done
                    ? "border-emerald-200 bg-emerald-50"
                    : action.windowPassed
                      ? "border-zinc-200 bg-zinc-100"
                      : action.dueNow
                        ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    action.done
                      ? "bg-emerald-600 text-white"
                      : action.windowPassed
                        ? "bg-white text-zinc-500"
                        : action.dueNow
                          ? "bg-amber-100 text-amber-800"
                          : "bg-white text-zinc-500"
                  }`}
                >
                  {action.done ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  ) : action.windowPassed ? (
                    <Info className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Clock3 className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-zinc-500">
                    {action.done
                      ? "Done · "
                      : action.windowPassed
                        ? "Window passed · "
                        : action.dueNow
                          ? "Due now · "
                          : "Later · "}
                    {action.detail}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-zinc-50 p-3 text-sm text-zinc-500">
            No enabled scheduled actions. The blood pressure safety check above still
            applies today.
          </p>
        )}
        {settings.bpReminderEnabled && !taskEvaluation.bloodPressurePlan.active ? (
          <p className="mt-3 text-xs text-zinc-500">
            The scheduled blood pressure cycle is not active today. Start a new 3–7 day
            cycle in settings when preparing a current report or clinician visit.
          </p>
        ) : null}
        {taskEvaluation.bloodPressurePlan.enhancedCycleActive ? (
          <p className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
            A valid pair was outside your configured home target, so the app has
            started a seven-Care-Day observation run. This is a product reminder
            heuristic, not a diagnosis. A repeat pattern strengthens the prompt to
            share the log with your prescriber; do not change medicine yourself.
          </p>
        ) : null}
      </section>

      {bpMissingStreak > 0 ? (
        <section
          className={`rounded-lg border p-4 ${
            bpMissingStreak >= 2
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <h2 className="font-semibold">
            Blood pressure log missing for {bpMissingStreak} closed Care Day
            {bpMissingStreak === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm leading-6">
            Missing data does not mean your pressure was high or low. Complete the next
            after-waking and before-bed sessions. {bpMissingStreak >= 3
              ? "The app recommends restarting or extending a 7-Care-Day log and sharing it with your clinician."
              : "The app will remind you once per Care Day while the active monitoring plan continues."}
          </p>
        </section>
      ) : null}

      <ProfilePanel
        key={JSON.stringify(profile)}
        profile={profile}
        currentWeight={currentWeight}
        goalWeight={settings.goalWeightKg}
        now={validNow}
        onUpdate={onUpdateProfile}
      />

      <section className={CARD_CLASS} aria-labelledby="weight-section-title">
        <SectionHeading
          icon={<Scale className="h-5 w-5" aria-hidden="true" />}
          title="Weight journey"
          description="Use consistent morning measurements and follow the trend, not a single fluctuation."
        />
        <span id="weight-section-title" className="sr-only">Weight journey</span>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">Baseline</p>
            <p className="mt-1 text-xl font-semibold">{settings.baselineWeightKg.toFixed(1)} kg</p>
            <p className="text-xs text-zinc-500">{settings.baselineDate}</p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-700">Current</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">
              {currentWeight.toFixed(1)} kg
            </p>
            <p className="text-xs text-emerald-700">
              {latestWeight ? formatShortDate(latestWeight.measuredAt) : "Baseline only"}
            </p>
          </div>
          <div className="rounded-md bg-sky-50 p-3">
            <p className="text-xs font-medium text-sky-700">Goal</p>
            <p className="mt-1 text-xl font-semibold text-sky-950">
              {settings.goalWeightKg.toFixed(1)} kg
            </p>
            <p className="text-xs text-sky-700">{remaining.toFixed(1)} kg remaining</p>
          </div>
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-700">Recent pace</p>
            <p className="mt-1 text-xl font-semibold text-amber-950">
              {pace === null ? "—" : `${Math.abs(pace).toFixed(2)}`}
            </p>
            <p className="text-xs text-amber-700">
              {pace === null ? "Needs 2 weeks" : pace >= 0 ? "kg/week loss" : "kg/week gain"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-zinc-800">
              Progress to {settings.goalWeightKg.toFixed(1)} kg
            </span>
            <span className="font-semibold text-emerald-700">{progress.toFixed(0)}%</span>
          </div>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-label="Weight goal progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-zinc-50 px-2 py-2">
              <strong className="block text-zinc-900">{fivePercentMilestone.toFixed(1)} kg</strong>
              <span className="text-zinc-500">5% milestone</span>
            </div>
            <div className="rounded-md bg-zinc-50 px-2 py-2">
              <strong className="block text-zinc-900">{tenPercentMilestone.toFixed(1)} kg</strong>
              <span className="text-zinc-500">10% milestone</span>
            </div>
            <div className="rounded-md bg-emerald-50 px-2 py-2">
              <strong className="block text-emerald-950">
                {settings.goalWeightKg.toFixed(1)} kg
              </strong>
              <span className="text-emerald-700">Goal</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <WeightChart
            entries={sortedWeights}
            goalWeightKg={settings.goalWeightKg}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-950">
            <div className="flex items-center gap-2 font-semibold">
              <TrendingDown className="h-4 w-4" aria-hidden="true" />
              General safe pace reference
            </div>
            <p className="mt-1">
              About {SAFE_WEEKLY_LOSS_MIN_KG.toFixed(2)}–
              {SAFE_WEEKLY_LOSS_MAX_KG.toFixed(2)} kg per week. Faster is not the same
              as better, and your clinician may set a different plan.
            </p>
          </div>
          <div
            className={`rounded-md border p-3 text-sm leading-5 ${
              (pace !== null && pace > SAFE_WEEKLY_LOSS_MAX_KG) ||
              unusualWeightDifference !== null
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-zinc-200 bg-zinc-50 text-zinc-700"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4" aria-hidden="true" />
              Anomaly review
            </div>
            {pace !== null && pace > SAFE_WEEKLY_LOSS_MAX_KG ? (
              <p className="mt-1">
                The two-window trend suggests loss faster than 0.91 kg/week. Review
                intake, hydration, symptoms, and the plan with a clinician or dietitian.
              </p>
            ) : unusualWeightDifference !== null ? (
              <p className="mt-1">
                The latest value is {unusualWeightDifference.toFixed(1)} kg away from
                its 7-day trend. Repeat under the same morning conditions; this is a
                data-quality flag, not a medical diagnosis.
              </p>
            ) : (
              <p className="mt-1">
                No trend flag yet. Day-to-day changes often reflect timing and fluid;
                use the 7-day line for decisions.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <WeightForm now={validNow} onAdd={onAddWeight} />
          <div className="rounded-lg border border-zinc-200 p-3">
            <h3 className="font-semibold text-zinc-900">Recent weights</h3>
            <div className="mt-2 space-y-2">
              {sortedWeights.length > 0 ? (
                sortedWeights
                  .slice(-5)
                  .reverse()
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold">{entry.weightKg.toFixed(1)} kg</p>
                        <p className="text-xs text-zinc-500">{formatDateTime(entry.measuredAt)}</p>
                      </div>
                      <DeleteButton
                        label={`Delete ${entry.weightKg.toFixed(1)} kilogram weight entry`}
                        onDelete={() =>
                          confirmDelete("this weight entry", () => onDeleteWeight(entry.id))
                        }
                      />
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500">No weight entries yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={CARD_CLASS} aria-labelledby="bp-section-title">
        <SectionHeading
          icon={<HeartPulse className="h-5 w-5" aria-hidden="true" />}
          title="Blood pressure"
          description="A 3–7 day home cycle, with 7 days preferred: two readings morning and evening."
        />
        <span id="bp-section-title" className="sr-only">Blood pressure</span>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">Latest average</p>
            <p className="mt-1 text-xl font-semibold">
              {latestBpAverage
                ? `${Math.round(latestBpAverage.systolic)}/${Math.round(latestBpAverage.diastolic)}`
                : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              mm Hg
              {typeof latestBpAverage?.pulseBpm === "number"
                ? ` · pulse ${Math.round(latestBpAverage.pulseBpm)} bpm`
                : " · pulse not recorded"}
            </p>
          </div>
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">Latest range</p>
            {latestBpAverage ? (
              <span
                className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${categoryClass(
                  bpCategory(latestBpAverage.systolic, latestBpAverage.diastolic),
                )}`}
              >
                {categoryLabel(
                  bpCategory(latestBpAverage.systolic, latestBpAverage.diastolic),
                )}
              </span>
            ) : (
              <p className="mt-1 text-xl font-semibold">—</p>
            )}
          </div>
          <div className="rounded-md bg-sky-50 p-3">
            <p className="text-xs font-medium text-sky-700">
              {sevenDayBpTrendReady ? "7-day average" : "Provisional average"}
            </p>
            <p className="mt-1 text-xl font-semibold text-sky-950">
              {sevenDayBpAverage
                ? `${Math.round(sevenDayBpAverage.systolic)}/${Math.round(
                    sevenDayBpAverage.diastolic,
                  )}`
                : "—"}
            </p>
            <p className="text-xs text-sky-700">
              {sevenDayBp.length} sessions · {sevenDayBpDayCount}/3 distinct days
            </p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-700">Home target</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">
              &lt;{settings.bpTargetSystolic}/{settings.bpTargetDiastolic}
            </p>
            <p className="text-xs text-emerald-700">Set with your prescriber</p>
          </div>
        </div>

        {sevenDayBpAverage &&
        sevenDayBpTrendReady &&
        (sevenDayBpAverage.systolic >= settings.bpTargetSystolic ||
          sevenDayBpAverage.diastolic >= settings.bpTargetDiastolic) ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <strong>App 7-day trend flag—not a diagnosis:</strong> the average from
            sessions across {sevenDayBpDayCount} distinct days is above the general
            configured home target of {settings.bpTargetSystolic}/
            {settings.bpTargetDiastolic}. Share the complete log with your clinician; do not
            adjust medication yourself.
          </div>
        ) : null}
        {sevenDayBpAverage && !sevenDayBpTrendReady ? (
          <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
            <strong>Provisional trend only:</strong> the app waits for measurements on at
            least 3 distinct days before raising a 7-day trend notice. You currently
            have {sevenDayBpDayCount}; continue the current 3–7 day cycle, with 7 days
            preferred, unless your clinician advised a different schedule.
          </div>
        ) : null}
        {recurringStageTwo ? (
          <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm leading-6 text-rose-950">
            <strong>App pattern flag—not a diagnosis:</strong> during the current
            measurement cycle, session averages reached Stage 2 range (140 systolic or
            90 diastolic or higher) on {recurringStageTwoDayCount} distinct days. The app
            uses 2 days as a review heuristic. Arrange a prompt treatment review with your
            prescriber, and continue medicine as prescribed unless they tell you otherwise.
          </div>
        ) : null}
        {latestBpAverage &&
        latestBp &&
        (latestBpAverage.systolic < 90 || latestBpAverage.diastolic < 60) ? (
          <div className="mt-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
            The latest stored average ({formatDateTime(latestBp.measuredAt)}) is
            in a low range. One low value may not be harmful, but contact your clinician
            promptly if you currently feel dizzy, confused, nauseated, faint, unusually
            tired, or have blurred vision.
          </div>
        ) : null}

        <div className="mt-4">
          <BloodPressureChart
            sessions={sortedBp}
            targetSystolic={settings.bpTargetSystolic}
            targetDiastolic={settings.bpTargetDiastolic}
          />
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-zinc-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Ranges describe recorded numbers; only a qualified health professional can
          diagnose hypertension or change treatment.
        </p>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
          <BloodPressureForm
            key={resumableBpSession?.id ?? "new-bp-session"}
            now={validNow}
            settings={settings}
            resumeSession={resumableBpSession}
            onAdd={onAddBloodPressure}
          />
          <div className="rounded-lg border border-zinc-200 p-3">
            <h3 className="font-semibold text-zinc-900">Recent sessions</h3>
            <div className="mt-2 space-y-2">
              {sortedBp.length > 0 ? (
                sortedBp
                  .slice(-5)
                  .reverse()
                  .map((session) => {
                    const average = sessionAverage(session);
                    const category = bpCategory(average.systolic, average.diastolic);
                    return (
                      <div key={session.id} className="rounded-md bg-zinc-50 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              {Math.round(average.systolic)}/{Math.round(average.diastolic)} average
                              {average.pulseBpm !== null
                                ? ` · ${Math.round(average.pulseBpm)} bpm pulse average`
                                : " · pulse not recorded"}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {session.readings
                                .map(
                                  (reading) =>
                                    `${reading.systolic}/${reading.diastolic} · ${
                                      typeof reading.pulseBpm === "number"
                                        ? `${reading.pulseBpm} bpm`
                                        : "pulse not recorded"
                                    }`,
                                )
                                .join(" | ")}
                              {session.readings.length === 1
                                ? " · single reading (incomplete pair)"
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {formatDateTime(session.measuredAt)} · {session.period}
                            </p>
                            {session.contextFlags.length > 0 ? (
                              <p className="mt-1 text-xs leading-5 text-zinc-600">
                                <span className="font-semibold">Context:</span>{" "}
                                {session.contextFlags
                                  .map((flag) => BP_CONTEXT_LABELS[flag])
                                  .join(", ")}
                              </p>
                            ) : null}
                            {session.notes ? (
                              <p className="mt-1 text-xs leading-5 text-zinc-600">
                                {session.notes}
                              </p>
                            ) : null}
                            <span
                              className={`mt-1.5 inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${categoryClass(category)}`}
                            >
                              {categoryLabel(category)}
                            </span>
                          </div>
                          <DeleteButton
                            label="Delete blood pressure session"
                            onDelete={() =>
                              confirmDelete("this blood pressure session", () =>
                                onDeleteBloodPressure(session.id),
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-sm text-zinc-500">No sessions yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={CARD_CLASS} aria-labelledby="diet-section-title">
        <SectionHeading
          icon={<Salad className="h-5 w-5" aria-hidden="true" />}
          title="Diet adherence"
          description="Track the plan you chose, note obstacles, and review the week without all-or-nothing scoring."
        />
        <span id="diet-section-title" className="sr-only">Diet adherence</span>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Check-ins</p>
            <p className="mt-1 text-xl font-semibold">{weeklyDiet.length}/7</p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">On plan</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{onPlanDays}</p>
          </div>
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Mostly / off</p>
            <p className="mt-1 text-xl font-semibold text-amber-950">
              {mostlyDays} / {offPlanDays}
            </p>
          </div>
          <div className="rounded-md bg-sky-50 p-3">
            <p className="text-xs text-sky-700">Sodium-aware days</p>
            <p className="mt-1 text-xl font-semibold text-sky-950">{sodiumAwareDays}</p>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
          A DASH-style pattern and lower sodium can support blood pressure, but this
          tracker does not prescribe calories, sodium, or potassium. Ask your clinician
          before increasing potassium or using potassium salt substitutes, especially
          with kidney disease or some blood pressure medicines.
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <DietForm now={validNow} onAdd={onAddDiet} />
          <div className="rounded-lg border border-zinc-200 p-3">
            <h3 className="font-semibold text-zinc-900">Recent check-ins</h3>
            <div className="mt-2 space-y-2">
              {sortedDiet.length > 0 ? (
                sortedDiet
                  .slice(-5)
                  .reverse()
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-2 rounded-md bg-zinc-50 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {entry.adherence === "on-plan"
                            ? "On plan"
                            : entry.adherence === "mostly-on-plan"
                              ? "Mostly on plan"
                              : "Off plan"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatDateTime(entry.measuredAt)}
                          {entry.sodiumAware ? " · sodium checked" : ""}
                        </p>
                      </div>
                      <DeleteButton
                        label="Delete diet check-in"
                        onDelete={() =>
                          confirmDelete("this diet check-in", () => onDeleteDiet(entry.id))
                        }
                      />
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500">No diet check-ins yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={CARD_CLASS} aria-labelledby="waist-section-title">
        <SectionHeading
          icon={<Ruler className="h-5 w-5" aria-hidden="true" />}
          title="Waist trend"
          description="A low-noise measurement every 14 Care Days, kept as history rather than overwriting the last value."
        />
        <span id="waist-section-title" className="sr-only">Waist trend</span>
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <WaistForm now={validNow} onAdd={onAddWaist} />
          <div className="rounded-lg border border-zinc-200 p-3">
            <h3 className="font-semibold text-zinc-900">Waist history</h3>
            <div className="mt-2 space-y-2">
              {sortedWaist.length ? sortedWaist.slice(-5).reverse().map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-zinc-50 p-2.5">
                  <div><p className="text-sm font-semibold">{entry.waistCircumferenceCm.toFixed(1)} cm</p><p className="text-xs text-zinc-500">{entry.measuredAtPrecision === "date" ? entry.measuredAt : formatDateTime(entry.measuredAt)} · Care Day {entryCareDayKey(entry)}</p></div>
                  <DeleteButton label="Delete waist entry" onDelete={() => confirmDelete("this waist entry", () => onDeleteWaist(entry.id))} />
                </div>
              )) : <p className="text-sm text-zinc-500">No waist measurements yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className={CARD_CLASS} aria-labelledby="activity-section-title">
        <SectionHeading
          icon={<Dumbbell className="h-5 w-5" aria-hidden="true" />}
          title="Movement & strength"
          description="Log activity day by day, then let the app derive calendar-based ranges and trends from those sessions."
        />
        <span id="activity-section-title" className="sr-only">Movement and strength</span>

        <ExerciseSessionForm
          key={editingExerciseSession?.id ?? "new-exercise-session"}
          now={validNow}
          onAdd={saveExerciseSession}
          editingSession={editingExerciseSession}
          onCancelEdit={() => setEditingExerciseSession(null)}
        />

        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-zinc-950">Derived time range</h3>
              <p className="mt-0.5 text-xs text-zinc-600" aria-live="polite">
                {selectedExerciseRangeLabel} · Tehran calendar dates, midnight to midnight
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1" role="group" aria-label="Exercise report range">
              {EXERCISE_REPORT_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={exerciseReportRange === option.id}
                  className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    exerciseReportRange === option.id
                      ? "bg-emerald-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                  onClick={() => setExerciseReportRange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Reports are calculated from daily session records. A date with no entry stays unknown; it is not treated as rest or zero activity.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-medium text-zinc-500">Days with entries</p>
            <p className="mt-1 text-xl font-semibold text-zinc-950">
              {exerciseSummary.activeDayCount}
            </p>
            <p className="text-xs text-zinc-500">
              {selectedExerciseSessions.length} logged session{selectedExerciseSessions.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-700">All active minutes</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{selectedExerciseMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
            <p className="text-xs text-emerald-700">Includes light and mobility</p>
          </div>
          <div className="rounded-md bg-sky-50 p-3">
            <p className="text-xs font-medium text-sky-700">Moderate-equivalent</p>
            <p className="mt-1 text-xl font-semibold text-sky-950">{moderateEquivalentMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
            <p className="text-xs text-sky-700">Aerobic min · vigorous ×2</p>
          </div>
          <div className="rounded-md bg-violet-50 p-3">
            <p className="text-xs font-medium text-violet-700">Strength days</p>
            <p className="mt-1 text-xl font-semibold text-violet-950">{strengthDayCount}</p>
            <p className="text-xs text-violet-700">Distinct Tehran dates</p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-zinc-200 p-3">
          {exerciseReportRange === "7-days" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-zinc-800">General adult aerobic reference</span>
                <span className="font-semibold text-emerald-700">{moderateEquivalentMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} / 150 min</span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100"
                role="progressbar"
                aria-label="Progress toward the general 150-minute adult aerobic reference"
                aria-valuemin={0}
                aria-valuemax={150}
                aria-valuenow={Math.min(150, Math.round(moderateEquivalentMinutes))}
              >
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${generalAerobicReferenceProgress}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                This is a general-population reference, not a personalized starting dose. Light activity remains visible in total minutes; strength and mobility are not misclassified as aerobic minutes.
              </p>
            </>
          ) : (
            <div>
              <p className="text-sm font-semibold text-zinc-800">Activity mix for this range</p>
              <p className="mt-0.5 text-xs text-zinc-500">All figures below are derived from the daily session log.</p>
            </div>
          )}
          {exerciseMinutesByType.length ? (
            <>
              <p className="mt-3 text-xs font-semibold text-zinc-700">Minutes by activity</p>
              <div className="mt-2 flex flex-wrap gap-2" aria-label="Minutes by activity type">
                {exerciseMinutesByType.map(([label, minutes]) => (
                  <span key={label} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {label} · {minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No activity types logged in this range.</p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold text-zinc-900">Daily exercise history</h3>
              <p className="mt-0.5 text-xs text-zinc-500">{selectedExerciseRangeLabel} · grouped by Tehran calendar date</p>
            </div>
            <span className="text-xs text-zinc-500">Newest day first</span>
          </div>
          <div className="mt-3 space-y-4">
            {exerciseSessionsByDate.length ? (
              exerciseSessionsByDate.map((day) => (
                <section key={day.dateKey} className="overflow-hidden rounded-lg border border-zinc-200">
                  <div className="flex flex-wrap items-start justify-between gap-3 bg-zinc-50 px-3 py-2.5">
                    <div>
                      <h4 className="font-semibold text-zinc-950">
                        {day.dateKey === todayCalendarKey ? `Today · ${day.dateKey}` : day.dateKey}
                      </h4>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {day.sessions.length} session{day.sessions.length === 1 ? "" : "s"} · {day.summary.totalMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} active min
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 text-xs text-zinc-700">
                      {day.summary.moderateEquivalentMinutes > 0 ? (
                        <span className="rounded-full bg-sky-100 px-2 py-1">{day.summary.moderateEquivalentMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} moderate-equivalent min</span>
                      ) : null}
                      {day.summary.strengthDayCount > 0 ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1">Strength</span>
                      ) : null}
                      {day.distanceKm > 0 ? (
                        <span className="rounded-full bg-white px-2 py-1">{day.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 2 })} km</span>
                      ) : null}
                      {day.steps > 0 ? (
                        <span className="rounded-full bg-white px-2 py-1">{day.steps.toLocaleString()} steps</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 p-3 lg:grid-cols-2">
                    {[...day.sessions].reverse().map((session) => (
                      <ExerciseSessionCard
                        key={session.id}
                        session={session}
                        onEdit={() => {
                          setEditingExerciseSession(session);
                          window.requestAnimationFrame(() =>
                            document
                              .getElementById("exercise-session-entry")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                          );
                        }}
                        onDelete={() =>
                          confirmDelete("this exercise session", async () => {
                            await onDeleteExerciseSession(session.id);
                            if (editingExerciseSession?.id === session.id) {
                              setEditingExerciseSession(null);
                            }
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p className="text-sm leading-6 text-zinc-500">
                No daily exercise entry in this range. That means no data was
                recorded; it does not automatically mean a rest day or zero activity.
              </p>
            )}
          </div>
        </div>

        <details
          id="activity-entry"
          className="mt-6 scroll-mt-4 rounded-lg border border-zinc-200"
          open={taskById.get("activity")?.status === "due" ? true : undefined}
        >
          <summary className="cursor-pointer px-3 py-3 font-semibold text-zinc-950 sm:px-4">
            Optional weekly context
          </summary>
          <div className="border-t border-zinc-200 p-3 sm:p-4">
            <p className="mb-3 text-xs leading-5 text-zinc-500">
              Sitting, conditioning and barriers can add context, but these reflections are never used to calculate daily exercise totals.
            </p>
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <ActivityForm onAdd={onAddActivity} />
              <div className="rounded-lg border border-zinc-200 p-3">
                <h3 className="font-semibold text-zinc-900">Weekly reflections</h3>
                <div className="mt-2 space-y-2">
                  {sortedActivity.length ? sortedActivity.slice(-5).reverse().map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-zinc-50 p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {entry.movementMinutes !== undefined || entry.strengthSessions !== undefined
                            ? `${entry.movementMinutes ?? "—"} min · ${entry.strengthSessions ?? "—"} strength (legacy)`
                            : `Conditioning: ${entry.perceivedConditioning ?? "not rated"}`}
                        </p>
                        <p className="text-xs text-zinc-500">{formatDateTime(entry.measuredAt)}{entry.movementMinutes !== undefined || entry.strengthSessions !== undefined ? ` · ${entry.perceivedConditioning ?? "not rated"}` : ""}{entry.sedentaryHoursPerDay === undefined ? "" : ` · ${entry.sedentaryHoursPerDay} sitting hrs/day`}</p>
                        {entry.symptoms ? <p className="mt-1 break-words text-xs text-amber-900"><strong>Limitation:</strong> {entry.symptoms}</p> : null}
                        {entry.notes ? <p className="mt-1 break-words text-xs text-zinc-600"><strong>Note:</strong> {entry.notes}</p> : null}
                      </div>
                      <DeleteButton label="Delete weekly context reflection" onDelete={() => confirmDelete("this weekly context reflection", () => onDeleteActivity(entry.id))} />
                    </div>
                  )) : <p className="text-sm text-zinc-500">No weekly reflections yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <SettingsPanel settings={settings} onUpdate={onUpdateSettings} />

      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-5 text-zinc-500">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>
            This screen supports measurement and pattern review. It cannot diagnose a
            condition, verify a cuff, or safely change medication. Bring the device and
            full log to your clinician, and keep regular medical appointments.
          </p>
        </div>
      </section>
    </section>
  );
}

export default HealthTracker;
