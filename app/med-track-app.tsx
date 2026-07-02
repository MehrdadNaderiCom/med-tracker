"use client";

import { addDays, format, isValid, parseISO, subDays } from "date-fns";
import {
  Activity,
  AlarmClock,
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  CloudOff,
  Database,
  Edit3,
  HeartPulse,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Pill,
  Plus,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  takenLogId: string | null;
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

type ReminderSettings = {
  browserNotifications: boolean;
  reminderTimes: Record<string, string>;
};

type AdherenceStats = {
  due: number;
  taken: number;
  rate: number;
  streak: number;
};

type CloudSyncStatus =
  | "loading"
  | "not-configured"
  | "synced"
  | "saving"
  | "error";

type MedTrackSyncData = {
  medications: Medication[];
  logs: IntakeLog[];
  deletedLogIds: string[];
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  careDayKey: string;
  reminderSettings: ReminderSettings;
  personalPlanVersion: number;
  updatedAt: string;
};

const LOGIN_USERNAME = "mail@mehrdadnaderi.com";
const LOGIN_PASSWORD = "Naderi$2050";
const MEDICATIONS_STORAGE_KEY = "medtrack-medications";
const LOGS_STORAGE_KEY = "medtrack-intake-logs";
const DELETED_LOG_IDS_STORAGE_KEY = "medtrack-deleted-log-ids";
const AUTH_STORAGE_KEY = "medtrack-authenticated";
const CATEGORIES_STORAGE_KEY = "medtrack-categories";
const ROUTINE_CATEGORIES_STORAGE_KEY = "medtrack-routine-categories";
const CARE_DAY_STORAGE_KEY = "medtrack-care-day";
const PERSONAL_PLAN_VERSION_STORAGE_KEY = "medtrack-personal-plan-version";
const REMINDER_SETTINGS_STORAGE_KEY = "medtrack-reminder-settings";
const PERSONAL_PLAN_VERSION = 4;
const AUTO_ROLLOVER_HOUR = 12;

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
const EVEN_ROUTINE_DAYS: WeekDay[] = ["saturday", "monday", "wednesday"];
const ODD_ROUTINE_DAYS: WeekDay[] = ["sunday", "tuesday", "thursday"];
const EVEN_ROUTINE_DAYS_LABEL = "Sat, Mon, Wed";
const ODD_ROUTINE_DAYS_LABEL = "Sun, Tue, Thu";

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
    label: "Even routine days",
    description: EVEN_ROUTINE_DAYS_LABEL,
  },
  {
    id: "odd-dates",
    label: "Odd routine days",
    description: ODD_ROUTINE_DAYS_LABEL,
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
    id: "dental-care",
    name: "Dental care",
    tone: "emerald",
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
  "session",
  "other",
];

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  browserNotifications: false,
  reminderTimes: {
    "after-waking": "12:00",
    breakfast: "13:00",
    morning: "13:30",
    "during-day": "18:00",
    lunch: "16:00",
    dinner: "21:00",
    "before-bed": "02:00",
    anytime: "",
  },
};

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
      name: "Oral-B Electric Tooth Brushing - morning",
      dosage: "1",
      unit: "session",
      category: "dental-care",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "after-waking",
      },
      notes:
        "Morning dental care. Brush with fluoride toothpaste after waking. ADA guidance is two minutes, twice daily; if you brush again after acidic food or coffee, wait about 30 minutes.",
      isActive: true,
    },
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
        routineCategoryId: "breakfast",
      },
      notes:
        "Daily blood-pressure medication with breakfast. Exforge HCT can be taken with or without food, but taking it with the same breakfast routine keeps timing consistent. Swallow with water and follow your doctor's dose.",
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
        "Daily vitamin D with breakfast. Vitamin D is fat-soluble, so taking it with a meal that contains some fat can improve absorption. Keep the daily dose as your doctor recommended.",
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
        routineCategoryId: "lunch",
      },
      notes:
        "Daily anxiety medication with lunch. Sertraline can generally be taken morning or evening, with or without food; lunch is entered because it matches your routine. Take it consistently and do not stop suddenly without medical guidance.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Liv.52 Tablet - lunch dose",
      dosage: "1",
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
        "First daily Liv.52 tablet with lunch. Entered as one tablet here and one tablet with dinner so each dose can be checked separately.",
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
        routineCategoryId: "dinner",
      },
      notes:
        "Heart-rate medication with dinner. You said half of a 2.5 mg tablet daily. Keep the time consistent and follow your doctor if they gave a preferred timing. Do not stop beta-blockers suddenly unless your doctor tells you to.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Liv.52 Tablet - dinner dose",
      dosage: "1",
      unit: "tablet",
      category: "liver",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "dinner",
      },
      notes:
        "Second daily Liv.52 tablet with dinner. Split from the old two-tablet entry so lunch and dinner can be tracked independently.",
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
        "Morning skin treatment for dark spots. Apply a thin layer after gentle cleansing and drying. Avoid eyes, lips, and irritated skin. Use daytime sunscreen; reduce frequency or contact your dermatologist if irritation becomes strong.",
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
        order: 4,
        routineCategoryId: "before-bed",
      },
      notes:
        "Hair medication before bed on your even routine days: Saturday, Monday, and Wednesday. Use it alongside your hair spray routine. Swallow the capsule whole; do not chew or open it. Follow your doctor's dosing instructions if they change.",
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
        order: 3,
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
        order: 4,
        routineCategoryId: "before-bed",
      },
      notes:
        "Night scalp treatment. Apply 15 drops to a dry scalp as your current plan says. Let it dry fully before lying down, and do not exceed your doctor or product-label directions.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Dental floss - night",
      dosage: "1",
      unit: "session",
      category: "dental-care",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 5,
        routineCategoryId: "before-bed",
      },
      notes:
        "Night interdental cleaning. Floss once daily; doing it before brushing can remove debris between teeth so brushing can finish the routine more cleanly.",
      isActive: true,
    },
    {
      id: createId(),
      name: "Oral-B Electric Tooth Brushing - before bed",
      dosage: "1",
      unit: "session",
      category: "dental-care",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 6,
        routineCategoryId: "before-bed",
      },
      notes:
        "Night dental care. Brush for two minutes with fluoride toothpaste before sleep. This is separated from floss so each habit can be tracked.",
      isActive: true,
    },
  ];
}

const PERSONAL_PLAN_NAME_MIGRATIONS: Record<string, string> = {
  [normalizeMedicationName("Liv.52 Tablet")]: "Liv.52 Tablet - lunch dose",
};

