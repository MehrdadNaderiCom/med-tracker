"use client";

import { format, parseISO } from "date-fns";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Edit3,
  HeartPulse,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Pill,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MedTrackLoading } from "./med-track-loading";
import type {
  CategoryTone,
  IntakeLog,
  Medication,
  MedicationCategory,
  MedicationCategoryOption,
  MedicationDayMode,
  MedicationScheduleType,
  RoutineCategory,
  WeekDay,
} from "@/types";

type TabId = "dashboard" | "medications" | "add" | "history" | "settings";

type MedicationFormState = {
  id: string | null;
  name: string;
  dosage: string;
  unit: string;
  category: MedicationCategory;
  scheduleType: MedicationScheduleType;
  dayMode: MedicationDayMode;
  times: string[];
  timeInput: string;
  order: number;
  routineCategoryId: string;
  days: WeekDay[];
  notes: string;
};

type TodayMedication = {
  medication: Medication;
  scheduleType: MedicationScheduleType;
  time: string | null;
  order: number | null;
  routineCategoryId: string | null;
  isTaken: boolean;
};

type OrderedMedicationGroup = {
  routineCategoryId: string;
  routineCategoryName: string;
  order: number;
  entries: TodayMedication[];
  takenCount: number;
  isTaken: boolean;
};

type CategoryFormState = {
  id: string | null;
  name: string;
  tone: CategoryTone;
};

type RoutineCategoryFormState = {
  id: string | null;
  name: string;
  tone: CategoryTone;
  sortOrder: number;
};

const LOGIN_USERNAME = "mail@mehrdadnaderi.com";
const LOGIN_PASSWORD = "Naderi$2050";
const MEDICATIONS_STORAGE_KEY = "medtrack-medications";
const LOGS_STORAGE_KEY = "medtrack-intake-logs";
const AUTH_STORAGE_KEY = "medtrack-authenticated";
const CATEGORIES_STORAGE_KEY = "medtrack-categories";
const ROUTINE_CATEGORIES_STORAGE_KEY = "medtrack-routine-categories";

const WEEK_DAYS: { id: WeekDay; label: string; short: string }[] = [
  { id: "sunday", label: "Sunday", short: "Sun" },
  { id: "monday", label: "Monday", short: "Mon" },
  { id: "tuesday", label: "Tuesday", short: "Tue" },
  { id: "wednesday", label: "Wednesday", short: "Wed" },
  { id: "thursday", label: "Thursday", short: "Thu" },
  { id: "friday", label: "Friday", short: "Fri" },
  { id: "saturday", label: "Saturday", short: "Sat" },
];

const ALL_DAYS = WEEK_DAYS.map((day) => day.id);

const DAY_MODE_OPTIONS: {
  id: MedicationDayMode;
  label: string;
  description: string;
}[] = [
  {
    id: "daily",
    label: "Daily",
    description: "Due every day",
  },
  {
    id: "weekdays",
    label: "Specific weekdays",
    description: "Choose exact weekdays",
  },
  {
    id: "even-dates",
    label: "Even calendar dates",
    description: "Due on dates like 2, 4, 6",
  },
  {
    id: "odd-dates",
    label: "Odd calendar dates",
    description: "Due on dates like 1, 3, 5",
  },
];

const TABS: {
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "medications", label: "My Medications", icon: ClipboardList },
  { id: "add", label: "Add Medication", icon: Plus },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

const CATEGORY_TONE_CLASSES: Record<
  CategoryTone,
  {
    badgeClassName: string;
    iconClassName: string;
    dotClassName: string;
    swatchClassName: string;
  }
> = {
  rose: {
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    iconClassName: "bg-rose-100 text-rose-700",
    dotClassName: "bg-rose-500",
    swatchClassName: "bg-rose-500",
  },
  amber: {
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
    iconClassName: "bg-amber-100 text-amber-800",
    dotClassName: "bg-amber-500",
    swatchClassName: "bg-amber-500",
  },
  sky: {
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
    iconClassName: "bg-sky-100 text-sky-800",
    dotClassName: "bg-sky-500",
    swatchClassName: "bg-sky-500",
  },
  emerald: {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconClassName: "bg-emerald-100 text-emerald-800",
    dotClassName: "bg-emerald-500",
    swatchClassName: "bg-emerald-500",
  },
  violet: {
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-800",
    iconClassName: "bg-violet-100 text-violet-800",
    dotClassName: "bg-violet-500",
    swatchClassName: "bg-violet-500",
  },
  zinc: {
    badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
    iconClassName: "bg-zinc-100 text-zinc-700",
    dotClassName: "bg-zinc-400",
    swatchClassName: "bg-zinc-500",
  },
};

const DEFAULT_MEDICATION_CATEGORIES: MedicationCategoryOption[] = [
  {
    id: "skin",
    name: "Skin",
    tone: "rose",
  },
  {
    id: "hair",
    name: "Hair",
    tone: "amber",
  },
  {
    id: "blood-pressure",
    name: "Blood pressure",
    tone: "sky",
  },
  {
    id: "heart-rate",
    name: "Heart rate",
    tone: "rose",
  },
  {
    id: "mental-health",
    name: "Mental health",
    tone: "violet",
  },
  {
    id: "liver",
    name: "Liver",
    tone: "emerald",
  },
  {
    id: "vitamins",
    name: "Vitamins",
    tone: "amber",
  },
  {
    id: "other",
    name: "Other",
    tone: "zinc",
  },
];

const DEFAULT_ROUTINE_CATEGORIES: RoutineCategory[] = [
  {
    id: "after-waking",
    name: "After waking",
    tone: "emerald",
    sortOrder: 1,
  },
  {
    id: "breakfast",
    name: "Morning with breakfast",
    tone: "amber",
    sortOrder: 2,
  },
  {
    id: "morning",
    name: "Morning",
    tone: "sky",
    sortOrder: 3,
  },
  {
    id: "during-day",
    name: "During the day",
    tone: "sky",
    sortOrder: 4,
  },
  {
    id: "lunch",
    name: "Noon with lunch",
    tone: "rose",
    sortOrder: 5,
  },
  {
    id: "dinner",
    name: "Evening with dinner",
    tone: "violet",
    sortOrder: 6,
  },
  {
    id: "before-bed",
    name: "Before bed",
    tone: "zinc",
    sortOrder: 7,
  },
  {
    id: "anytime",
    name: "Anytime",
    tone: "zinc",
    sortOrder: 8,
  },
];

const DEFAULT_CATEGORY_ID = "other";
const DEFAULT_ROUTINE_CATEGORY_ID = "anytime";

const UNITS = [
  "mg",
  "ml",
  "tablet",
  "capsule",
  "IU",
  "drop",
  "spray",
  "application",
  "other",
];

function createEmptyForm(): MedicationFormState {
  return {
    id: null,
    name: "",
    dosage: "",
    unit: "mg",
    category: DEFAULT_CATEGORY_ID,
    scheduleType: "ordered",
    dayMode: "daily",
    times: ["08:00"],
    timeInput: "08:00",
    order: 1,
    routineCategoryId: DEFAULT_ROUTINE_CATEGORY_ID,
    days: ALL_DAYS,
    notes: "",
  };
}

function createEmptyCategoryForm(): CategoryFormState {
  return {
    id: null,
    name: "",
    tone: "emerald",
  };
}

function createEmptyRoutineCategoryForm(): RoutineCategoryFormState {
  return {
    id: null,
    name: "",
    tone: "emerald",
    sortOrder: 1,
  };
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMedicationName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ensureItemsById<T extends { id: string }>(
  currentItems: T[],
  requiredItems: T[],
) {
  const itemsById = new Map(currentItems.map((item) => [item.id, item]));

  requiredItems.forEach((item) => {
    if (!itemsById.has(item.id)) {
      itemsById.set(item.id, item);
    }
  });

  return Array.from(itemsById.values());
}

function createStarterMedicationPlan(): Medication[] {
  return [
    {
      id: createId(),
      name: "Exforge HCT 5/160/12.5 mg Tablet (amlodipine/valsartan/hydrochlorothiazide)",
      dosage: "1",
      unit: "tablet",
      category: "blood-pressure",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "after-waking",
      },
      notes:
        "Morning blood-pressure medication. Take at the same time each day, preferably in the morning, exactly as prescribed. Because it includes hydrochlorothiazide, morning use can help avoid nighttime urination. Track blood pressure and ask your doctor before changing the dose.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Vitamin D3 2000 IU",
      dosage: "2000",
      unit: "IU",
      category: "vitamins",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "breakfast",
      },
      notes:
        "Daily vitamin D. Entered with breakfast for consistency and because vitamin D is usually easier to remember with food. If your doctor gave a different timing, follow that plan.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Zoloft 50 mg Tablet (sertraline)",
      dosage: "1",
      unit: "tablet",
      category: "mental-health",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "breakfast",
      },
      notes:
        "Daily anxiety medication. Entered with breakfast so it stays at a consistent time each day. Take exactly as prescribed and do not stop suddenly without medical guidance. If it causes sleepiness or stomach upset, ask your doctor about timing.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Skinoren 20% Cream (azelaic acid)",
      dosage: "thin layer",
      unit: "application",
      category: "skin",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "morning",
      },
      notes:
        "Morning skin treatment for dark spots. Apply a thin layer to the target areas after gentle cleansing and drying. Avoid eyes, lips, and irritated skin. Use daytime sunscreen and reduce frequency or contact your dermatologist if irritation becomes strong.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Concor COR 2.5 mg Tablet (bisoprolol) - half tablet",
      dosage: "0.5",
      unit: "tablet",
      category: "heart-rate",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "during-day",
      },
      notes:
        "Heart-rate medication. You said half of a 2.5 mg tablet during the day. Keep the timing consistent, and follow your doctor if they gave a preferred time. Do not stop beta-blockers suddenly unless your doctor tells you to.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Liv.52 Tablet",
      dosage: "2",
      unit: "tablet",
      category: "liver",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "lunch",
      },
      notes:
        "Liver support supplement. You said 2 tablets daily, entered with lunch to make it easy to remember with food. Follow your clinician's instructions if they gave a different plan.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Avodart 0.5 mg Capsule (dutasteride)",
      dosage: "1",
      unit: "capsule",
      category: "hair",
      schedule: {
        type: "ordered",
        dayMode: "even-dates",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "dinner",
      },
      notes:
        "Hair medication. Doctor instructed 0.5 mg on even-numbered days. Swallow the capsule whole; do not chew or open it. MedTrack currently treats even days as even local calendar dates, so confirm if your doctor meant Persian-calendar even days.",
      isActive: true,
    },
    {
      id: createId(),
      name: "NewGel+E Advanced Silicone Gel",
      dosage: "thin layer",
      unit: "application",
      category: "skin",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "before-bed",
      },
      notes:
        "Night skin/scar gel. Apply a very thin layer to clean, dry target skin and let it dry completely before clothing or bedding touches it. Avoid eyes, mucous membranes, and open wounds.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Regaine 5% Minoxidil Topical Solution/Spray",
      dosage: "15",
      unit: "drop",
      category: "hair",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "before-bed",
      },
      notes:
        "Night scalp treatment. Apply 15 drops to the scalp as your current plan says, ideally when the scalp is dry. Let it dry fully before lying down, and do not exceed your doctor or product-label directions.",
      isActive: true,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMedicationCategory(value: unknown): value is MedicationCategory {
  return typeof value === "string" && value.trim().length > 0;
}

function isCategoryTone(value: unknown): value is CategoryTone {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CATEGORY_TONE_CLASSES, value)
  );
}

function isMedicationScheduleType(
  value: unknown,
): value is MedicationScheduleType {
  return value === "timed" || value === "ordered";
}

function isMedicationDayMode(value: unknown): value is MedicationDayMode {
  return (
    value === "daily" ||
    value === "weekdays" ||
    value === "even-dates" ||
    value === "odd-dates"
  );
}

function isWeekDay(value: unknown): value is WeekDay {
  return typeof value === "string" && ALL_DAYS.includes(value as WeekDay);
}

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function normalizeOrder(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 1;

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.max(1, Math.round(numericValue));
}

function normalizeDayMode(
  value: unknown,
  days: WeekDay[],
): MedicationDayMode {
  if (isMedicationDayMode(value)) {
    return value;
  }

  return days.length > 0 && days.length < WEEK_DAYS.length
    ? "weekdays"
    : "daily";
}

function getMedicationDayMode(schedule: {
  dayMode?: MedicationDayMode;
  days: WeekDay[];
}) {
  return normalizeDayMode(schedule.dayMode, schedule.days);
}

function normalizeMedicationCategoryOption(
  value: unknown,
): MedicationCategoryOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id).trim();
  const name = normalizeString(value.name).trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    tone: isCategoryTone(value.tone) ? value.tone : "zinc",
  };
}

function normalizeRoutineCategory(value: unknown): RoutineCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id).trim();
  const name = normalizeString(value.name).trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    tone: isCategoryTone(value.tone) ? value.tone : "zinc",
    sortOrder: normalizeOrder(value.sortOrder),
  };
}

function ensureUniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function getStoredOrDefault<T extends { id: string }>(
  key: string,
  normalizeItem: (value: unknown) => T | null,
  defaults: T[],
) {
  const storedItems = readStoredArray<T>(key, normalizeItem);
  return storedItems.length > 0 ? ensureUniqueById(storedItems) : defaults;
}

function normalizeMedication(value: unknown): Medication | null {
  if (!isRecord(value)) {
    return null;
  }

  const schedule = isRecord(value.schedule) ? value.schedule : {};
  const times = Array.isArray(schedule.times)
    ? schedule.times.flatMap((time) => {
        const normalizedTime = normalizeTime(time);
        return normalizedTime ? [normalizedTime] : [];
      })
    : [];
  const days = Array.isArray(schedule.days)
    ? schedule.days.filter(isWeekDay)
    : [];
  const dayMode = normalizeDayMode(schedule.dayMode, days);
  const scheduleType = isMedicationScheduleType(schedule.type)
    ? schedule.type
    : times.length > 0
      ? "timed"
      : "ordered";
  const groupName = normalizeString(schedule.groupName).trim();
  const routineCategoryId = normalizeString(
    schedule.routineCategoryId,
    DEFAULT_ROUTINE_CATEGORY_ID,
  ).trim();

  return {
    id: normalizeString(value.id, createId()),
    name: normalizeString(value.name, "Unnamed medication"),
    dosage: normalizeString(value.dosage),
    unit: normalizeString(value.unit, "mg"),
    category: isMedicationCategory(value.category)
      ? value.category.trim()
      : DEFAULT_CATEGORY_ID,
    schedule: {
      type: scheduleType,
      dayMode,
      times:
        scheduleType === "timed" && times.length > 0
          ? Array.from(new Set(times)).sort()
          : [],
      days:
        dayMode === "weekdays" && days.length > 0
          ? days
          : [...ALL_DAYS],
      order: scheduleType === "ordered" ? normalizeOrder(schedule.order) : 1,
      routineCategoryId:
        scheduleType === "ordered"
          ? routineCategoryId || DEFAULT_ROUTINE_CATEGORY_ID
          : undefined,
      groupName:
        scheduleType === "ordered" && groupName.length > 0
          ? groupName
          : undefined,
    },
    notes: normalizeString(value.notes),
    isActive: typeof value.isActive === "boolean" ? value.isActive : true,
  };
}