function mergePersonalMedicationPlan(
  currentMedications: Medication[],
  shouldUpdateKnownItems: boolean,
) {
  const planMedications = createStarterMedicationPlan();
  const planByName = new Map(
    planMedications.map((medication) => [
      normalizeMedicationName(medication.name),
      medication,
    ]),
  );
  const nextMedications = currentMedications.map((medication) => {
    const normalizedName = normalizeMedicationName(medication.name);
    const migratedName = PERSONAL_PLAN_NAME_MIGRATIONS[normalizedName];
    const planMedication = migratedName
      ? planByName.get(normalizeMedicationName(migratedName))
      : planByName.get(normalizedName);

    if (!planMedication || !shouldUpdateKnownItems || !medication.isActive) {
      return medication;
    }

    return {
      ...planMedication,
      id: medication.id,
      isActive: medication.isActive,
    };
  });
  const activeNames = new Set(
    nextMedications
      .filter((medication) => medication.isActive)
      .map((medication) => normalizeMedicationName(medication.name)),
  );
  const missingPlanMedications = planMedications.filter(
    (medication) => !activeNames.has(normalizeMedicationName(medication.name)),
  );

  return [...nextMedications, ...missingPlanMedications];
}

function getDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function getDateFromKey(dateKey: string) {
  const date = parseISO(dateKey);
  return isValid(date) ? date : null;
}

function getDefaultCareDayKey(now: Date) {
  return getDateKey(now.getHours() < AUTO_ROLLOVER_HOUR ? subDays(now, 1) : now);
}

function getCareDayRolloverAt(careDayKey: string) {
  const careDayDate = getDateFromKey(careDayKey);

  if (!careDayDate) {
    return null;
  }

  const rolloverAt = addDays(careDayDate, 1);
  rolloverAt.setHours(AUTO_ROLLOVER_HOUR, 0, 0, 0);
  return rolloverAt;
}

function resolveCareDayKey(storedCareDayKey: string, now: Date) {
  const storedCareDayDate = getDateFromKey(storedCareDayKey);
  const rolloverAt = getCareDayRolloverAt(storedCareDayKey);

  if (!storedCareDayDate || !rolloverAt) {
    return getDefaultCareDayKey(now);
  }

  if (storedCareDayDate.getTime() > addDays(now, 1).getTime()) {
    return getDefaultCareDayKey(now);
  }

  return now.getTime() < rolloverAt.getTime()
    ? storedCareDayKey
    : getDefaultCareDayKey(now);
}

function getNextCareDayKey(careDayKey: string) {
  const careDayDate = getDateFromKey(careDayKey) ?? new Date();
  return getDateKey(addDays(careDayDate, 1));
}

function normalizeReminderSettings(value: unknown): ReminderSettings {
  if (!isRecord(value)) {
    return DEFAULT_REMINDER_SETTINGS;
  }

  const reminderTimes = { ...DEFAULT_REMINDER_SETTINGS.reminderTimes };

  if (isRecord(value.reminderTimes)) {
    Object.entries(value.reminderTimes).forEach(([routineCategoryId, time]) => {
      if (time === "" || normalizeTime(time)) {
        reminderTimes[routineCategoryId] = String(time);
      }
    });
  }

  return {
    browserNotifications: value.browserNotifications === true,
    reminderTimes,
  };
}

function mergeSyncData(
  cloudData: MedTrackSyncData,
  localData: MedTrackSyncData,
): MedTrackSyncData {
  const deletedLogIds = Array.from(
    new Set([...cloudData.deletedLogIds, ...localData.deletedLogIds]),
  );
  const deletedLogIdSet = new Set(deletedLogIds);
  const categories = ensureItemsById(
    [...cloudData.categories, ...localData.categories],
    DEFAULT_MEDICATION_CATEGORIES,
  );
  const routineCategories = ensureItemsById(
    [...cloudData.routineCategories, ...localData.routineCategories],
    DEFAULT_ROUTINE_CATEGORIES,
  ).sort((first, second) => first.sortOrder - second.sortOrder);
  const medicationById = new Map<string, Medication>();
  const medicationIdByName = new Map<string, string>();

  cloudData.medications.forEach((medication) => {
    medicationById.set(medication.id, medication);
    medicationIdByName.set(normalizeMedicationName(medication.name), medication.id);
  });

  localData.medications.forEach((medication) => {
    const normalizedName = normalizeMedicationName(medication.name);

    if (medicationById.has(medication.id) || medicationIdByName.has(normalizedName)) {
      return;
    }

    medicationById.set(medication.id, medication);
    medicationIdByName.set(normalizedName, medication.id);
  });

  const medications = Array.from(medicationById.values());
  const logById = new Map<string, IntakeLog>();

  cloudData.logs.forEach((log) => {
    if (deletedLogIdSet.has(log.id)) {
      return;
    }

    logById.set(log.id, log);
  });

  localData.logs.forEach((log) => {
    if (deletedLogIdSet.has(log.id) || logById.has(log.id)) {
      return;
    }

    const matchingMedicationId = medicationIdByName.get(
      normalizeMedicationName(log.medicationName),
    );
    logById.set(log.id, {
      ...log,
      medicationId: matchingMedicationId ?? log.medicationId,
    });
  });

  return {
    medications,
    logs: Array.from(logById.values()),
    deletedLogIds,
    categories,
    routineCategories,
    careDayKey: cloudData.careDayKey || localData.careDayKey,
    reminderSettings: {
      browserNotifications:
        cloudData.reminderSettings.browserNotifications ||
        localData.reminderSettings.browserNotifications,
      reminderTimes: {
        ...localData.reminderSettings.reminderTimes,
        ...cloudData.reminderSettings.reminderTimes,
      },
    },
    personalPlanVersion: Math.max(
      cloudData.personalPlanVersion,
      localData.personalPlanVersion,
    ),
    updatedAt: cloudData.updatedAt || localData.updatedAt,
  };
}

function normalizeSyncData(
  value: unknown,
  fallbackData: MedTrackSyncData,
  now: Date,
): MedTrackSyncData {
  if (!isRecord(value)) {
    return fallbackData;
  }

  const rawMedications = Array.isArray(value.medications)
    ? value.medications.flatMap((item) => {
        const medication = normalizeMedication(item);
        return medication ? [medication] : [];
      })
    : fallbackData.medications;
  const personalPlanVersion =
    typeof value.personalPlanVersion === "number"
      ? value.personalPlanVersion
      : 0;
  const shouldUpdatePersonalPlan =
    personalPlanVersion < PERSONAL_PLAN_VERSION;
  const medications = shouldUpdatePersonalPlan
    ? mergePersonalMedicationPlan(rawMedications, true)
    : rawMedications;
  const categories = ensureItemsById(
    Array.isArray(value.categories)
      ? value.categories.flatMap((item) => {
          const category = normalizeMedicationCategoryOption(item);
          return category ? [category] : [];
        })
      : fallbackData.categories,
    DEFAULT_MEDICATION_CATEGORIES,
  );
  const routineCategories = ensureItemsById(
    Array.isArray(value.routineCategories)
      ? value.routineCategories.flatMap((item) => {
          const category = normalizeRoutineCategory(item);
          return category ? [category] : [];
        })
      : fallbackData.routineCategories,
    DEFAULT_ROUTINE_CATEGORIES,
  ).sort((first, second) => first.sortOrder - second.sortOrder);
  const careDayKey =
    typeof value.careDayKey === "string"
      ? resolveCareDayKey(value.careDayKey, now)
      : fallbackData.careDayKey;

  const cloudData: MedTrackSyncData = {
    medications,
    logs: Array.isArray(value.logs)
      ? value.logs.flatMap((item) => {
          const log = normalizeIntakeLog(item);
          return log ? [log] : [];
        })
      : fallbackData.logs,
    deletedLogIds: Array.isArray(value.deletedLogIds)
      ? value.deletedLogIds.flatMap((item) => {
          const id = normalizeString(item).trim();
          return id ? [id] : [];
        })
      : [],
    categories,
    routineCategories,
    careDayKey,
    reminderSettings: normalizeReminderSettings(value.reminderSettings),
    personalPlanVersion: PERSONAL_PLAN_VERSION,
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : fallbackData.updatedAt,
  };

  return mergeSyncData(cloudData, fallbackData);
}