function normalizeIntakeLog(value: unknown): IntakeLog | null {
  if (!isRecord(value)) {
    return null;
  }

  const takenAt = normalizeString(value.takenAt, new Date().toISOString());
  const scheduledTime = normalizeTime(value.scheduledTime);
  const scheduleType = isMedicationScheduleType(value.scheduleType)
    ? value.scheduleType
    : scheduledTime
      ? "timed"
      : "ordered";
  const groupName = normalizeString(value.groupName).trim();
  const routineCategoryId = normalizeString(
    value.routineCategoryId,
    DEFAULT_ROUTINE_CATEGORY_ID,
  ).trim();

  return {
    id: normalizeString(value.id, createId()),
    medicationId: normalizeString(value.medicationId),
    medicationName: normalizeString(value.medicationName, "Medication"),
    dosage: normalizeString(value.dosage),
    unit: normalizeString(value.unit, "mg"),
    category: isMedicationCategory(value.category)
      ? value.category.trim()
      : DEFAULT_CATEGORY_ID,
    scheduleType,
    scheduledTime: scheduleType === "timed" ? scheduledTime ?? "08:00" : null,
    order: scheduleType === "ordered" ? normalizeOrder(value.order) : undefined,
    routineCategoryId:
      scheduleType === "ordered"
        ? routineCategoryId || DEFAULT_ROUTINE_CATEGORY_ID
        : undefined,
    routineCategoryName:
      scheduleType === "ordered"
        ? normalizeString(value.routineCategoryName).trim() || undefined
        : undefined,
    groupName:
      scheduleType === "ordered" && groupName.length > 0
        ? groupName
        : undefined,
    takenAt,
    date: normalizeString(value.date, takenAt.slice(0, 10)),
    status: "taken",
    notes:
      typeof value.notes === "string" && value.notes.length > 0
        ? value.notes
        : undefined,
  };
}

function readStoredArray<T>(
  key: string,
  normalizeItem: (value: unknown) => T | null,
): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.flatMap((item) => {
      const normalizedItem = normalizeItem(item);
      return normalizedItem ? [normalizedItem] : [];
    });
  } catch {
    return [];
  }
}

function writeStoredArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast.error("Unable to save changes in this browser session");
  }
}

function readStoredAuth() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredAuth(shouldStaySignedIn: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (shouldStaySignedIn) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    toast.error("Unable to update the sign-in state for this browser");
  }
}

function formatLogDate(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy h:mm a");
  } catch {
    return value;
  }
}

function formatReadableTime(value: string) {
  const [hourValue, minuteValue] = value.split(":");
  const date = new Date();
  date.setHours(Number(hourValue), Number(minuteValue), 0, 0);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return format(date, "h:mm a");
}

function getTodayDay(date: Date): WeekDay {
  return WEEK_DAYS[date.getDay()].id;
}

function getMedicationDaysLabel(schedule: Medication["schedule"]) {
  const dayMode = getMedicationDayMode(schedule);

  if (dayMode === "daily") {
    return "Daily";
  }

  if (dayMode === "even-dates") {
    return "Even calendar dates";
  }

  if (dayMode === "odd-dates") {
    return "Odd calendar dates";
  }

  return WEEK_DAYS.filter((day) => schedule.days.includes(day.id))
    .map((day) => day.short)
    .join(", ");
}

function isMedicationDueOnDate(medication: Medication, date: Date) {
  const dayMode = getMedicationDayMode(medication.schedule);

  if (dayMode === "daily") {
    return true;
  }

  if (dayMode === "even-dates") {
    return date.getDate() % 2 === 0;
  }

  if (dayMode === "odd-dates") {
    return date.getDate() % 2 === 1;
  }

  return medication.schedule.days.includes(getTodayDay(date));
}

function getMedicationCategoryOption(
  categories: MedicationCategoryOption[],
  categoryId: string,
) {
  return (
    categories.find((category) => category.id === categoryId) ??
    DEFAULT_MEDICATION_CATEGORIES.find((category) => category.id === categoryId) ?? {
      id: categoryId,
      name: "Deleted category",
      tone: "zinc" as const,
    }
  );
}

function getRoutineCategoryOption(
  routineCategories: RoutineCategory[],
  routineCategoryId: string | null | undefined,
) {
  const id = routineCategoryId || DEFAULT_ROUTINE_CATEGORY_ID;

  return (
    routineCategories.find((category) => category.id === id) ??
    DEFAULT_ROUTINE_CATEGORIES.find((category) => category.id === id) ??
    DEFAULT_ROUTINE_CATEGORIES[DEFAULT_ROUTINE_CATEGORIES.length - 1]
  );
}

function getMedicationScheduleType(medication: Medication) {
  if (medication.schedule.type) {
    return medication.schedule.type;
  }

  return medication.schedule.times.length > 0 ? "timed" : "ordered";
}

function getMedicationOrder(medication: Medication) {
  return normalizeOrder(medication.schedule.order);
}

function getMedicationRoutineCategoryId(medication: Medication) {
  return medication.schedule.routineCategoryId ?? DEFAULT_ROUTINE_CATEGORY_ID;
}

function getTodayMedicationKey(entry: TodayMedication) {
  return entry.scheduleType === "timed"
    ? `${entry.medication.id}:time:${entry.time}`
    : `${entry.medication.id}:order:${entry.order ?? 1}`;
}

function isTodayMedicationTaken(
  logs: IntakeLog[],
  medication: Medication,
  scheduleType: MedicationScheduleType,
  todayKey: string,
  time: string | null,
) {
  return logs.some((log) => {
    if (log.medicationId !== medication.id || log.date !== todayKey) {
      return false;
    }

    const logScheduleType =
      log.scheduleType ?? (log.scheduledTime ? "timed" : "ordered");

    if (scheduleType === "timed") {
      return logScheduleType === "timed" && log.scheduledTime === time;
    }

    return logScheduleType === "ordered";
  });
}

function getEntryScheduleLabel(
  entry: TodayMedication,
  routineCategories: RoutineCategory[],
) {
  if (entry.scheduleType === "timed" && entry.time) {
    return `at ${formatReadableTime(entry.time)}`;
  }

  const routineCategory = getRoutineCategoryOption(
    routineCategories,
    entry.routineCategoryId,
  );
  return `step ${entry.order ?? 1} - ${routineCategory.name}`;
}

function getMedicationScheduleLabel(
  medication: Medication,
  routineCategories: RoutineCategory[],
) {
  const scheduleType = getMedicationScheduleType(medication);

  if (scheduleType === "timed") {
    return medication.schedule.times
      .map((time) => formatReadableTime(time))
      .join(", ");
  }

  const routineCategory = getRoutineCategoryOption(
    routineCategories,
    getMedicationRoutineCategoryId(medication),
  );
  return `Step ${getMedicationOrder(medication)} - ${routineCategory.name}`;
}

function getLogScheduleLabel(log: IntakeLog, routineCategories: RoutineCategory[]) {
  const scheduleType =
    log.scheduleType ?? (log.scheduledTime ? "timed" : "ordered");

  if (scheduleType === "timed" && log.scheduledTime) {
    return `scheduled for ${formatReadableTime(log.scheduledTime)}`;
  }

  const routineCategory = log.routineCategoryName
    ? { name: log.routineCategoryName }
    : getRoutineCategoryOption(routineCategories, log.routineCategoryId);
  return `order step ${log.order ?? 1} - ${routineCategory.name}`;
}