function createLocalSyncData(now: Date): MedTrackSyncData {
  const storedPlanVersion = readStoredNumber(PERSONAL_PLAN_VERSION_STORAGE_KEY);
  const shouldUpdatePersonalPlan = storedPlanVersion < PERSONAL_PLAN_VERSION;
  const storedCareDayKey = readStoredString(CARE_DAY_STORAGE_KEY);
  const storedMedications = readStoredArray<Medication>(
    MEDICATIONS_STORAGE_KEY,
    normalizeMedication,
  );
  const shouldLoadStarterPlan =
    storedMedications.length === 0 || shouldUpdatePersonalPlan;
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
  const storedDeletedLogIds = readStoredArray<string>(
    DELETED_LOG_IDS_STORAGE_KEY,
    normalizeStoredString,
  );
  const storedDeletedLogIdSet = new Set(storedDeletedLogIds);
  const storedLogs = readStoredArray<IntakeLog>(
    LOGS_STORAGE_KEY,
    normalizeIntakeLog,
  ).filter((log) => !storedDeletedLogIdSet.has(log.id));

  return {
    medications: shouldLoadStarterPlan
      ? mergePersonalMedicationPlan(storedMedications, shouldUpdatePersonalPlan)
      : storedMedications,
    logs: storedLogs,
    deletedLogIds: storedDeletedLogIds,
    categories: shouldLoadStarterPlan
      ? ensureItemsById(storedCategories, DEFAULT_MEDICATION_CATEGORIES)
      : storedCategories,
    routineCategories: (
      shouldLoadStarterPlan
        ? ensureItemsById(storedRoutineCategories, DEFAULT_ROUTINE_CATEGORIES)
        : storedRoutineCategories
    ).sort((first, second) => first.sortOrder - second.sortOrder),
    careDayKey: resolveCareDayKey(storedCareDayKey, now),
    reminderSettings: normalizeReminderSettings(
      readStoredJson(REMINDER_SETTINGS_STORAGE_KEY),
    ),
    personalPlanVersion: PERSONAL_PLAN_VERSION,
    updatedAt: now.toISOString(),
  };
}

function writeLocalSyncData(data: MedTrackSyncData) {
  writeStoredArray(MEDICATIONS_STORAGE_KEY, data.medications);
  writeStoredArray(LOGS_STORAGE_KEY, data.logs);
  writeStoredArray(DELETED_LOG_IDS_STORAGE_KEY, data.deletedLogIds);
  writeStoredArray(CATEGORIES_STORAGE_KEY, data.categories);
  writeStoredArray(ROUTINE_CATEGORIES_STORAGE_KEY, data.routineCategories);
  writeStoredString(CARE_DAY_STORAGE_KEY, data.careDayKey);
  writeStoredJson(REMINDER_SETTINGS_STORAGE_KEY, data.reminderSettings);
  writeStoredString(
    PERSONAL_PLAN_VERSION_STORAGE_KEY,
    String(PERSONAL_PLAN_VERSION),
  );
}

function createSyncAuthHeader() {
  return `Basic ${window.btoa(`${LOGIN_USERNAME}:${LOGIN_PASSWORD}`)}`;
}

async function readCloudSyncData(fallbackData: MedTrackSyncData, now: Date) {
  const response = await fetch("/api/sync", {
    method: "GET",
    headers: {
      Authorization: createSyncAuthHeader(),
    },
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 503) {
    return {
      configured: false,
      data: fallbackData,
    };
  }

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Cloud sync failed",
    );
  }

  if (!isRecord(payload) || payload.configured !== true) {
    return {
      configured: false,
      data: fallbackData,
    };
  }

  return {
    configured: true,
    data: payload.data
      ? normalizeSyncData(payload.data, fallbackData, now)
      : fallbackData,
  };
}