export default function MedTrackApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<IntakeLog[]>([]);
  const [categories, setCategories] = useState<MedicationCategoryOption[]>(
    DEFAULT_MEDICATION_CATEGORIES,
  );
  const [routineCategories, setRoutineCategories] = useState<RoutineCategory[]>(
    DEFAULT_ROUTINE_CATEGORIES,
  );
  const [form, setForm] = useState<MedicationFormState>(() =>
    createEmptyForm(),
  );
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(() =>
    createEmptyCategoryForm(),
  );
  const [routineCategoryForm, setRoutineCategoryForm] =
    useState<RoutineCategoryFormState>(() => createEmptyRoutineCategoryForm());
  const [today, setToday] = useState<Date | null>(null);
  const [isStorageReady, setIsStorageReady] = useState(false);

  const todayKey = today ? format(today, "yyyy-MM-dd") : "";
  const todayLabel = today ? format(today, "EEEE, MMMM d") : "";

  useEffect(() => {
    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (isCancelled) {
        return;
      }

      setIsAuthenticated(readStoredAuth());
      const storedMedications = readStoredArray<Medication>(
        MEDICATIONS_STORAGE_KEY,
        normalizeMedication,
      );
      const shouldLoadStarterPlan = storedMedications.length === 0;
      const storedCategories = getStoredOrDefault<MedicationCategoryOption>(
        CATEGORIES_STORAGE_KEY,
        normalizeMedicationCategoryOption,
        DEFAULT_MEDICATION_CATEGORIES,
      );
      const storedRoutineCategories = getStoredOrDefault<RoutineCategory>(
        ROUTINE_CATEGORIES_STORAGE_KEY,
        normalizeRoutineCategory,
        DEFAULT_ROUTINE_CATEGORIES,
      );

      setMedications(
        shouldLoadStarterPlan
          ? createStarterMedicationPlan()
          : storedMedications,
      );
      setLogs(readStoredArray<IntakeLog>(LOGS_STORAGE_KEY, normalizeIntakeLog));
      setCategories(
        shouldLoadStarterPlan
          ? ensureItemsById(storedCategories, DEFAULT_MEDICATION_CATEGORIES)
          : storedCategories,
      );
      setRoutineCategories(
        (
          shouldLoadStarterPlan
            ? ensureItemsById(storedRoutineCategories, DEFAULT_ROUTINE_CATEGORIES)
            : storedRoutineCategories
        ).sort((first, second) => first.sortOrder - second.sortOrder),
      );
      setToday(new Date());
      setIsStorageReady(true);
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredArray(MEDICATIONS_STORAGE_KEY, medications);
  }, [isStorageReady, medications]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredArray(LOGS_STORAGE_KEY, logs);
  }, [isStorageReady, logs]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredArray(CATEGORIES_STORAGE_KEY, categories);
  }, [categories, isStorageReady]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredArray(ROUTINE_CATEGORIES_STORAGE_KEY, routineCategories);
  }, [isStorageReady, routineCategories]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setToday(new Date()),
      60 * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setForm((currentForm) =>
        categories.some((category) => category.id === currentForm.category)
          ? currentForm
          : { ...currentForm, category: categories[0].id },
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [categories]);

  useEffect(() => {
    if (routineCategories.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setForm((currentForm) =>
        routineCategories.some(
          (category) => category.id === currentForm.routineCategoryId,
        )
          ? currentForm
          : { ...currentForm, routineCategoryId: routineCategories[0].id },
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [routineCategories]);

  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.isActive),
    [medications],
  );

  const todayMedications = useMemo<TodayMedication[]>(() => {
    if (!today) {
      return [];
    }

    const entries: TodayMedication[] = [];

    activeMedications
      .filter((medication) => isMedicationDueOnDate(medication, today))
      .forEach((medication) => {
        const scheduleType = getMedicationScheduleType(medication);

        if (scheduleType === "timed") {
          medication.schedule.times.forEach((time) => {
            entries.push({
              medication,
              scheduleType,
              time,
              order: null,
              routineCategoryId: null,
              isTaken: isTodayMedicationTaken(
                logs,
                medication,
                scheduleType,
                todayKey,
                time,
              ),
            });
          });
          return;
        }

        entries.push({
          medication,
          scheduleType,
          time: null,
          order: getMedicationOrder(medication),
          routineCategoryId: getMedicationRoutineCategoryId(medication),
          isTaken: isTodayMedicationTaken(
            logs,
            medication,
            scheduleType,
            todayKey,
            null,
          ),
        });
      });

    return entries
      .sort((first, second) => {
        if (first.scheduleType !== second.scheduleType) {
          return first.scheduleType === "timed" ? -1 : 1;
        }

        if (first.scheduleType === "timed" && second.scheduleType === "timed") {
          return (first.time ?? "").localeCompare(second.time ?? "");
        }

        return (
          (first.order ?? 1) - (second.order ?? 1) ||
          first.medication.name.localeCompare(second.medication.name)
        );
      });
  }, [activeMedications, logs, today, todayKey]);

  const sortedLogs = useMemo(
    () =>
      [...logs].sort(
        (first, second) =>
          new Date(second.takenAt).getTime() - new Date(first.takenAt).getTime(),
      ),
    [logs],
  );

  const takenTodayCount = todayMedications.filter(
    (medication) => medication.isTaken,
  ).length;

  const orderedMedicationGroups = useMemo<OrderedMedicationGroup[]>(() => {
    const groups = new Map<string, TodayMedication[]>();

    todayMedications
      .filter((entry) => entry.scheduleType === "ordered")
      .forEach((entry) => {
        const order = entry.order ?? 1;
        const routineCategoryId =
          entry.routineCategoryId ?? DEFAULT_ROUTINE_CATEGORY_ID;
        const key = `${routineCategoryId}:${order}`;
        groups.set(key, [...(groups.get(key) ?? []), entry]);
      });

    return Array.from(groups.entries())
      .map(([key, entries]) => {
        const [routineCategoryId, rawOrder] = key.split(":");
        const order = normalizeOrder(rawOrder);
        const routineCategory = getRoutineCategoryOption(
          routineCategories,
          routineCategoryId,
        );
        const sortedEntries = [...entries].sort((first, second) =>
          first.medication.name.localeCompare(second.medication.name),
        );
        const takenCount = sortedEntries.filter((entry) => entry.isTaken).length;

        return {
          routineCategoryId: routineCategory.id,
          routineCategoryName: routineCategory.name,
          order,
          entries: sortedEntries,
          takenCount,
          isTaken: takenCount === sortedEntries.length,
        };
      })
      .sort((first, second) => {
        const firstRoutine = getRoutineCategoryOption(
          routineCategories,
          first.routineCategoryId,
        );
        const secondRoutine = getRoutineCategoryOption(
          routineCategories,
          second.routineCategoryId,
        );

        return (
          firstRoutine.sortOrder - secondRoutine.sortOrder ||
          first.order - second.order
        );
      });
  }, [routineCategories, todayMedications]);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      writeStoredAuth(true);
      setIsAuthenticated(true);
      setUsername("");
      setPassword("");
      toast.success("Welcome back to MedTrack");
      return;
    }

    toast.error("Invalid username or password");
  }

  function handleLogout() {
    writeStoredAuth(false);
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    toast.success("Signed out");
  }

  function resetForm() {
    setForm(createEmptyForm());
  }

  function handleAddTime() {
    if (!form.timeInput) {
      toast.error("Choose a time first");
      return;
    }

    if (form.times.includes(form.timeInput)) {
      toast.error("That time is already added");
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      times: [...currentForm.times, currentForm.timeInput].sort(),
    }));
  }

  function handleRemoveTime(time: string) {
    setForm((currentForm) => ({
      ...currentForm,
      times: currentForm.times.filter((currentTime) => currentTime !== time),
    }));
  }

  function handleDayModeChange(dayMode: MedicationDayMode) {
    setForm((currentForm) => ({
      ...currentForm,
      dayMode,
      days: dayMode === "weekdays" ? currentForm.days : [...ALL_DAYS],
    }));
  }

  function handleDayToggle(dayId: WeekDay) {
    setForm((currentForm) => {
      const isSelected = currentForm.days.includes(dayId);
      const nextDays = isSelected
        ? currentForm.days.filter((day) => day !== dayId)
        : [...currentForm.days, dayId];

      return {
        ...currentForm,
        days: nextDays,
      };
    });
  }

  function resetCategoryForm() {
    setCategoryForm(createEmptyCategoryForm());
  }

  function resetRoutineCategoryForm() {
    setRoutineCategoryForm(createEmptyRoutineCategoryForm());
  }

  function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = categoryForm.name.trim();

    if (!name) {
      toast.error("Category name is required");
      return;
    }

    const category: MedicationCategoryOption = {
      id: categoryForm.id ?? createId(),
      name,
      tone: categoryForm.tone,
    };

    setCategories((currentCategories) => {
      if (categoryForm.id) {
        return currentCategories.map((currentCategory) =>
          currentCategory.id === categoryForm.id ? category : currentCategory,
        );
      }

      return [...currentCategories, category];
    });

    toast.success(categoryForm.id ? "Category updated" : "Category added");
    resetCategoryForm();
  }

  function handleEditCategory(category: MedicationCategoryOption) {
    setCategoryForm({
      id: category.id,
      name: category.name,
      tone: category.tone,
    });
  }

  function handleDeleteCategory(category: MedicationCategoryOption) {
    if (categories.length <= 1) {
      toast.error("Keep at least one medication category");
      return;
    }

    const fallbackCategory = categories.find(
      (currentCategory) => currentCategory.id !== category.id,
    );

    if (!fallbackCategory) {
      toast.error("Add another category before deleting this one");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${category.name}? Medications in this category will move to ${fallbackCategory.name}.`,
    );

    if (!shouldDelete) {
      return;
    }

    setCategories((currentCategories) =>
      currentCategories.filter(
        (currentCategory) => currentCategory.id !== category.id,
      ),
    );
    setMedications((currentMedications) =>
      currentMedications.map((medication) =>
        medication.category === category.id
          ? { ...medication, category: fallbackCategory.id }
          : medication,
      ),
    );
    setLogs((currentLogs) =>
      currentLogs.map((log) =>
        log.category === category.id
          ? { ...log, category: fallbackCategory.id }
          : log,
      ),
    );

    if (form.category === category.id) {
      setForm((currentForm) => ({
        ...currentForm,
        category: fallbackCategory.id,
      }));
    }

    if (categoryForm.id === category.id) {
      resetCategoryForm();
    }

    toast.success("Category deleted");
  }

  function handleRoutineCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = routineCategoryForm.name.trim();

    if (!name) {
      toast.error("Routine category name is required");
      return;
    }

    const routineCategory: RoutineCategory = {
      id: routineCategoryForm.id ?? createId(),
      name,
      tone: routineCategoryForm.tone,
      sortOrder: normalizeOrder(routineCategoryForm.sortOrder),
    };

    setRoutineCategories((currentCategories) => {
      const nextCategories = routineCategoryForm.id
        ? currentCategories.map((currentCategory) =>
            currentCategory.id === routineCategoryForm.id
              ? routineCategory
              : currentCategory,
          )
        : [...currentCategories, routineCategory];

      return [...nextCategories].sort(
        (first, second) => first.sortOrder - second.sortOrder,
      );
    });

    toast.success(
      routineCategoryForm.id
        ? "Routine category updated"
        : "Routine category added",
    );
    resetRoutineCategoryForm();
  }

  function handleEditRoutineCategory(category: RoutineCategory) {
    setRoutineCategoryForm({
      id: category.id,
      name: category.name,
      tone: category.tone,
      sortOrder: category.sortOrder,
    });
  }

  function handleDeleteRoutineCategory(category: RoutineCategory) {
    if (routineCategories.length <= 1) {
      toast.error("Keep at least one routine category");
      return;
    }

    const fallbackCategory = routineCategories.find(
      (currentCategory) => currentCategory.id !== category.id,
    );

    if (!fallbackCategory) {
      toast.error("Add another routine category before deleting this one");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${category.name}? Related routine medications will move to ${fallbackCategory.name}.`,
    );

    if (!shouldDelete) {
      return;
    }

    setRoutineCategories((currentCategories) =>
      currentCategories.filter(
        (currentCategory) => currentCategory.id !== category.id,
      ),
    );
    setMedications((currentMedications) =>
      currentMedications.map((medication) =>
        medication.schedule.routineCategoryId === category.id
          ? {
              ...medication,
              schedule: {
                ...medication.schedule,
                routineCategoryId: fallbackCategory.id,
              },
            }
          : medication,
      ),
    );
    setLogs((currentLogs) =>
      currentLogs.map((log) =>
        log.routineCategoryId === category.id
          ? {
              ...log,
              routineCategoryId: fallbackCategory.id,
              routineCategoryName: fallbackCategory.name,
            }
          : log,
      ),
    );

    if (form.routineCategoryId === category.id) {
      setForm((currentForm) => ({
        ...currentForm,
        routineCategoryId: fallbackCategory.id,
      }));
    }

    if (routineCategoryForm.id === category.id) {
      resetRoutineCategoryForm();
    }

    toast.success("Routine category deleted");
  }

  function handleImportStarterPlan() {
    const starterMedications = createStarterMedicationPlan();
    const activeMedicationNames = new Set(
      medications
        .filter((medication) => medication.isActive)
        .map((medication) => normalizeMedicationName(medication.name)),
    );
    const medicationsToAdd = starterMedications.filter(
      (medication) =>
        !activeMedicationNames.has(normalizeMedicationName(medication.name)),
    );

    setCategories((currentCategories) =>
      ensureItemsById(currentCategories, DEFAULT_MEDICATION_CATEGORIES),
    );
    setRoutineCategories((currentCategories) =>
      ensureItemsById(currentCategories, DEFAULT_ROUTINE_CATEGORIES).sort(
        (first, second) => first.sortOrder - second.sortOrder,
      ),
    );

    if (medicationsToAdd.length === 0) {
      toast.error("Starter plan is already in your active medications");
      return;
    }

    setMedications((currentMedications) => [
      ...currentMedications,
      ...medicationsToAdd,
    ]);
    toast.success(`${medicationsToAdd.length} starter medications added`);
  }

  function handleMedicationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const dosage = form.dosage.trim();
    const unit = form.unit.trim();
    const times = Array.from(new Set(form.times)).sort();
    const order = normalizeOrder(form.order);
    const routineCategoryId =
      form.routineCategoryId || DEFAULT_ROUTINE_CATEGORY_ID;
    const selectedDays =
      form.dayMode === "weekdays"
        ? WEEK_DAYS.map((day) => day.id).filter((day) =>
            form.days.includes(day),
          )
        : [...ALL_DAYS];

    if (!name || !dosage || !unit) {
      toast.error("Name, dosage, and unit are required");
      return;
    }

    if (form.scheduleType === "timed" && times.length === 0) {
      toast.error("Add at least one scheduled time");
      return;
    }

    if (form.dayMode === "weekdays" && selectedDays.length === 0) {
      toast.error("Choose at least one day");
      return;
    }

    const medication: Medication = {
      id: form.id ?? createId(),
      name,
      dosage,
      unit,
      category: form.category,
      schedule: {
        type: form.scheduleType,
        dayMode: form.dayMode,
        times: form.scheduleType === "timed" ? times : [],
        days: selectedDays,
        order: form.scheduleType === "ordered" ? order : undefined,
        routineCategoryId:
          form.scheduleType === "ordered" ? routineCategoryId : undefined,
      },
      notes: form.notes.trim(),
      isActive: true,
    };

    setMedications((currentMedications) => {
      if (form.id) {
        return currentMedications.map((currentMedication) =>
          currentMedication.id === form.id ? medication : currentMedication,
        );
      }

      return [...currentMedications, medication];
    });

    toast.success(form.id ? "Medication updated" : "Medication added");
    resetForm();
    setActiveTab("medications");
  }

  function handleEditMedication(medication: Medication) {
    setForm({
      id: medication.id,
      name: medication.name,
      dosage: medication.dosage,
      unit: medication.unit,
      category: medication.category,
      scheduleType: getMedicationScheduleType(medication),
      dayMode: getMedicationDayMode(medication.schedule),
      times: [...medication.schedule.times].sort(),
      timeInput: medication.schedule.times[0] ?? "08:00",
      order: getMedicationOrder(medication),
      routineCategoryId: getMedicationRoutineCategoryId(medication),
      days: [...medication.schedule.days],
      notes: medication.notes,
    });
    setActiveTab("add");
  }

  function handleDeleteMedication(medication: Medication) {
    const shouldRemove = window.confirm(
      `Remove ${medication.name} from active medications?`,
    );

    if (!shouldRemove) {
      return;
    }

    setMedications((currentMedications) =>
      currentMedications.map((currentMedication) =>
        currentMedication.id === medication.id
          ? { ...currentMedication, isActive: false }
          : currentMedication,
      ),
    );
    toast.success("Medication removed");
  }

  function handleMarkAsTaken(entry: TodayMedication) {
    if (!todayKey) {
      toast.error("The schedule is still loading");
      return;
    }

    if (entry.isTaken) {
      toast.error("This dose is already marked as taken");
      return;
    }

    const routineCategory =
      entry.scheduleType === "ordered"
        ? getRoutineCategoryOption(routineCategories, entry.routineCategoryId)
        : null;

    const log: IntakeLog = {
      id: createId(),
      medicationId: entry.medication.id,
      medicationName: entry.medication.name,
      dosage: entry.medication.dosage,
      unit: entry.medication.unit,
      category: entry.medication.category,
      scheduleType: entry.scheduleType,
      scheduledTime: entry.scheduleType === "timed" ? entry.time : null,
      order: entry.scheduleType === "ordered" ? entry.order ?? 1 : undefined,
      routineCategoryId:
        entry.scheduleType === "ordered"
          ? routineCategory?.id ?? DEFAULT_ROUTINE_CATEGORY_ID
          : undefined,
      routineCategoryName:
        entry.scheduleType === "ordered" ? routineCategory?.name : undefined,
      takenAt: new Date().toISOString(),
      date: todayKey,
      status: "taken",
      notes: entry.medication.notes || undefined,
    };

    setLogs((currentLogs) => [log, ...currentLogs]);
    toast.success(`${entry.medication.name} marked as taken`);
  }

  function handleMarkGroupAsTaken(entries: TodayMedication[]) {
    if (!todayKey) {
      toast.error("The schedule is still loading");
      return;
    }

    const pendingEntries = entries.filter((entry) => !entry.isTaken);

    if (pendingEntries.length === 0) {
      toast.error("This step is already marked as taken");
      return;
    }

    const takenAt = new Date().toISOString();
    const nextLogs = pendingEntries.map<IntakeLog>((entry) => ({
      id: createId(),
      medicationId: entry.medication.id,
      medicationName: entry.medication.name,
      dosage: entry.medication.dosage,
      unit: entry.medication.unit,
      category: entry.medication.category,
      scheduleType: entry.scheduleType,
      scheduledTime: null,
      order: entry.order ?? 1,
      routineCategoryId: entry.routineCategoryId ?? DEFAULT_ROUTINE_CATEGORY_ID,
      routineCategoryName: getRoutineCategoryOption(
        routineCategories,
        entry.routineCategoryId,
      ).name,
      takenAt,
      date: todayKey,
      status: "taken",
      notes: entry.medication.notes || undefined,
    }));

    setLogs((currentLogs) => [...nextLogs, ...currentLogs]);
    toast.success("Step marked as taken");
  }

  if (!isStorageReady || !today) {
    return <MedTrackLoading />;
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5faf8] px-4 py-10 text-zinc-950">
        <section className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <HeartPulse className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
                MedTrack
              </h1>
              <p className="text-sm text-zinc-500">
                Personal medication tracking
              </p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-700">
                <UserRound className="h-4 w-4 text-emerald-700" />
                Username
              </span>
              <input
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                type="email"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-700">
                <LockKeyhole className="h-4 w-4 text-emerald-700" />
                Password
              </span>
              <input
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              type="submit"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5faf8] text-zinc-950">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[17rem_1fr]">
        <aside className="border-b border-emerald-100 bg-white px-4 py-4 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <HeartPulse className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-normal">
                  MedTrack
                </p>
                <p className="text-xs text-zinc-500">{todayLabel}</p>
              </div>
            </div>

            <button
              className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 lg:mt-7 lg:w-full lg:justify-center"
              type="button"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition lg:w-full ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800"
                  }`}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {activeTab === "dashboard" && (
            <DashboardView
              activeMedicationCount={activeMedications.length}
              todayMedications={todayMedications}
              orderedMedicationGroups={orderedMedicationGroups}
              takenTodayCount={takenTodayCount}
              logCount={logs.length}
              categories={categories}
              routineCategories={routineCategories}
              onMarkAsTaken={handleMarkAsTaken}
              onMarkGroupAsTaken={handleMarkGroupAsTaken}
              onAddMedication={() => setActiveTab("add")}
            />
          )}

          {activeTab === "medications" && (
            <MedicationListView
              medications={activeMedications}
              categories={categories}
              routineCategories={routineCategories}
              onEdit={handleEditMedication}
              onDelete={handleDeleteMedication}
              onAddMedication={() => setActiveTab("add")}
            />
          )}

          {activeTab === "add" && (
            <MedicationFormView
              form={form}
              setForm={setForm}
              categories={categories}
              routineCategories={routineCategories}
              onSubmit={handleMedicationSubmit}
              onAddTime={handleAddTime}
              onRemoveTime={handleRemoveTime}
              onDayModeChange={handleDayModeChange}
              onDayToggle={handleDayToggle}
              onCancelEdit={() => {
                resetForm();
                setActiveTab("medications");
              }}
            />
          )}

          {activeTab === "history" && (
            <HistoryView
              logs={sortedLogs}
              categories={categories}
              routineCategories={routineCategories}
            />
          )}

          {activeTab === "settings" && (
            <SettingsView
              categories={categories}
              routineCategories={routineCategories}
              categoryForm={categoryForm}
              routineCategoryForm={routineCategoryForm}
              setCategoryForm={setCategoryForm}
              setRoutineCategoryForm={setRoutineCategoryForm}
              onCategorySubmit={handleCategorySubmit}
              onRoutineCategorySubmit={handleRoutineCategorySubmit}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
              onEditRoutineCategory={handleEditRoutineCategory}
              onDeleteRoutineCategory={handleDeleteRoutineCategory}
              onCancelCategoryEdit={resetCategoryForm}
              onCancelRoutineCategoryEdit={resetRoutineCategoryForm}
              onImportStarterPlan={handleImportStarterPlan}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardView({
  activeMedicationCount,
  todayMedications,
  orderedMedicationGroups,
  takenTodayCount,
  logCount,
  categories,
  routineCategories,
  onMarkAsTaken,
  onMarkGroupAsTaken,
  onAddMedication,
}: {
  activeMedicationCount: number;
  todayMedications: TodayMedication[];
  orderedMedicationGroups: OrderedMedicationGroup[];
  takenTodayCount: number;
  logCount: number;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  onMarkGroupAsTaken: (entries: TodayMedication[]) => void;
  onAddMedication: () => void;
}) {
  const timedMedications = todayMedications.filter(
    (entry) => entry.scheduleType === "timed",
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Today's schedule and progress"
        action={
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            type="button"
            onClick={onAddMedication}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add medication
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={CalendarDays}
          label="Due today"
          value={todayMedications.length}
          tone="emerald"
        />
        <StatTile
          icon={CheckCircle2}
          label="Taken today"
          value={takenTodayCount}
          tone="sky"
        />
        <StatTile
          icon={Pill}
          label="Active meds"
          value={activeMedicationCount}
          tone="rose"
        />
        <StatTile
          icon={Activity}
          label="History logs"
          value={logCount}
          tone="amber"
        />
      </div>

      <section className="mt-6 rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Today&apos;s Medications
            </h2>
            <p className="text-sm text-zinc-500">
              {takenTodayCount} of {todayMedications.length} doses completed
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        {todayMedications.length === 0 ? (
          <EmptyState
            icon={Pill}
            title="No medications scheduled today"
            description="Add a medication to build today's schedule."
            actionLabel="Add medication"
            onAction={onAddMedication}
          />
        ) : (
          <div className="space-y-5">
            {timedMedications.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-normal text-zinc-500">
                  Timed doses
                </h3>
                {timedMedications.map((entry) => (
                  <MedicationDoseCard
                    key={getTodayMedicationKey(entry)}
                    entry={entry}
                    categories={categories}
                    routineCategories={routineCategories}
                    onMarkAsTaken={onMarkAsTaken}
                  />
                ))}
              </div>
            )}

            {orderedMedicationGroups.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-normal text-zinc-500">
                  Routine order
                </h3>
                {orderedMedicationGroups.map((group) => (
                  <article
                    key={`order-${group.routineCategoryId}-${group.order}`}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 border-b border-zinc-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-zinc-950">
                            Step {group.order}
                          </h4>
                          {group.entries.length > 1 && (
                            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                              Use together
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">
                          {group.routineCategoryName}
                        </p>
                      </div>
                      <button
                        className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
                          group.isTaken
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                        type="button"
                        onClick={() => onMarkGroupAsTaken(group.entries)}
                        disabled={group.isTaken}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {group.isTaken ? "Step taken" : "Mark Step as Taken"}
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {group.entries.map((entry) => (
                        <MedicationDoseCard
                          key={getTodayMedicationKey(entry)}
                          entry={entry}
                          categories={categories}
                          routineCategories={routineCategories}
                          onMarkAsTaken={onMarkAsTaken}
                          compact
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MedicationDoseCard({
  entry,
  categories,
  routineCategories,
  onMarkAsTaken,
  compact = false,
}: {
  entry: TodayMedication;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  compact?: boolean;
}) {
  const medicationCategory = getMedicationCategoryOption(
    categories,
    entry.medication.category,
  );
  const toneClasses = CATEGORY_TONE_CLASSES[medicationCategory.tone];

  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white ${
        compact ? "p-3" : "p-4"
      } sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="flex gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
            toneClasses.iconClassName
          }`}
        >
          <Pill className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-950">
              {entry.medication.name}
            </h3>
            <CategoryBadge
              categoryId={entry.medication.category}
              categories={categories}
            />
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            {entry.medication.dosage} {entry.medication.unit}{" "}
            {getEntryScheduleLabel(entry, routineCategories)}
          </p>
          {entry.medication.notes && (
            <p className="mt-1 text-sm text-zinc-500">
              {entry.medication.notes}
            </p>
          )}
        </div>
      </div>

      <button
        className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
          entry.isTaken
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
        type="button"
        onClick={() => onMarkAsTaken(entry)}
        disabled={entry.isTaken}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {entry.isTaken ? "Taken" : "Mark as Taken"}
      </button>
    </div>
  );
}