async function writeCloudSyncData(data: MedTrackSyncData) {
  const response = await fetch("/api/sync", {
    method: "PUT",
    headers: {
      Authorization: createSyncAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 503) {
    return {
      configured: false as const,
      savedAt: "",
    };
  }

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Cloud save failed",
    );
  }

  return {
    configured: true as const,
    savedAt:
      isRecord(payload) && typeof payload.savedAt === "string"
        ? payload.savedAt
        : new Date().toISOString(),
  };
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

function normalizeStoredString(value: unknown) {
  const normalizedValue = normalizeString(value).trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
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

function readStoredJson(key: string): unknown {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast.error("Unable to save changes in this browser session");
  }
}

function readStoredString(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStoredString(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    toast.error("Unable to save changes in this browser session");
  }
}

function readStoredNumber(key: string) {
  const value = Number(readStoredString(key));
  return Number.isFinite(value) ? value : 0;
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

function formatCareDayDate(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy");
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
    return `Even routine days (${EVEN_ROUTINE_DAYS_LABEL})`;
  }

  if (dayMode === "odd-dates") {
    return `Odd routine days (${ODD_ROUTINE_DAYS_LABEL})`;
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

  const todayDay = getTodayDay(date);

  if (dayMode === "even-dates") {
    return EVEN_ROUTINE_DAYS.includes(todayDay);
  }

  if (dayMode === "odd-dates") {
    return ODD_ROUTINE_DAYS.includes(todayDay);
  }

  return medication.schedule.days.includes(todayDay);
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

function getTodayMedicationLog(
  logs: IntakeLog[],
  medication: Medication,
  scheduleType: MedicationScheduleType,
  todayKey: string,
  time: string | null,
) {
  return (
    logs.find((log) => {
      if (log.medicationId !== medication.id || log.date !== todayKey) {
        return false;
      }

      const logScheduleType =
        log.scheduleType ?? (log.scheduledTime ? "timed" : "ordered");

      if (scheduleType === "timed") {
        return logScheduleType === "timed" && log.scheduledTime === time;
      }

      return logScheduleType === "ordered";
    }) ?? null
  );
}

function buildMedicationEntriesForDate(
  activeMedications: Medication[],
  logs: IntakeLog[],
  date: Date,
  dateKey: string,
) {
  const entries: TodayMedication[] = [];

  activeMedications
    .filter((medication) => isMedicationDueOnDate(medication, date))
    .forEach((medication) => {
      const scheduleType = getMedicationScheduleType(medication);

      if (scheduleType === "timed") {
        medication.schedule.times.forEach((time) => {
          const takenLog = getTodayMedicationLog(
            logs,
            medication,
            scheduleType,
            dateKey,
            time,
          );

          entries.push({
            medication,
            scheduleType,
            time,
            order: null,
            routineCategoryId: null,
            isTaken: Boolean(takenLog),
            takenLogId: takenLog?.id ?? null,
          });
        });
        return;
      }

      const takenLog = getTodayMedicationLog(
        logs,
        medication,
        scheduleType,
        dateKey,
        null,
      );

      entries.push({
        medication,
        scheduleType,
        time: null,
        order: getMedicationOrder(medication),
        routineCategoryId: getMedicationRoutineCategoryId(medication),
        isTaken: Boolean(takenLog),
        takenLogId: takenLog?.id ?? null,
      });
    });

  return entries.sort((first, second) => {
    if (first.scheduleType !== second.scheduleType) {
      return first.scheduleType === "timed" ? -1 : 1;
    }

    if (first.scheduleType === "timed" && second.scheduleType === "timed") {
      return (first.time ?? "").localeCompare(second.time ?? "");
    }

    const firstRoutine = first.routineCategoryId ?? DEFAULT_ROUTINE_CATEGORY_ID;
    const secondRoutine = second.routineCategoryId ?? DEFAULT_ROUTINE_CATEGORY_ID;

    return (
      firstRoutine.localeCompare(secondRoutine) ||
      (first.order ?? 1) - (second.order ?? 1) ||
      first.medication.name.localeCompare(second.medication.name)
    );
  });
}

function getAdherenceStats(
  activeMedications: Medication[],
  logs: IntakeLog[],
  endDate: Date,
) {
  let due = 0;
  let taken = 0;
  let streak = 0;
  let isStreakOpen = true;

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = subDays(endDate, dayOffset);
    const dateKey = getDateKey(date);
    const entries = buildMedicationEntriesForDate(
      activeMedications,
      logs,
      date,
      dateKey,
    );
    const dayDue = entries.length;
    const dayTaken = entries.filter((entry) => entry.isTaken).length;

    due += dayDue;
    taken += dayTaken;

    if (isStreakOpen && dayDue > 0 && dayTaken === dayDue) {
      streak += 1;
      continue;
    }

    if (dayDue > 0) {
      isStreakOpen = false;
    }
  }

  return {
    due,
    taken,
    rate: due === 0 ? 0 : Math.round((taken / due) * 100),
    streak,
  };
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
  const [deletedLogIds, setDeletedLogIds] = useState<string[]>([]);
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
  const [careDayKey, setCareDayKey] = useState("");
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(
    DEFAULT_REMINDER_SETTINGS,
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [syncStatus, setSyncStatus] =
    useState<CloudSyncStatus>("loading");
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState("");
  const [syncMessage, setSyncMessage] = useState("Checking cloud database");
  const [isStorageReady, setIsStorageReady] = useState(false);
  const notifiedReminderKeys = useRef<Set<string>>(new Set());

  const careDayDate = useMemo(
    () => (careDayKey ? getDateFromKey(careDayKey) : null),
    [careDayKey],
  );
  const todayKey = careDayKey;
  const todayLabel = careDayDate ? format(careDayDate, "EEEE, MMMM d") : "";
  const currentClockLabel = today ? format(today, "h:mm a") : "";

  useEffect(() => {
    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (isCancelled) {
        return;
      }

      const now = new Date();
      const localData = createLocalSyncData(now);
      let syncData = localData;
      let nextSyncStatus: CloudSyncStatus = "not-configured";
      let nextSyncMessage = "Database is not configured";
      let nextIsCloudConfigured = false;

      try {
        const cloudResult = await readCloudSyncData(localData, now);
        syncData = cloudResult.data;
        nextIsCloudConfigured = cloudResult.configured;
        nextSyncStatus = cloudResult.configured ? "synced" : "not-configured";
        nextSyncMessage = cloudResult.configured
          ? "Cloud sync is active"
          : "Database env variables are missing";
      } catch (error) {
        nextSyncStatus = "error";
        nextSyncMessage =
          error instanceof Error ? error.message : "Cloud sync failed";
      }

      if (isCancelled) {
        return;
      }

      setIsAuthenticated(readStoredAuth());
      setMedications(syncData.medications);
      setLogs(syncData.logs);
      setDeletedLogIds(syncData.deletedLogIds);
      setCategories(syncData.categories);
      setRoutineCategories(syncData.routineCategories);
      setReminderSettings(syncData.reminderSettings);
      setNotificationPermission(
        typeof Notification === "undefined"
          ? "unsupported"
          : Notification.permission,
      );
      setToday(now);
      setCareDayKey(syncData.careDayKey);
      setIsCloudConfigured(nextIsCloudConfigured);
      setSyncStatus(nextSyncStatus);
      setSyncMessage(nextSyncMessage);
      setLastCloudSyncAt(nextIsCloudConfigured ? syncData.updatedAt : "");
      writeLocalSyncData(syncData);
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

    writeStoredArray(DELETED_LOG_IDS_STORAGE_KEY, deletedLogIds);
  }, [deletedLogIds, isStorageReady]);

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
    if (!isStorageReady || !careDayKey) {
      return;
    }

    writeStoredString(CARE_DAY_STORAGE_KEY, careDayKey);
  }, [careDayKey, isStorageReady]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredJson(REMINDER_SETTINGS_STORAGE_KEY, reminderSettings);
  }, [isStorageReady, reminderSettings]);

  useEffect(() => {
    if (!isStorageReady || !isCloudConfigured || !isAuthenticated) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const data: MedTrackSyncData = {
        medications,
        logs,
        deletedLogIds,
        categories,
        routineCategories,
        careDayKey,
        reminderSettings,
        personalPlanVersion: PERSONAL_PLAN_VERSION,
        updatedAt: new Date().toISOString(),
      };

      setSyncStatus("saving");
      setSyncMessage("Saving to cloud database");

      try {
        const result = await writeCloudSyncData(data);

        if (!result.configured) {
          setIsCloudConfigured(false);
          setSyncStatus("not-configured");
          setSyncMessage("Database env variables are missing");
          return;
        }

        setSyncStatus("synced");
        setSyncMessage("Cloud sync is active");
        setLastCloudSyncAt(result.savedAt);
      } catch (error) {
        setSyncStatus("error");
        setSyncMessage(
          error instanceof Error ? error.message : "Cloud save failed",
        );
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [
    careDayKey,
    categories,
    deletedLogIds,
    isAuthenticated,
    isCloudConfigured,
    isStorageReady,
    logs,
    medications,
    reminderSettings,
    routineCategories,
  ]);

  useEffect(() => {
    if (!isStorageReady || !isCloudConfigured || !isAuthenticated) {
      return;
    }

    async function refreshFromCloud() {
      const now = new Date();
      const fallbackData: MedTrackSyncData = {
        medications,
        logs,
        deletedLogIds,
        categories,
        routineCategories,
        careDayKey,
        reminderSettings,
        personalPlanVersion: PERSONAL_PLAN_VERSION,
        updatedAt: new Date().toISOString(),
      };

      try {
        const cloudResult = await readCloudSyncData(fallbackData, now);

        if (!cloudResult.configured) {
          setIsCloudConfigured(false);
          setSyncStatus("not-configured");
          setSyncMessage("Database env variables are missing");
          return;
        }

        setMedications(cloudResult.data.medications);
        setLogs(cloudResult.data.logs);
        setDeletedLogIds(cloudResult.data.deletedLogIds);
        setCategories(cloudResult.data.categories);
        setRoutineCategories(cloudResult.data.routineCategories);
        setCareDayKey(cloudResult.data.careDayKey);
        setReminderSettings(cloudResult.data.reminderSettings);
        setSyncStatus("synced");
        setSyncMessage("Cloud sync is active");
        setLastCloudSyncAt(cloudResult.data.updatedAt);
        writeLocalSyncData(cloudResult.data);
      } catch {
        setSyncStatus("error");
        setSyncMessage("Could not refresh cloud data");
      }
    }

    function handleFocus() {
      void refreshFromCloud();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshFromCloud();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    careDayKey,
    categories,
    deletedLogIds,
    isAuthenticated,
    isCloudConfigured,
    isStorageReady,
    logs,
    medications,
    reminderSettings,
    routineCategories,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setToday(now);
      setCareDayKey((currentCareDayKey) =>
        resolveCareDayKey(currentCareDayKey, now),
      );
    }, 60 * 1000);

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
    if (!careDayDate || !todayKey) {
      return [];
    }

    return buildMedicationEntriesForDate(
      activeMedications,
      logs,
      careDayDate,
      todayKey,
    );
  }, [activeMedications, careDayDate, logs, todayKey]);

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

  const adherenceStats = useMemo<AdherenceStats>(
    () =>
      getAdherenceStats(
        activeMedications,
        logs,
        careDayDate ?? today ?? new Date(),
      ),
    [activeMedications, careDayDate, logs, today],
  );

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

  const pendingTodayCount = todayMedications.length - takenTodayCount;

  useEffect(() => {
    if (
      !isStorageReady ||
      !today ||
      !todayKey ||
      !reminderSettings.browserNotifications
    ) {
      return;
    }

    const currentTime = format(today, "HH:mm");

    orderedMedicationGroups
      .filter((group) => !group.isTaken)
      .forEach((group) => {
        const reminderTime = reminderSettings.reminderTimes[group.routineCategoryId];
        const notificationKey = `${todayKey}:${group.routineCategoryId}:${group.order}:${reminderTime}`;

        if (
          !reminderTime ||
          reminderTime !== currentTime ||
          notifiedReminderKeys.current.has(notificationKey)
        ) {
          return;
        }

        notifiedReminderKeys.current.add(notificationKey);
        toast.info(
          `${group.routineCategoryName}: ${group.entries.length - group.takenCount} pending item(s)`,
        );

        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification("MedTrack reminder", {
            body: `${group.routineCategoryName}: ${group.entries.length - group.takenCount} item(s) still pending.`,
          });
        }
      });
  }, [
    isStorageReady,
    orderedMedicationGroups,
    reminderSettings.browserNotifications,
    reminderSettings.reminderTimes,
    today,
    todayKey,
  ]);

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

  function handleEndCareDay() {
    if (!todayKey) {
      toast.error("The care day is still loading");
      return;
    }

    const nextCareDayKey = getNextCareDayKey(todayKey);
    setCareDayKey(nextCareDayKey);
    notifiedReminderKeys.current.clear();
    toast.success(`Care day moved to ${format(parseISO(nextCareDayKey), "MMM d")}`);
  }

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      toast.error("Browser notifications are not supported here");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setReminderSettings((currentSettings) => ({
        ...currentSettings,
        browserNotifications: true,
      }));
      toast.success("Browser reminders enabled");
      return;
    }

    toast.error("Notifications are blocked by the browser");
  }

  function handleToggleBrowserNotifications(isEnabled: boolean) {
    if (isEnabled && notificationPermission !== "granted") {
      void handleEnableNotifications();
      return;
    }

    setReminderSettings((currentSettings) => ({
      ...currentSettings,
      browserNotifications: isEnabled,
    }));
  }

  function handleReminderTimeChange(routineCategoryId: string, time: string) {
    if (time && !normalizeTime(time)) {
      toast.error("Use a valid reminder time");
      return;
    }

    setReminderSettings((currentSettings) => ({
      ...currentSettings,
      reminderTimes: {
        ...currentSettings.reminderTimes,
        [routineCategoryId]: time,
      },
    }));
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
    const nextMedications = mergePersonalMedicationPlan(medications, true);

    setCategories((currentCategories) =>
      ensureItemsById(currentCategories, DEFAULT_MEDICATION_CATEGORIES),
    );
    setRoutineCategories((currentCategories) =>
      ensureItemsById(currentCategories, DEFAULT_ROUTINE_CATEGORIES).sort(
        (first, second) => first.sortOrder - second.sortOrder,
      ),
    );
    writeStoredString(
      PERSONAL_PLAN_VERSION_STORAGE_KEY,
      String(PERSONAL_PLAN_VERSION),
    );

    if (JSON.stringify(nextMedications) === JSON.stringify(medications)) {
      toast.error("Personal plan is already up to date");
      return;
    }

    setMedications(nextMedications);
    toast.success("Personal plan updated");
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

  function rememberDeletedLogIds(logIds: string[]) {
    if (logIds.length === 0) {
      return;
    }

    setDeletedLogIds((currentIds) =>
      Array.from(new Set([...currentIds, ...logIds])),
    );
  }

  function handleUndoTaken(entry: TodayMedication) {
    if (!entry.takenLogId) {
      toast.error("There is no completed log to undo");
      return;
    }

    rememberDeletedLogIds([entry.takenLogId]);
    setLogs((currentLogs) =>
      currentLogs.filter((log) => log.id !== entry.takenLogId),
    );
    toast.success(`${entry.medication.name} moved back to pending`);
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

  function handleUndoGroupTaken(entries: TodayMedication[]) {
    const logIds = entries.flatMap((entry) =>
      entry.takenLogId ? [entry.takenLogId] : [],
    );

    if (logIds.length === 0) {
      toast.error("There is nothing completed in this step to undo");
      return;
    }

    rememberDeletedLogIds(logIds);
    const logIdSet = new Set(logIds);
    setLogs((currentLogs) =>
      currentLogs.filter((log) => !logIdSet.has(log.id)),
    );
    toast.success("Step moved back to pending");
  }

  function handleMarkPastAsTaken(entry: TodayMedication, dateKey: string) {
    if (entry.isTaken) {
      toast.error("This dose is already marked as taken for that care day");
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
      date: dateKey,
      status: "taken",
      notes: "Backfilled from History",
    };

    setLogs((currentLogs) => [log, ...currentLogs]);
    toast.success(`${entry.medication.name} backfilled`);
  }

  function handleDeleteLog(log: IntakeLog) {
    const shouldDelete = window.confirm(
      `Delete the history log for ${log.medicationName}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setLogs((currentLogs) =>
      currentLogs.filter((currentLog) => currentLog.id !== log.id),
    );
    rememberDeletedLogIds([log.id]);
    toast.success("History log deleted");
  }

  if (!isStorageReady || !today || !todayKey || !careDayDate) {
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

          <SyncStatusPanel
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            isCloudConfigured={isCloudConfigured}
            lastCloudSyncAt={lastCloudSyncAt}
          />
        </aside>

        <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {activeTab === "dashboard" && (
            <DashboardView
              activeMedicationCount={activeMedications.length}
              todayMedications={todayMedications}
              orderedMedicationGroups={orderedMedicationGroups}
              takenTodayCount={takenTodayCount}
              pendingTodayCount={pendingTodayCount}
              logCount={logs.length}
              careDayLabel={todayLabel}
              currentClockLabel={currentClockLabel}
              adherenceStats={adherenceStats}
              reminderSettings={reminderSettings}
              categories={categories}
              routineCategories={routineCategories}
              onMarkAsTaken={handleMarkAsTaken}
              onUndoTaken={handleUndoTaken}
              onMarkGroupAsTaken={handleMarkGroupAsTaken}
              onUndoGroupTaken={handleUndoGroupTaken}
              onAddMedication={() => setActiveTab("add")}
              onEndCareDay={handleEndCareDay}
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
              activeMedications={activeMedications}
              careDayKey={todayKey}
              categories={categories}
              routineCategories={routineCategories}
              onMarkPastAsTaken={handleMarkPastAsTaken}
              onDeleteLog={handleDeleteLog}
            />
          )}

          {activeTab === "settings" && (
            <SettingsView
              categories={categories}
              routineCategories={routineCategories}
              categoryForm={categoryForm}
              routineCategoryForm={routineCategoryForm}
              reminderSettings={reminderSettings}
              notificationPermission={notificationPermission}
              setCategoryForm={setCategoryForm}
              setRoutineCategoryForm={setRoutineCategoryForm}
              onReminderTimeChange={handleReminderTimeChange}
              onToggleBrowserNotifications={handleToggleBrowserNotifications}
              onEnableNotifications={handleEnableNotifications}
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
  pendingTodayCount,
  logCount,
  careDayLabel,
  currentClockLabel,
  adherenceStats,
  reminderSettings,
  categories,
  routineCategories,
  onMarkAsTaken,
  onUndoTaken,
  onMarkGroupAsTaken,
  onUndoGroupTaken,
  onAddMedication,
  onEndCareDay,
}: {
  activeMedicationCount: number;
  todayMedications: TodayMedication[];
  orderedMedicationGroups: OrderedMedicationGroup[];
  takenTodayCount: number;
  pendingTodayCount: number;
  logCount: number;
  careDayLabel: string;
  currentClockLabel: string;
  adherenceStats: AdherenceStats;
  reminderSettings: ReminderSettings;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  onUndoTaken: (entry: TodayMedication) => void;
  onMarkGroupAsTaken: (entries: TodayMedication[]) => void;
  onUndoGroupTaken: (entries: TodayMedication[]) => void;
  onAddMedication: () => void;
  onEndCareDay: () => void;
}) {
  const timedMedications = todayMedications.filter(
    (entry) => entry.scheduleType === "timed",
  );
  const pendingTimedMedications = timedMedications.filter(
    (entry) => !entry.isTaken,
  );
  const completedTimedMedications = timedMedications.filter(
    (entry) => entry.isTaken,
  );
  const buildOrderedSections = (entryFilter: (entry: TodayMedication) => boolean) =>
    routineCategories
      .map((routineCategory) => ({
        routineCategory,
        groups: orderedMedicationGroups.flatMap((group) => {
          if (group.routineCategoryId !== routineCategory.id) {
            return [];
          }

          const entries = group.entries.filter(entryFilter);

          if (entries.length === 0) {
            return [];
          }

          const takenCount = entries.filter((entry) => entry.isTaken).length;

          return [
            {
              ...group,
              entries,
              takenCount,
              isTaken: takenCount === entries.length,
            },
          ];
        }),
      }))
      .filter((section) => section.groups.length > 0);
  const pendingOrderedSections = buildOrderedSections((entry) => !entry.isTaken);
  const completedOrderedSections = buildOrderedSections((entry) => entry.isTaken);
  const completedOrderedCount = completedOrderedSections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.groups.reduce(
        (groupTotal, group) => groupTotal + group.entries.length,
        0,
      ),
    0,
  );
  const completedChecklistCount =
    completedTimedMedications.length + completedOrderedCount;
  const hasPendingChecklistItems =
    pendingTimedMedications.length > 0 || pendingOrderedSections.length > 0;
  const completionRate =
    todayMedications.length === 0
      ? 0
      : Math.round((takenTodayCount / todayMedications.length) * 100);
  const pendingGroups = orderedMedicationGroups.filter((group) => !group.isTaken);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Care-day schedule and progress"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50"
              type="button"
              onClick={onEndCareDay}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              End care day
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              type="button"
              onClick={onAddMedication}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add medication
            </button>
          </div>
        }
      />

      <section className="mb-4 rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xl font-semibold text-white">
              {completionRate}%
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-950">
                  {careDayLabel}
                </h2>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Care day
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">
                Current clock: {currentClockLabel}. This care day stays open
                past midnight and rolls over automatically after noon tomorrow,
                unless you end it manually.
              </p>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 lg:w-64">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </section>

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
          icon={AlarmClock}
          label="Still pending"
          value={pendingTodayCount}
          tone="rose"
        />
        <StatTile
          icon={BarChart3}
          label="7-day adherence"
          value={`${adherenceStats.rate}%`}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">
                Care Checklist
              </h2>
              <p className="text-sm text-zinc-500">
                {takenTodayCount} of {todayMedications.length} items completed
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>

          {todayMedications.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No items scheduled today"
              description="Add a medication or care routine to build today's checklist."
              actionLabel="Add medication"
              onAction={onAddMedication}
            />
          ) : (
            <div className="space-y-4">
              {hasPendingChecklistItems ? (
                <>
                  {pendingTimedMedications.length > 0 && (
                    <section className="rounded-lg border border-zinc-200 p-3">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-normal text-zinc-500">
                        Timed doses
                      </h3>
                      <div className="space-y-2">
                        {pendingTimedMedications.map((entry) => (
                          <MedicationDoseCard
                            key={getTodayMedicationKey(entry)}
                            entry={entry}
                            categories={categories}
                            routineCategories={routineCategories}
                            onMarkAsTaken={onMarkAsTaken}
                            onUndoTaken={onUndoTaken}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {pendingOrderedSections.map((section) => (
                    <RoutineChecklistSection
                      key={section.routineCategory.id}
                      routineCategory={section.routineCategory}
                      groups={section.groups}
                      categories={categories}
                      routineCategories={routineCategories}
                      onMarkAsTaken={onMarkAsTaken}
                      onUndoTaken={onUndoTaken}
                      onMarkGroupAsTaken={onMarkGroupAsTaken}
                      onUndoGroupTaken={onUndoGroupTaken}
                    />
                  ))}
                </>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-emerald-950">
                        No pending items
                      </h3>
                      <p className="text-sm text-emerald-800">
                        Completed items are grouped below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {completedChecklistCount > 0 && (
                <section className="rounded-lg border border-zinc-200 bg-zinc-50">
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-white"
                    type="button"
                    onClick={() =>
                      setIsCompletedOpen((currentValue) => !currentValue)
                    }
                    aria-expanded={isCompletedOpen}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-zinc-950">
                          Completed today
                        </span>
                        <span className="block text-xs font-medium text-zinc-500">
                          {`${completedChecklistCount} ${
                            completedChecklistCount === 1 ? "item" : "items"
                          } done`}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-zinc-500 transition ${
                        isCompletedOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {isCompletedOpen && (
                    <div className="space-y-3 border-t border-zinc-200 p-3">
                      {completedTimedMedications.length > 0 && (
                        <section className="rounded-lg border border-zinc-200 bg-white p-3">
                          <h3 className="mb-3 text-sm font-semibold uppercase tracking-normal text-zinc-500">
                            Timed doses
                          </h3>
                          <div className="space-y-2">
                            {completedTimedMedications.map((entry) => (
                              <MedicationDoseCard
                                key={getTodayMedicationKey(entry)}
                                entry={entry}
                                categories={categories}
                                routineCategories={routineCategories}
                                onMarkAsTaken={onMarkAsTaken}
                                onUndoTaken={onUndoTaken}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {completedOrderedSections.map((section) => (
                        <RoutineChecklistSection
                          key={`completed-${section.routineCategory.id}`}
                          routineCategory={section.routineCategory}
                          groups={section.groups}
                          categories={categories}
                          routineCategories={routineCategories}
                          onMarkAsTaken={onMarkAsTaken}
                          onUndoTaken={onUndoTaken}
                          onMarkGroupAsTaken={onMarkGroupAsTaken}
                          onUndoGroupTaken={onUndoGroupTaken}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-700" />
              <h2 className="font-semibold text-zinc-950">Reports</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Active items</dt>
                <dd className="font-semibold text-zinc-900">
                  {activeMedicationCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">History logs</dt>
                <dd className="font-semibold text-zinc-900">{logCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">7-day taken</dt>
                <dd className="font-semibold text-zinc-900">
                  {adherenceStats.taken}/{adherenceStats.due}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Perfect-day streak</dt>
                <dd className="font-semibold text-zinc-900">
                  {adherenceStats.streak}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-700" />
              <h2 className="font-semibold text-zinc-950">Reminders</h2>
            </div>
            <div className="mt-4 space-y-2">
              {pendingGroups.length === 0 ? (
                <p className="rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                  Everything scheduled for this care day is done.
                </p>
              ) : (
                pendingGroups.slice(0, 5).map((group) => (
                  <div
                    key={`pending-${group.routineCategoryId}-${group.order}`}
                    className="rounded-md border border-zinc-200 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-900">
                        {group.routineCategoryName}
                      </span>
                      <span className="text-xs font-semibold text-zinc-500">
                        {reminderSettings.reminderTimes[group.routineCategoryId] ||
                          "No time"}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-500">
                      Step {group.order}: {group.entries.length - group.takenCount}{" "}
                      pending
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RoutineChecklistSection({
  routineCategory,
  groups,
  categories,
  routineCategories,
  onMarkAsTaken,
  onUndoTaken,
  onMarkGroupAsTaken,
  onUndoGroupTaken,
}: {
  routineCategory: RoutineCategory;
  groups: OrderedMedicationGroup[];
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  onUndoTaken: (entry: TodayMedication) => void;
  onMarkGroupAsTaken: (entries: TodayMedication[]) => void;
  onUndoGroupTaken: (entries: TodayMedication[]) => void;
}) {
  const totalEntries = groups.reduce(
    (sum, group) => sum + group.entries.length,
    0,
  );
  const totalTaken = groups.reduce((sum, group) => sum + group.takenCount, 0);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <RoutineCategoryBadge category={routineCategory} />
          <span className="text-sm font-semibold text-zinc-500">
            {totalTaken}/{totalEntries}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 sm:w-40">
          <div
            className="h-full rounded-full bg-emerald-600"
            style={{
              width: `${totalEntries === 0 ? 0 : Math.round((totalTaken / totalEntries) * 100)}%`,
            }}
          />
        </div>
      </div>

      <div className="space-y-3 p-3">
        {groups.map((group) => (
          <div
            key={`${group.routineCategoryId}-${group.order}`}
            className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3"
          >
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-950">
                    Step {group.order} - {group.routineCategoryName}
                  </h3>
                  {group.entries.length > 1 && (
                    <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                      Use together
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-zinc-500">
                  {group.takenCount}/{group.entries.length} done
                  {group.entries.length - group.takenCount > 0
                    ? `, ${group.entries.length - group.takenCount} pending`
                    : ""}
                </p>
              </div>
              <div className="grid gap-2 sm:flex sm:shrink-0">
                {group.takenCount > 0 && (
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:w-auto"
                    type="button"
                    onClick={() => onUndoGroupTaken(group.entries)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Undo Step {group.order}
                  </button>
                )}
                {!group.isTaken && (
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 sm:w-auto"
                    type="button"
                    onClick={() => onMarkGroupAsTaken(group.entries)}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Mark Step {group.order}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {group.entries.map((entry) => (
                <MedicationDoseCard
                  key={getTodayMedicationKey(entry)}
                  entry={entry}
                  categories={categories}
                  routineCategories={routineCategories}
                  onMarkAsTaken={onMarkAsTaken}
                  onUndoTaken={onUndoTaken}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MedicationDoseCard({
  entry,
  categories,
  routineCategories,
  onMarkAsTaken,
  onUndoTaken,
}: {
  entry: TodayMedication;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  onUndoTaken: (entry: TodayMedication) => void;
}) {
  const medicationCategory = getMedicationCategoryOption(
    categories,
    entry.medication.category,
  );
  const toneClasses = CATEGORY_TONE_CLASSES[medicationCategory.tone];
  const actionLabel = entry.isTaken ? "Undo done" : "Mark done";
  const ActionIcon = entry.isTaken ? RotateCcw : Check;

  return (
    <div
      className={`grid gap-3 rounded-md border p-3 transition sm:grid-cols-[auto_1fr_auto] sm:items-start ${
        entry.isTaken
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-zinc-200 bg-white hover:border-emerald-200"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-md ${
          entry.isTaken
            ? "bg-emerald-600 text-white"
            : toneClasses.iconClassName
        }`}
        aria-hidden="true"
      >
        {entry.isTaken ? (
          <Check className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Pill className="h-5 w-5" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={`font-semibold ${
              entry.isTaken ? "text-emerald-950" : "text-zinc-950"
            }`}
          >
            {entry.medication.name}
          </h3>
          <CategoryBadge
            categoryId={entry.medication.category}
            categories={categories}
          />
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {entry.medication.dosage} {entry.medication.unit} -{" "}
          {getEntryScheduleLabel(entry, routineCategories)}
        </p>
        {entry.medication.notes && (
          <p className="mt-1 text-sm leading-5 text-zinc-500">
            {entry.medication.notes}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:w-32">
        <span
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
            entry.isTaken
              ? "bg-emerald-100 text-emerald-800"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {entry.isTaken ? "Taken" : "Pending"}
        </span>
        <button
          className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${
            entry.isTaken
              ? "border border-zinc-200 bg-white text-zinc-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              : "border border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
          type="button"
          onClick={() => (entry.isTaken ? onUndoTaken(entry) : onMarkAsTaken(entry))}
          title={actionLabel}
          aria-label={`${actionLabel} for ${entry.medication.name}`}
        >
          <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel}
        </button>
      </div>
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
  activeMedications,
  careDayKey,
  categories,
  routineCategories,
  onMarkPastAsTaken,
  onDeleteLog,
}: {
  logs: IntakeLog[];
  activeMedications: Medication[];
  careDayKey: string;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkPastAsTaken: (entry: TodayMedication, dateKey: string) => void;
  onDeleteLog: (log: IntakeLog) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(careDayKey);
  const selectedDateObject = getDateFromKey(selectedDate) ?? new Date();
  const backfillEntries = buildMedicationEntriesForDate(
    activeMedications,
    logs,
    selectedDateObject,
    selectedDate,
  );
  const missingEntries = backfillEntries.filter((entry) => !entry.isTaken);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="History" description="Past intake logs" />

      <section className="mb-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Backfill a Care Day
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a day, then mark anything you actually took but forgot to
              check.
            </p>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Care day
            </span>
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:w-48"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
              Scheduled
            </p>
            <p className="mt-1 text-2xl font-semibold text-zinc-950">
              {backfillEntries.length}
            </p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
              Already logged
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">
              {backfillEntries.length - missingEntries.length}
            </p>
          </div>
          <div className="rounded-md bg-rose-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-rose-700">
              Missing
            </p>
            <p className="mt-1 text-2xl font-semibold text-rose-900">
              {missingEntries.length}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {backfillEntries.length === 0 ? (
            <p className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-500">
              No scheduled items for this care day.
            </p>
          ) : (
            backfillEntries.map((entry) => (
              <div
                key={`${selectedDate}-${getTodayMedicationKey(entry)}`}
                className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
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
                  <p className="mt-1 text-sm text-zinc-500">
                    {entry.medication.dosage} {entry.medication.unit} -{" "}
                    {getEntryScheduleLabel(entry, routineCategories)}
                  </p>
                </div>
                <button
                  className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    entry.isTaken
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                  type="button"
                  disabled={entry.isTaken}
                  onClick={() => onMarkPastAsTaken(entry, selectedDate)}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {entry.isTaken ? "Logged" : "Backfill"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Intake Logs
            </h2>
            <p className="text-sm text-zinc-500">
              Delete a mistaken log or review past care days.
            </p>
          </div>
          <History className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        </div>

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
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      Care day: {formatCareDayDate(log.date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <time className="text-sm font-medium text-zinc-500">
                    {formatLogDate(log.takenAt)}
                  </time>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    type="button"
                    onClick={() => onDeleteLog(log)}
                    title="Delete log"
                    aria-label={`Delete history log for ${log.medicationName}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
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
  reminderSettings,
  notificationPermission,
  setCategoryForm,
  setRoutineCategoryForm,
  onReminderTimeChange,
  onToggleBrowserNotifications,
  onEnableNotifications,
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
  reminderSettings: ReminderSettings;
  notificationPermission: NotificationPermission | "unsupported";
  setCategoryForm: Dispatch<SetStateAction<CategoryFormState>>;
  setRoutineCategoryForm: Dispatch<SetStateAction<RoutineCategoryFormState>>;
  onReminderTimeChange: (routineCategoryId: string, time: string) => void;
  onToggleBrowserNotifications: (isEnabled: boolean) => void;
  onEnableNotifications: () => void;
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

        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-zinc-950">
                  Reminders and Alarms
                </h2>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">
                In-app reminders always show as toast messages while MedTrack is
                open. Browser notifications also work when permission is granted.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                type="button"
                onClick={onEnableNotifications}
                disabled={notificationPermission === "granted"}
              >
                <BellRing className="h-4 w-4" aria-hidden="true" />
                {notificationPermission === "granted"
                  ? "Permission granted"
                  : "Enable browser notifications"}
              </button>
              <label className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700">
                <input
                  className="h-4 w-4 accent-emerald-600"
                  type="checkbox"
                  checked={reminderSettings.browserNotifications}
                  onChange={(event) =>
                    onToggleBrowserNotifications(event.target.checked)
                  }
                />
                Browser alerts
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {routineCategories.map((category) => (
              <label
                key={`reminder-${category.id}`}
                className="block rounded-lg border border-zinc-200 p-3"
              >
                <span className="mb-2 flex items-center justify-between gap-2">
                  <RoutineCategoryBadge category={category} />
                  <span className="text-xs font-semibold text-zinc-400">
                    #{category.sortOrder}
                  </span>
                </span>
                <input
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  type="time"
                  value={reminderSettings.reminderTimes[category.id] ?? ""}
                  onChange={(event) =>
                    onReminderTimeChange(category.id, event.target.value)
                  }
                />
              </label>
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

function SyncStatusPanel({
  syncStatus,
  syncMessage,
  isCloudConfigured,
  lastCloudSyncAt,
}: {
  syncStatus: CloudSyncStatus;
  syncMessage: string;
  isCloudConfigured: boolean;
  lastCloudSyncAt: string;
}) {
  const isHealthy = syncStatus === "synced" || syncStatus === "saving";
  const Icon = isCloudConfigured ? Database : CloudOff;
  const statusLabel =
    syncStatus === "loading"
      ? "Checking sync"
      : syncStatus === "saving"
        ? "Saving"
        : syncStatus === "synced"
          ? "Cloud synced"
          : syncStatus === "not-configured"
            ? "Local only"
            : "Sync error";

  return (
    <section
      className={`mt-5 rounded-lg border p-3 text-sm ${
        isHealthy
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {statusLabel}
      </div>
      <p className="mt-1 text-xs leading-5">{syncMessage}</p>
      {lastCloudSyncAt && (
        <p className="mt-2 text-xs font-medium">
          Last sync: {formatLogDate(lastCloudSyncAt)}
        </p>
      )}
    </section>
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
  value: number | string;
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