function MedicationListView({
  medications,
  categories,
  routineCategories,
  onEdit,
  onDelete,
  onAddMedication,
}: {
  medications: Medication[];
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onEdit: (medication: Medication) => void;
  onDelete: (medication: Medication) => void;
  onAddMedication: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Medications"
        description="Active medications and schedules"
        action={
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            type="button"
            onClick={onAddMedication}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add medication
          </button>
        }
      />

      {medications.length === 0 ? (
        <section className="rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
          <EmptyState
            icon={ClipboardList}
            title="No active medications"
            description="Add your first medication to start tracking."
            actionLabel="Add medication"
            onAction={onAddMedication}
          />
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {medications.map((medication) => {
            const category = getMedicationCategoryOption(
              categories,
              medication.category,
            );
            const toneClasses = CATEGORY_TONE_CLASSES[category.tone];

            return (
              <article
                key={medication.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
              >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                      toneClasses.iconClassName
                    }`}
                  >
                    <Pill className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">
                        {medication.name}
                      </h2>
                      <CategoryBadge
                        categoryId={medication.category}
                        categories={categories}
                      />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {medication.dosage} {medication.unit}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                    type="button"
                    onClick={() => onEdit(medication)}
                    title="Edit medication"
                    aria-label={`Edit ${medication.name}`}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    type="button"
                    onClick={() => onDelete(medication)}
                    title="Delete medication"
                    aria-label={`Delete ${medication.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-zinc-50 p-3">
                  <dt className="font-medium text-zinc-500">Schedule</dt>
                  <dd className="mt-1 text-zinc-800">
                    {getMedicationScheduleLabel(
                      medication,
                      routineCategories,
                    )}
                  </dd>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <dt className="font-medium text-zinc-500">Days</dt>
                  <dd className="mt-1 text-zinc-800">
                    {getMedicationDaysLabel(medication.schedule)}
                  </dd>
                </div>
              </dl>

              {medication.notes && (
                <p className="mt-4 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
                  {medication.notes}
                </p>
              )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MedicationFormView({
  form,
  setForm,
  categories,
  routineCategories,
  onSubmit,
  onAddTime,
  onRemoveTime,
  onDayModeChange,
  onDayToggle,
  onCancelEdit,
}: {
  form: MedicationFormState;
  setForm: Dispatch<SetStateAction<MedicationFormState>>;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddTime: () => void;
  onRemoveTime: (time: string) => void;
  onDayModeChange: (dayMode: MedicationDayMode) => void;
  onDayToggle: (dayId: WeekDay) => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={form.id ? "Edit Medication" : "Add Medication"}
        description="Medication details and schedule"
      />

      <form
        className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-6"
        onSubmit={onSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Name
            </span>
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              value={form.name}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  name: event.target.value,
                }))
              }
              placeholder="Medication name"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Category
            </span>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              value={form.category}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  category: event.target.value,
                }))
              }
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Dosage
            </span>
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              value={form.dosage}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  dosage: event.target.value,
                }))
              }
              placeholder="10"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Unit
            </span>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              value={form.unit}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  unit: event.target.value,
                }))
              }
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6">
          <span className="mb-2 block text-sm font-medium text-zinc-700">
            Schedule type
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "ordered" as const, label: "Routine order", icon: ClipboardList },
              { id: "timed" as const, label: "Specific times", icon: Clock3 },
            ].map((option) => {
              const Icon = option.icon;
              const isSelected = form.scheduleType === option.id;

              return (
                <button
                  key={option.id}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                  type="button"
                  onClick={() =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      scheduleType: option.id,
                    }))
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {form.scheduleType === "timed" ? (
          <div className="mt-6">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Times
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:max-w-48"
                type="time"
                value={form.timeInput}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    timeInput: event.target.value,
                  }))
                }
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                type="button"
                onClick={onAddTime}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add time
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {form.times.map((time) => (
                <span
                  key={time}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800"
                >
                  {formatReadableTime(time)}
                  <button
                    className="text-emerald-700 transition hover:text-rose-700"
                    type="button"
                    onClick={() => onRemoveTime(time)}
                    title="Remove time"
                    aria-label={`Remove ${formatReadableTime(time)}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Routine category
              </span>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.routineCategoryId}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    routineCategoryId: event.target.value,
                  }))
                }
              >
                {routineCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Step
              </span>
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                type="number"
                min={1}
                step={1}
                value={form.order}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    order: normalizeOrder(event.target.value),
                  }))
                }
              />
            </label>

          </div>
        )}

        <div className="mt-6">
          <span className="mb-3 block text-sm font-medium text-zinc-700">
            Day pattern
          </span>

          <div className="grid gap-2 sm:grid-cols-2">
            {DAY_MODE_OPTIONS.map((option) => {
              const isSelected = form.dayMode === option.id;

              return (
                <button
                  key={option.id}
                  className={`rounded-md border px-3 py-2.5 text-left transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                  type="button"
                  onClick={() => onDayModeChange(option.id)}
                >
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      isSelected ? "text-emerald-50" : "text-zinc-500"
                    }`}
                  >
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          {form.dayMode === "weekdays" && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {WEEK_DAYS.map((day) => {
                const isSelected = form.days.includes(day.id);

                return (
                  <button
                    key={day.id}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                    type="button"
                    onClick={() => onDayToggle(day.id)}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-medium text-zinc-700">
            Notes
          </span>
          <textarea
            className="min-h-28 w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            value={form.notes}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                notes: event.target.value,
              }))
            }
            placeholder="Optional notes"
          />
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {form.id && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              type="button"
              onClick={onCancelEdit}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </button>
          )}
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            type="submit"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {form.id ? "Save medication" : "Add medication"}
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryView({
  logs,
  categories,
  routineCategories,
}: {
  logs: IntakeLog[];
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="History" description="Past intake logs" />

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        {logs.length === 0 ? (
          <EmptyState
            icon={History}
            title="No intake logs yet"
            description="Marked doses will appear here."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const category = getMedicationCategoryOption(
                categories,
                log.category,
              );
              const toneClasses = CATEGORY_TONE_CLASSES[category.tone];

              return (
                <article
                  key={log.id}
                  className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                <div className="flex gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      toneClasses.iconClassName
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">
                        {log.medicationName}
                      </h2>
                      <CategoryBadge
                        categoryId={log.category}
                        categories={categories}
                      />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {log.dosage} {log.unit} -{" "}
                      {getLogScheduleLabel(log, routineCategories)}
                    </p>
                  </div>
                </div>
                <time className="text-sm font-medium text-zinc-500">
                  {formatLogDate(log.takenAt)}
                </time>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsView({
  categories,
  routineCategories,
  categoryForm,
  routineCategoryForm,
  setCategoryForm,
  setRoutineCategoryForm,
  onCategorySubmit,
  onRoutineCategorySubmit,
  onEditCategory,
  onDeleteCategory,
  onEditRoutineCategory,
  onDeleteRoutineCategory,
  onCancelCategoryEdit,
  onCancelRoutineCategoryEdit,
  onImportStarterPlan,
}: {
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  categoryForm: CategoryFormState;
  routineCategoryForm: RoutineCategoryFormState;
  setCategoryForm: Dispatch<SetStateAction<CategoryFormState>>;
  setRoutineCategoryForm: Dispatch<SetStateAction<RoutineCategoryFormState>>;
  onCategorySubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRoutineCategorySubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEditCategory: (category: MedicationCategoryOption) => void;
  onDeleteCategory: (category: MedicationCategoryOption) => void;
  onEditRoutineCategory: (category: RoutineCategory) => void;
  onDeleteRoutineCategory: (category: RoutineCategory) => void;
  onCancelCategoryEdit: () => void;
  onCancelRoutineCategoryEdit: () => void;
  onImportStarterPlan: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Settings"
        description="Categories and routine timing"
        action={
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            type="button"
            onClick={onImportStarterPlan}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Import starter plan
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-zinc-950">
            Medication Categories
          </h2>

          <form className="mt-4 space-y-4" onSubmit={onCategorySubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Name
              </span>
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                placeholder="Category name"
                required
              />
            </label>

            <TonePicker
              value={categoryForm.tone}
              onChange={(tone) =>
                setCategoryForm((currentForm) => ({
                  ...currentForm,
                  tone,
                }))
              }
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {categoryForm.id && (
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  type="button"
                  onClick={onCancelCategoryEdit}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              )}
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                type="submit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {categoryForm.id ? "Save category" : "Add category"}
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3"
              >
                <CategoryBadge categoryId={category.id} categories={categories} />
                <div className="flex gap-2">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                    type="button"
                    onClick={() => onEditCategory(category)}
                    title="Edit category"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    type="button"
                    onClick={() => onDeleteCategory(category)}
                    title="Delete category"
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-zinc-950">
            Routine Timing Categories
          </h2>

          <form className="mt-4 space-y-4" onSubmit={onRoutineCategorySubmit}>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">
                  Name
                </span>
                <input
                  className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={routineCategoryForm.name}
                  onChange={(event) =>
                    setRoutineCategoryForm((currentForm) => ({
                      ...currentForm,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Before bed"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">
                  Order
                </span>
                <input
                  className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  min={1}
                  step={1}
                  type="number"
                  value={routineCategoryForm.sortOrder}
                  onChange={(event) =>
                    setRoutineCategoryForm((currentForm) => ({
                      ...currentForm,
                      sortOrder: normalizeOrder(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <TonePicker
              value={routineCategoryForm.tone}
              onChange={(tone) =>
                setRoutineCategoryForm((currentForm) => ({
                  ...currentForm,
                  tone,
                }))
              }
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {routineCategoryForm.id && (
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  type="button"
                  onClick={onCancelRoutineCategoryEdit}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              )}
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                type="submit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {routineCategoryForm.id
                  ? "Save routine category"
                  : "Add routine category"}
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {routineCategories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RoutineCategoryBadge category={category} />
                  <span className="text-xs font-semibold text-zinc-500">
                    #{category.sortOrder}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                    type="button"
                    onClick={() => onEditRoutineCategory(category)}
                    title="Edit routine category"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    type="button"
                    onClick={() => onDeleteRoutineCategory(category)}
                    title="Delete routine category"
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TonePicker({
  value,
  onChange,
}: {
  value: CategoryTone;
  onChange: (tone: CategoryTone) => void;
}) {
  const tones = Object.keys(CATEGORY_TONE_CLASSES) as CategoryTone[];

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-zinc-700">
        Color
      </legend>
      <div className="flex flex-wrap gap-2">
        {tones.map((tone) => {
          const isSelected = value === tone;

          return (
            <button
              key={tone}
              className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
                isSelected
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-zinc-200 hover:border-emerald-200"
              }`}
              type="button"
              onClick={() => onChange(tone)}
              title={tone}
              aria-label={`Choose ${tone}`}
            >
              <span
                className={`h-4 w-4 rounded-sm ${CATEGORY_TONE_CLASSES[tone].swatchClassName}`}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RoutineCategoryBadge({ category }: { category: RoutineCategory }) {
  const toneClasses = CATEGORY_TONE_CLASSES[category.tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${toneClasses.badgeClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-sm ${toneClasses.dotClassName}`} />
      {category.name}
    </span>
  );
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      {action}
    </header>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: "emerald" | "sky" | "rose" | "amber";
}) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-800",
  };

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">
            {value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneClasses[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

function CategoryBadge({
  categoryId,
  categories,
}: {
  categoryId: MedicationCategory;
  categories: MedicationCategoryOption[];
}) {
  const category = getMedicationCategoryOption(categories, categoryId);
  const toneClasses = CATEGORY_TONE_CLASSES[category.tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${toneClasses.badgeClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-sm ${toneClasses.dotClassName}`} />
      {category.name}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Pill;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>
      {actionLabel && onAction && (
        <button
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          type="button"
          onClick={onAction}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
