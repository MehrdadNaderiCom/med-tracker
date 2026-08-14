"use client";

import {
  Activity,
  AlarmClock,
  AlertTriangle,
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
  Menu,
  Pill,
  Plus,
  RotateCcw,
  Save,
  Scale,
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
import HealthTracker from "./health-tracker";
import {
  addCareDays,
  averageBloodPressure,
  careDayKeyForInstant,
  entryCareDayKey,
  evaluateHealthTasks,
} from "./health-schedule";
import {
  formatDateKey,
  formatTehranInstant,
  formatTimeOfDay,
  parseDateKey,
  tehranDateKey,
  tehranTime24,
  tehranWallTimeToIso,
  weekdayIndexForDateKey,
} from "./tehran-time";
import {
  createDefaultHealthData,
  mergeHealthData,
  normalizeHealthData,
  type HealthSyncData,
} from "./health-data";
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
import type {
  ActivityCheckIn,
  BloodPressureSession,
  DietCheckIn,
  HealthProfile,
  HealthSettings,
  WaistEntry,
  WeightEntry,
} from "@/types/health";

type TabId =
  | "dashboard"
  | "health"
  | "reports"
  | "medications"
  | "add"
  | "history"
  | "settings"
  | "more";

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
  dateKey: string;
  scheduleType: MedicationScheduleType;
  time: string | null;
  order: number | null;
  routineCategoryId: string | null;
  isTaken: boolean;
  takenLogId: string | null;
  lapseLogId: string | null;
  lapseRecordedAt: string | null;
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

type AdherenceDayPoint = {
  dateKey: string;
  label: string;
  shortLabel: string;
  due: number;
  taken: number;
  rate: number;
};

type ReportEntryDetail = {
  key: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  unit: string;
  categoryId: string;
  scheduleLabel: string;
  isTaken: boolean;
  hasLapse: boolean;
};

type ReportDayDetail = AdherenceDayPoint & {
  weekdayLabel: string;
  entries: ReportEntryDetail[];
};

type ItemReportPoint = {
  dateKey: string;
  shortLabel: string;
  wasDue: boolean;
  isTaken: boolean;
  hasLapse: boolean;
};

type ItemReport = {
  medicationId: string;
  medicationName: string;
  dosage: string;
  unit: string;
  categoryId: string;
  isActive: boolean;
  due: number;
  taken: number;
  lapses: number;
  missed: number;
  rate: number;
  points: ItemReportPoint[];
};

type CategoryReport = {
  categoryId: string;
  due: number;
  taken: number;
  lapses: number;
  rate: number;
};

type AdherenceRangeId =
  | "1d"
  | "7d"
  | "30d"
  | "90d"
  | "180d"
  | "365d";

const ADHERENCE_RANGE_OPTIONS: {
  id: AdherenceRangeId;
  label: string;
  days: number;
}[] = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "7d", label: "1 week", days: 7 },
  { id: "30d", label: "1 month", days: 30 },
  { id: "90d", label: "3 months", days: 90 },
  { id: "180d", label: "6 months", days: 180 },
  { id: "365d", label: "1 year", days: 365 },
];

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

const MEDICATIONS_STORAGE_KEY = "medtrack-medications";
const LOGS_STORAGE_KEY = "medtrack-intake-logs";
const DELETED_LOG_IDS_STORAGE_KEY = "medtrack-deleted-log-ids";
const CATEGORIES_STORAGE_KEY = "medtrack-categories";
const ROUTINE_CATEGORIES_STORAGE_KEY = "medtrack-routine-categories";
const CARE_DAY_STORAGE_KEY = "medtrack-care-day";
const PERSONAL_PLAN_VERSION_STORAGE_KEY = "medtrack-personal-plan-version";
const REMINDER_SETTINGS_STORAGE_KEY = "medtrack-reminder-settings";
const HEALTH_DATA_STORAGE_KEY = "medtrack-health-data-v1";
const HEALTH_REMINDER_HISTORY_STORAGE_KEY = "medtrack-health-reminder-history-v1";
const PERSONAL_PLAN_VERSION = 6;

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
  { id: "dashboard", label: "Today", icon: LayoutDashboard },
  { id: "health", label: "Health", icon: Scale },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "medications", label: "My Medications", icon: ClipboardList },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

const MOBILE_TABS: {
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "dashboard", label: "Today", icon: LayoutDashboard },
  { id: "health", label: "Health", icon: Scale },
  { id: "reports", label: "Trends", icon: BarChart3 },
  { id: "medications", label: "Meds", icon: Pill },
  { id: "more", label: "More", icon: Menu },
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
    id: "exercise",
    name: "Exercise",
    tone: "sky",
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    tone: "violet",
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
  "minute",
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
    {
      id: createId(),
      name: "Stationary bike - 30 minutes",
      dosage: "30",
      unit: "minute",
      category: "exercise",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 1,
        routineCategoryId: "during-day",
      },
      notes:
        "Daily cardio for weight loss and grade-3 fatty liver support. Aim for a steady 30-minute stationary bike session during the day (not right after a heavy meal). Start at a comfortable pace you can sustain; consistency matters more than intensity. Stop and seek care if you feel chest pain, severe shortness of breath, or dizziness.",
      isActive: true,
    },
    {
      id: createId(),
      name: "No hookah today",
      dosage: "1",
      unit: "session",
      category: "lifestyle",
      schedule: {
        type: "ordered",
        dayMode: "daily",
        times: [],
        days: [...ALL_DAYS],
        order: 2,
        routineCategoryId: "during-day",
      },
      notes:
        "Important health commitment: stay completely hookah-free for the full care day. Hookah smoke loads the body with toxins and carbon monoxide, worsens fatty-liver recovery, and works against weight-loss and cardiovascular goals. Mark this only when you stayed smoke-free all day.",
      isActive: true,
      trackingMode: "avoidance",
    },
  ];
}

const PERSONAL_PLAN_NAME_MIGRATIONS: Record<string, string> = {
  [normalizeMedicationName("Liv.52 Tablet")]: "Liv.52 Tablet - lunch dose",
};

function mergePersonalMedicationPlan(
  currentMedications: Medication[],
  shouldUpdateKnownItems: boolean,
  activeFromDateKey?: string,
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
      activeFrom: medication.activeFrom,
      activeUntil: medication.activeUntil,
      trackingMode: planMedication.trackingMode,
    };
  });
  const activeNames = new Set(
    nextMedications
      .filter((medication) => medication.isActive)
      .map((medication) => normalizeMedicationName(medication.name)),
  );
  const missingPlanMedications = planMedications
    .filter(
      (medication) =>
        !activeNames.has(normalizeMedicationName(medication.name)),
    )
    .map((medication) => ({
      ...medication,
      // New plan items must not rewrite older adherence history.
      activeFrom: activeFromDateKey,
    }));

  return [...nextMedications, ...missingPlanMedications];
}

function getTehranTime(date: Date) {
  return tehranTime24(date) ?? "--:--";
}

function showBrowserNotification(title: string, body: string) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    // The constructor is unsupported on several mobile browsers. Toasts remain
    // the dependable foreground fallback until scheduled Web Push is added.
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

function getDateFromKey(dateKey: string) {
  return parseDateKey(dateKey);
}

function getDefaultCareDayKey(now: Date) {
  return careDayKeyForInstant(now);
}

function getCareDayRolloverAt(careDayKey: string) {
  if (!parseDateKey(careDayKey)) return null;
  const nextKey = addCareDays(careDayKey, 1);
  const rolloverIso = tehranWallTimeToIso(`${nextKey}T12:00`);
  return rolloverIso ? new Date(rolloverIso) : null;
}

function resolveCareDayKey(storedCareDayKey: string, now: Date) {
  const storedCareDayDate = getDateFromKey(storedCareDayKey);
  const rolloverAt = getCareDayRolloverAt(storedCareDayKey);

  if (!storedCareDayDate || !rolloverAt) {
    return getDefaultCareDayKey(now);
  }

  if (storedCareDayKey > getNextCareDayKey(getDefaultCareDayKey(now))) {
    return getDefaultCareDayKey(now);
  }

  return now.getTime() < rolloverAt.getTime()
    ? storedCareDayKey
    : getDefaultCareDayKey(now);
}

function getNextCareDayKey(careDayKey: string) {
  return getDateFromKey(careDayKey)
    ? addCareDays(careDayKey, 1)
    : getDefaultCareDayKey(new Date());
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
    const localMedication = localData.medications.find(
      (candidate) => candidate.id === medication.id,
    );
    medicationById.set(medication.id, {
      ...medication,
      trackingMode:
        medication.trackingMode === "avoidance" ||
        localMedication?.trackingMode === "avoidance"
          ? "avoidance"
          : "completion",
    });
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
  const localLogById = new Map(localData.logs.map((log) => [log.id, log]));

  cloudData.logs.forEach((log) => {
    if (deletedLogIdSet.has(log.id)) {
      return;
    }

    const localLog = localLogById.get(log.id);
    logById.set(log.id, {
      ...log,
      // Once a log ID is a negative event, a stale client must not reinterpret
      // the same immutable record as a successful completion.
      status:
        log.status === "lapse" || localLog?.status === "lapse"
          ? "lapse"
          : "taken",
    });
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
  const careDayKeyForPlan =
    typeof value.careDayKey === "string"
      ? resolveCareDayKey(value.careDayKey, now)
      : getDefaultCareDayKey(now);
  const medications = shouldUpdatePersonalPlan
    ? mergePersonalMedicationPlan(rawMedications, true, careDayKeyForPlan)
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
  const careDayKey = careDayKeyForPlan;

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

  const careDayKey = resolveCareDayKey(storedCareDayKey, now);

  return {
    medications: shouldLoadStarterPlan
      ? mergePersonalMedicationPlan(
          storedMedications,
          shouldUpdatePersonalPlan,
          careDayKey,
        )
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
    careDayKey,
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

async function readCloudSyncData(fallbackData: MedTrackSyncData, now: Date) {
  const response = await fetch("/api/sync", {
    method: "GET",
    credentials: "same-origin",
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
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
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

function readLocalHealthData(now: Date) {
  return normalizeHealthData(
    readStoredJson(HEALTH_DATA_STORAGE_KEY),
    createDefaultHealthData(now),
  );
}

function writeLocalHealthData(data: HealthSyncData) {
  writeStoredJson(HEALTH_DATA_STORAGE_KEY, data);
}

async function readCloudHealthData(localData: HealthSyncData) {
  const response = await fetch("/api/health-sync", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 503) {
    return { configured: false as const, data: localData };
  }

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Health sync failed",
    );
  }

  if (!isRecord(payload) || payload.configured !== true) {
    return { configured: false as const, data: localData };
  }

  const cloudData = normalizeHealthData(payload.data, localData);
  return {
    configured: true as const,
    data: mergeHealthData(cloudData, localData),
  };
}

async function writeCloudHealthData(data: HealthSyncData) {
  const response = await fetch("/api/health-sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ data }),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (response.status === 503) {
    return { configured: false as const, savedAt: "" };
  }

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Health save failed",
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
    trackingMode:
      value.trackingMode === "avoidance" ? "avoidance" : "completion",
    activeFrom: normalizeOptionalDateKey(value.activeFrom),
    activeUntil: normalizeOptionalDateKey(value.activeUntil),
  };
}

function normalizeOptionalDateKey(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const dateKey = value.trim();
  return getDateFromKey(dateKey) ? dateKey : undefined;
}

function isMedicationTrackableOnDate(medication: Medication, dateKey: string) {
  if (medication.activeFrom && dateKey < medication.activeFrom) {
    return false;
  }

  if (medication.isActive) {
    return !medication.activeUntil || dateKey <= medication.activeUntil;
  }

  if (medication.activeUntil) {
    return dateKey <= medication.activeUntil;
  }

  // Legacy deactivated items without an end date stay out of due counts so
  // historical charts are not rewritten, while their intake logs remain.
  return false;
}

function normalizeIntakeLog(value: unknown): IntakeLog | null {
  if (!isRecord(value)) {
    return null;
  }

  const takenAtCandidate = normalizeString(
    value.takenAt,
    new Date().toISOString(),
  );
  const takenAt = Number.isFinite(Date.parse(takenAtCandidate))
    ? takenAtCandidate
    : new Date().toISOString();
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
    date:
      normalizeOptionalDateKey(value.date) ?? careDayKeyForInstant(takenAt),
    status: value.status === "lapse" ? "lapse" : "taken",
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

function formatLogDate(value: string) {
  return (
    formatTehranInstant(value, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) ?? value
  );
}

function formatCareDayDate(value: string) {
  return (
    formatDateKey(value, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) ?? value
  );
}

function formatReadableTime(value: string) {
  return formatTimeOfDay(value) ?? value;
}

function getDayForDateKey(dateKey: string): WeekDay | null {
  const weekdayIndex = weekdayIndexForDateKey(dateKey);
  return weekdayIndex === null ? null : WEEK_DAYS[weekdayIndex].id;
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

function isMedicationDueOnDate(medication: Medication, dateKey: string) {
  const dayMode = getMedicationDayMode(medication.schedule);

  if (dayMode === "daily") {
    return true;
  }

  const todayDay = getDayForDateKey(dateKey);
  if (!todayDay) return false;

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

function isAvoidanceEntry(entry: TodayMedication) {
  return entry.medication.trackingMode === "avoidance";
}

function isEntryResolved(entry: TodayMedication) {
  return entry.isTaken || Boolean(entry.lapseLogId);
}

function getTodayMedicationLogs(
  logs: IntakeLog[],
  medication: Medication,
  scheduleType: MedicationScheduleType,
  todayKey: string,
  time: string | null,
) {
  return logs.filter((log) => {
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

function buildMedicationEntriesForDate(
  medications: Medication[],
  logs: IntakeLog[],
  dateKey: string,
) {
  const entries: TodayMedication[] = [];

  medications
    .filter(
      (medication) =>
        isMedicationTrackableOnDate(medication, dateKey) &&
        isMedicationDueOnDate(medication, dateKey),
    )
    .forEach((medication) => {
      const scheduleType = getMedicationScheduleType(medication);

      if (scheduleType === "timed") {
        medication.schedule.times.forEach((time) => {
          const matchingLogs = getTodayMedicationLogs(
            logs,
            medication,
            scheduleType,
            dateKey,
            time,
          );

          const takenLog = matchingLogs.find((log) => log.status === "taken");
          const lapseLog = matchingLogs.find((log) => log.status === "lapse");
          entries.push({
            medication,
            dateKey,
            scheduleType,
            time,
            order: null,
            routineCategoryId: null,
            isTaken: Boolean(takenLog) && !lapseLog,
            takenLogId: takenLog?.id ?? null,
            lapseLogId: lapseLog?.id ?? null,
            lapseRecordedAt: lapseLog?.takenAt ?? null,
          });
        });
        return;
      }

      const matchingLogs = getTodayMedicationLogs(
        logs,
        medication,
        scheduleType,
        dateKey,
        null,
      );

      const takenLog = matchingLogs.find((log) => log.status === "taken");
      const lapseLog = matchingLogs.find((log) => log.status === "lapse");
      entries.push({
        medication,
        dateKey,
        scheduleType,
        time: null,
        order: getMedicationOrder(medication),
        routineCategoryId: getMedicationRoutineCategoryId(medication),
        isTaken: Boolean(takenLog) && !lapseLog,
        takenLogId: takenLog?.id ?? null,
        lapseLogId: lapseLog?.id ?? null,
        lapseRecordedAt: lapseLog?.takenAt ?? null,
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

function getAdherenceDaySeries(
  medications: Medication[],
  logs: IntakeLog[],
  endDateKey: string,
  dayCount: number,
): AdherenceDayPoint[] {
  const safeDayCount = Math.max(1, dayCount);
  const points: AdherenceDayPoint[] = [];

  for (let dayOffset = safeDayCount - 1; dayOffset >= 0; dayOffset -= 1) {
    const dateKey = addCareDays(endDateKey, -dayOffset);
    const entries = buildMedicationEntriesForDate(medications, logs, dateKey);
    const due = entries.length;
    const taken = entries.filter((entry) => entry.isTaken).length;

    points.push({
      dateKey,
      label:
        formatDateKey(dateKey, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) ?? dateKey,
      shortLabel:
        safeDayCount <= 7
          ? (formatDateKey(dateKey, { weekday: "short" }) ?? dateKey)
          : safeDayCount <= 90
            ? (formatDateKey(dateKey, { month: "short", day: "numeric" }) ??
              dateKey)
            : (formatDateKey(dateKey, { month: "short" }) ?? dateKey),
      due,
      taken,
      rate: due === 0 ? 0 : Math.round((taken / due) * 100),
    });
  }

  return points;
}

function getAdherenceStats(
  medications: Medication[],
  logs: IntakeLog[],
  endDateKey: string,
  dayCount = 7,
): AdherenceStats {
  const series = getAdherenceDaySeries(
    medications,
    logs,
    endDateKey,
    dayCount,
  );
  let due = 0;
  let taken = 0;
  let streak = 0;
  let isStreakOpen = true;

  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index];
    due += point.due;
    taken += point.taken;

    if (isStreakOpen && point.due > 0 && point.taken === point.due) {
      streak += 1;
      continue;
    }

    if (point.due > 0) {
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

function buildReportEntryDetail(
  entry: TodayMedication,
  routineCategories: RoutineCategory[],
): ReportEntryDetail {
  return {
    key: getTodayMedicationKey(entry),
    medicationId: entry.medication.id,
    medicationName: entry.medication.name,
    dosage: entry.medication.dosage,
    unit: entry.medication.unit,
    categoryId: entry.medication.category,
    scheduleLabel: getEntryScheduleLabel(entry, routineCategories),
    isTaken: entry.isTaken,
    hasLapse: Boolean(entry.lapseLogId),
  };
}

function getReportDayDetails(
  medications: Medication[],
  logs: IntakeLog[],
  endDateKey: string,
  dayCount: number,
  routineCategories: RoutineCategory[],
): ReportDayDetail[] {
  const safeDayCount = Math.max(1, dayCount);
  const days: ReportDayDetail[] = [];

  for (let dayOffset = 0; dayOffset < safeDayCount; dayOffset += 1) {
    const dateKey = addCareDays(endDateKey, -dayOffset);
    const entries = buildMedicationEntriesForDate(medications, logs, dateKey);
    const due = entries.length;
    const taken = entries.filter((entry) => entry.isTaken).length;

    days.push({
      dateKey,
      label:
        formatDateKey(dateKey, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        }) ?? dateKey,
      shortLabel:
        safeDayCount <= 7
          ? (formatDateKey(dateKey, { weekday: "short" }) ?? dateKey)
          : safeDayCount <= 90
            ? (formatDateKey(dateKey, { month: "short", day: "numeric" }) ??
              dateKey)
            : (formatDateKey(dateKey, { month: "short" }) ?? dateKey),
      weekdayLabel:
        formatDateKey(dateKey, { weekday: "long" }) ?? dateKey,
      due,
      taken,
      rate: due === 0 ? 0 : Math.round((taken / due) * 100),
      entries: entries.map((entry) =>
        buildReportEntryDetail(entry, routineCategories),
      ),
    });
  }

  return days;
}

function getItemReports(
  medications: Medication[],
  dayDetails: ReportDayDetail[],
): ItemReport[] {
  const reportsById = new Map<string, ItemReport>();

  dayDetails.forEach((day) => {
    day.entries.forEach((entry) => {
      const existing = reportsById.get(entry.medicationId);
      const point: ItemReportPoint = {
        dateKey: day.dateKey,
        shortLabel: day.shortLabel,
        wasDue: true,
        isTaken: entry.isTaken,
        hasLapse: entry.hasLapse,
      };

      if (!existing) {
        const medication = medications.find(
          (item) => item.id === entry.medicationId,
        );

        reportsById.set(entry.medicationId, {
          medicationId: entry.medicationId,
          medicationName: entry.medicationName,
          dosage: entry.dosage,
          unit: entry.unit,
          categoryId: entry.categoryId,
          isActive: medication?.isActive ?? false,
          due: 1,
          taken: entry.isTaken ? 1 : 0,
          lapses: entry.hasLapse ? 1 : 0,
          missed: entry.isTaken || entry.hasLapse ? 0 : 1,
          rate: entry.isTaken ? 100 : 0,
          points: [point],
        });
        return;
      }

      existing.due += 1;
      existing.taken += entry.isTaken ? 1 : 0;
      existing.lapses += entry.hasLapse ? 1 : 0;
      existing.missed += entry.isTaken || entry.hasLapse ? 0 : 1;
      existing.rate =
        existing.due === 0
          ? 0
          : Math.round((existing.taken / existing.due) * 100);
      existing.points.push(point);
    });
  });

  return Array.from(reportsById.values())
    .map((report) => ({
      ...report,
      points: [...report.points].reverse(),
    }))
    .sort((first, second) => {
      if (first.rate !== second.rate) {
        return first.rate - second.rate;
      }

      return first.medicationName.localeCompare(second.medicationName);
    });
}

function getCategoryReports(itemReports: ItemReport[]): CategoryReport[] {
  const reportsByCategory = new Map<string, CategoryReport>();

  itemReports.forEach((item) => {
    const existing = reportsByCategory.get(item.categoryId);

    if (!existing) {
      reportsByCategory.set(item.categoryId, {
        categoryId: item.categoryId,
        due: item.due,
        taken: item.taken,
        lapses: item.lapses,
        rate: item.due === 0 ? 0 : Math.round((item.taken / item.due) * 100),
      });
      return;
    }

    existing.due += item.due;
    existing.taken += item.taken;
    existing.lapses += item.lapses;
    existing.rate =
      existing.due === 0
        ? 0
        : Math.round((existing.taken / existing.due) * 100);
  });

  return Array.from(reportsByCategory.values()).sort(
    (first, second) => second.rate - first.rate,
  );
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
  const [healthData, setHealthData] = useState<HealthSyncData>(() =>
    createDefaultHealthData(),
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [syncStatus, setSyncStatus] =
    useState<CloudSyncStatus>("loading");
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  const [isHealthCloudConfigured, setIsHealthCloudConfigured] = useState(false);
  const [healthSyncStatus, setHealthSyncStatus] =
    useState<CloudSyncStatus>("loading");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState("");
  const [syncMessage, setSyncMessage] = useState("Checking cloud database");
  const [isStorageReady, setIsStorageReady] = useState(false);
  const notifiedReminderKeys = useRef<Set<string>>(new Set());
  const recordedAvoidanceKeys = useRef<Set<string>>(new Set());
  const pageContentRef = useRef<HTMLElement>(null);

  function handleTabChange(nextTab: TabId) {
    const didChange = nextTab !== activeTab;
    setActiveTab(nextTab);

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      if (!didChange) return;

      const heading = pageContentRef.current?.querySelector<HTMLElement>("h1");
      if (!heading) return;

      const previousTabIndex = heading.getAttribute("tabindex");
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });

      if (previousTabIndex === null) {
        heading.addEventListener(
          "blur",
          () => heading.removeAttribute("tabindex"),
          { once: true },
        );
      } else {
        heading.setAttribute("tabindex", previousTabIndex);
      }
    });
  }

  const todayKey = careDayKey;
  const todayLabel = careDayKey
    ? (formatDateKey(careDayKey, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }) ?? careDayKey)
    : "";
  const currentClockLabel = today
    ? (formatTehranInstant(today, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) ?? "")
    : "";

  useEffect(() => {
    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (isCancelled) {
        return;
      }

      const now = new Date();
      const localData = createLocalSyncData(now);
      const localHealthData = readLocalHealthData(now);
      let syncData = localData;
      let nextHealthData = localHealthData;
      let nextSyncStatus: CloudSyncStatus = "not-configured";
      let nextSyncMessage = "Sign in to enable cloud sync";
      let nextIsCloudConfigured = false;
      let hasSession = false;
      let nextHealthCloudConfigured = false;
      let nextHealthSyncStatus: CloudSyncStatus = "not-configured";

      try {
        const authResponse = await fetch("/api/auth", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const authPayload: unknown = await authResponse.json().catch(() => null);
        hasSession =
          authResponse.ok &&
          isRecord(authPayload) &&
          authPayload.authenticated === true;

        if (hasSession) {
          const [cloudResult, healthResult] = await Promise.all([
            readCloudSyncData(localData, now),
            readCloudHealthData(localHealthData),
          ]);
          syncData = cloudResult.data;
          nextHealthData = healthResult.data;
          nextIsCloudConfigured = cloudResult.configured;
          nextHealthCloudConfigured = healthResult.configured;
          nextSyncStatus = cloudResult.configured ? "synced" : "not-configured";
          nextHealthSyncStatus = healthResult.configured
            ? "synced"
            : "not-configured";
          nextSyncMessage = cloudResult.configured
            ? "Cloud sync is active"
            : "Database env variables are missing";
        }
      } catch (error) {
        nextSyncStatus = "error";
        nextHealthSyncStatus = "error";
        nextSyncMessage =
          error instanceof Error ? error.message : "Could not verify session";
      }

      if (isCancelled) {
        return;
      }

      setIsAuthenticated(hasSession);
      setMedications(syncData.medications);
      setLogs(syncData.logs);
      setDeletedLogIds(syncData.deletedLogIds);
      setCategories(syncData.categories);
      setRoutineCategories(syncData.routineCategories);
      setReminderSettings(syncData.reminderSettings);
      setHealthData(nextHealthData);
      setNotificationPermission(
        typeof Notification === "undefined"
          ? "unsupported"
          : Notification.permission,
      );
      setToday(now);
      setCareDayKey(syncData.careDayKey);
      setIsCloudConfigured(nextIsCloudConfigured);
      setIsHealthCloudConfigured(nextHealthCloudConfigured);
      setHealthSyncStatus(nextHealthSyncStatus);
      setSyncStatus(nextSyncStatus);
      setSyncMessage(nextSyncMessage);
      setLastCloudSyncAt(nextIsCloudConfigured ? syncData.updatedAt : "");
      writeLocalSyncData(syncData);
      writeLocalHealthData(nextHealthData);
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
    if (!isStorageReady) {
      return;
    }

    writeLocalHealthData(healthData);
  }, [healthData, isStorageReady]);

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
    if (!isStorageReady || !isHealthCloudConfigured || !isAuthenticated) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setHealthSyncStatus("saving");

      try {
        const result = await writeCloudHealthData(healthData);
        if (!result.configured) {
          setIsHealthCloudConfigured(false);
          setHealthSyncStatus("not-configured");
          return;
        }
        setHealthSyncStatus("synced");
      } catch {
        setHealthSyncStatus("error");
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [healthData, isAuthenticated, isHealthCloudConfigured, isStorageReady]);

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
        const [cloudResult, healthResult] = await Promise.all([
          readCloudSyncData(fallbackData, now),
          readCloudHealthData(healthData),
        ]);

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
        setHealthData(healthResult.data);
        setIsHealthCloudConfigured(healthResult.configured);
        setHealthSyncStatus(
          healthResult.configured ? "synced" : "not-configured",
        );
        setSyncStatus("synced");
        setSyncMessage("Cloud sync is active");
        setLastCloudSyncAt(cloudResult.data.updatedAt);
        writeLocalSyncData(cloudResult.data);
        writeLocalHealthData(healthResult.data);
      } catch {
        setSyncStatus("error");
        setHealthSyncStatus("error");
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
    healthData,
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
    if (!todayKey || !today) {
      return [];
    }

    const completionEntries = buildMedicationEntriesForDate(
      activeMedications.filter(
        (medication) => medication.trackingMode !== "avoidance",
      ),
      logs,
      todayKey,
    );
    // Avoidance outcomes use the same noon-to-noon Care Day as every other
    // checklist item. `takenAt` still preserves the exact real-world instant.
    const avoidanceEntries = buildMedicationEntriesForDate(
      activeMedications.filter(
        (medication) => medication.trackingMode === "avoidance",
      ),
      logs,
      todayKey,
    );

    return [...completionEntries, ...avoidanceEntries];
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

  const adherenceStats = useMemo<AdherenceStats>(
    () =>
      getAdherenceStats(
        medications,
        logs,
        todayKey || getDefaultCareDayKey(today ?? new Date()),
        7,
      ),
    [logs, medications, today, todayKey],
  );

  const orderedMedicationGroups = useMemo<OrderedMedicationGroup[]>(() => {
    const groups = new Map<string, TodayMedication[]>();

    todayMedications
      .filter(
        (entry) =>
          entry.scheduleType === "ordered" && !isAvoidanceEntry(entry),
      )
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

  const pendingTodayCount = todayMedications.filter(
    (entry) => !isEntryResolved(entry),
  ).length;
  const pendingCareDayCount = todayMedications.filter(
    (entry) => !isAvoidanceEntry(entry) && !isEntryResolved(entry),
  ).length;

  useEffect(() => {
    if (
      !isStorageReady ||
      !isAuthenticated ||
      !today ||
      !todayKey ||
      !reminderSettings.browserNotifications
    ) {
      return;
    }

    const currentTime = getTehranTime(today);

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

        showBrowserNotification(
          "MedTrack reminder",
          `${group.routineCategoryName}: ${group.entries.length - group.takenCount} item(s) still pending.`,
        );
      });
  }, [
    isAuthenticated,
    isStorageReady,
    orderedMedicationGroups,
    reminderSettings.browserNotifications,
    reminderSettings.reminderTimes,
    today,
    todayKey,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !isStorageReady || !today || !todayKey) return;

    const settings = healthData.settings;
    const evaluation = evaluateHealthTasks({
      now: today,
      careDayKey: todayKey,
      settings,
      weightEntries: healthData.weightEntries,
      bloodPressureSessions: healthData.bloodPressureSessions,
      dietCheckIns: healthData.dietCheckIns,
      waistEntries: healthData.waistEntries,
      activityCheckIns: healthData.activityCheckIns,
    });
    const taskCopy = {
      weight: {
        title: "Weight check due",
        body: "Weigh after the bathroom and before food or drink, under similar conditions.",
      },
      "blood-pressure-morning": {
        title: "After-waking blood pressure due",
        body: "Rest five minutes, then take two readings on the same upper arm one minute apart. A single reading can still be saved; never delay or skip medication for a reading.",
      },
      "blood-pressure-evening": {
        title: "Before-sleep blood pressure due",
        body: "Rest five minutes, then take two readings on the same upper arm one minute apart.",
      },
      diet: {
        title: "Diet check-in due",
        body: "Record how closely you followed your plan this Care Day.",
      },
      waist: {
        title: "Waist measurement due",
        body: "Measure at the same landmark and under similar conditions. The 14-Care-Day interval is a low-noise app reminder that you can adjust with your clinician.",
      },
      activity: {
        title: "Activity review due",
        body: "Record movement, strength sessions, sitting time, and how your conditioning feels.",
      },
    } as const;
    const hasCurrentBloodPressureTask = evaluation.tasks.some(
      (task) =>
        task.kind.startsWith("blood-pressure") &&
        (task.status === "due" ||
          task.status === "partial" ||
          task.severity === "urgent"),
    );
    const urgentBloodPressureTaskId =
      evaluation.bloodPressurePlan.urgentPeriod === "evening"
        ? "blood-pressure-evening"
        : "blood-pressure-morning";
    const reminders: {
      id: string;
      state: string;
      due: boolean;
      title: string;
      body: string;
    }[] = [
      {
        id: "bp-safety-start",
        state: "initial",
        due:
          evaluation.bloodPressurePlan.active &&
          healthData.bloodPressureSessions.length === 0 &&
          !hasCurrentBloodPressureTask,
        title: "Blood pressure check needed today",
        body: "Because you have felt it may be high, rest five minutes and record two upper-arm readings now.",
      },
      ...evaluation.tasks
        .filter(
          (task) =>
            task.severity !== "urgent" || task.id === urgentBloodPressureTaskId,
        )
        .map((task) => {
        const copy = taskCopy[task.kind];
        const isBloodPressure = task.kind.startsWith("blood-pressure");
        const title = task.severity === "urgent"
          ? "Urgent blood pressure review"
          : task.status === "partial"
            ? "Complete the blood pressure pair"
            : task.reason === "incomplete-session-saved"
              ? "Start a fresh blood pressure pair"
            : task.reason === "restart-or-extend"
              ? "Restart or extend blood pressure monitoring"
              : task.reason === "multiple-missed-care-days"
                ? `Blood pressure missing for ${evaluation.bloodPressurePlan.missingStreak} Care Days`
                : copy.title;
        const body = task.severity === "urgent"
          ? "A severe reading was saved. Repeat after at least one minute; if it remains severe, contact a healthcare professional immediately. With warning symptoms, call emergency services now."
          : task.status === "partial"
            ? "One reading is safely saved. When possible, complete the same-arm pair after at least one minute."
            : task.reason === "incomplete-session-saved"
              ? "The earlier single reading remains in history, but its pairing window has ended. Start a fresh same-arm two-reading session."
            : isBloodPressure && task.reason === "restart-or-extend"
              ? "Several Care Days were missed. Start a fresh seven-Care-Day run or extend this one and share the results with your clinician."
              : copy.body;
        return {
          id: task.id,
          state: `${task.status}:${task.reason}`,
          due:
            task.status === "due" ||
            task.status === "partial" ||
            task.severity === "urgent",
          title,
          body,
        };
        }),
    ];

    const persistedReminderKeys = new Set(
      readStoredArray<string>(HEALTH_REMINDER_HISTORY_STORAGE_KEY, (value) =>
        typeof value === "string" ? value : null,
      ),
    );
    reminders.filter((reminder) => reminder.due).forEach((reminder) => {
      const notificationKey = `health:${todayKey}:${reminder.id}:${reminder.state}`;
      if (
        notifiedReminderKeys.current.has(notificationKey) ||
        persistedReminderKeys.has(notificationKey)
      ) {
        return;
      }
      notifiedReminderKeys.current.add(notificationKey);
      persistedReminderKeys.add(notificationKey);
      toast.info(`${reminder.title}: ${reminder.body}`, { duration: 10000 });

      if (settings.browserNotifications) {
        showBrowserNotification("MedTrack health reminder", reminder.body);
      }
    });
    writeStoredArray(
      HEALTH_REMINDER_HISTORY_STORAGE_KEY,
      Array.from(persistedReminderKeys).slice(-120),
    );
  }, [healthData, isAuthenticated, isStorageReady, today, todayKey]);

  function updateHealthData(
    updater: (currentData: HealthSyncData, updatedAt: string) => HealthSyncData,
  ) {
    const updatedAt = new Date().toISOString();
    setHealthData((currentData) => updater(currentData, updatedAt));
  }

  function handleAddWeight(entry: WeightEntry) {
    updateHealthData((currentData, updatedAt) => {
      const existing = currentData.weightEntries.find(
        (currentEntry) => currentEntry.id === entry.id,
      );
      const nextEntry: WeightEntry = {
        ...entry,
        createdAt: existing?.createdAt ?? entry.createdAt,
        careDayKey: careDayKeyForInstant(entry.measuredAt),
        updatedAt,
      };

      return {
        ...currentData,
        weightEntries: [
          nextEntry,
          ...currentData.weightEntries.filter(
            (currentEntry) => currentEntry.id !== entry.id,
          ),
        ],
        updatedAt,
      };
    });
    toast.success("Weight recorded");
  }

  function handleDeleteWeight(id: string) {
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      weightEntries: currentData.weightEntries.filter((entry) => entry.id !== id),
      deletedEntryIds: {
        ...currentData.deletedEntryIds,
        weightEntryIds: Array.from(
          new Set([...currentData.deletedEntryIds.weightEntryIds, id]),
        ),
      },
      updatedAt,
    }));
    toast.success("Weight entry deleted");
  }

  function handleAddBloodPressure(session: BloodPressureSession) {
    updateHealthData((currentData, updatedAt) => {
      const existing = currentData.bloodPressureSessions.find(
        (currentSession) => currentSession.id === session.id,
      );
      const nextSession: BloodPressureSession = {
        ...session,
        createdAt: existing?.createdAt ?? session.createdAt,
        careDayKey: careDayKeyForInstant(session.measuredAt),
        updatedAt,
      };

      return {
        ...currentData,
        // A one-reading session can be completed later without creating a
        // duplicate history row or losing its original creation timestamp.
        bloodPressureSessions: [
          nextSession,
          ...currentData.bloodPressureSessions.filter(
            (currentSession) => currentSession.id !== session.id,
          ),
        ],
        updatedAt,
      };
    });
    const severeReadingCount = session.readings.filter(
      (reading) => reading.systolic >= 180 || reading.diastolic >= 120,
    ).length;
    const emergencySymptomsNeedImmediateAction = session.emergencySymptoms.some(
      (symptom) => symptom !== "back-pain",
    );
    if (
      emergencySymptomsNeedImmediateAction ||
      (severeReadingCount > 0 && session.emergencySymptoms.includes("back-pain"))
    ) {
      toast.error("Emergency warning symptoms recorded. Call your local emergency service now regardless of the pressure number.", {
        duration: 15000,
      });
    } else if (severeReadingCount === 1 && session.readings.length === 1) {
      toast.error("This reading is in the severe range. Wait at least one minute and repeat it; if it stays this high, contact a healthcare professional immediately. Call emergency services if warning symptoms appear.", {
        duration: 15000,
      });
    } else if (severeReadingCount === session.readings.length) {
      toast.error("Both readings are in the severe range. Contact a healthcare professional immediately; call emergency services if symptoms appear.", {
        duration: 15000,
      });
    } else if (severeReadingCount === 1) {
      toast.error("One of the two readings was severe. Follow the urgent guidance in Health and seek emergency help if symptoms appear.", {
        duration: 15000,
      });
    } else if (
      session.readings.some(
        (reading) => reading.systolic < 90 || reading.diastolic < 60,
      )
    ) {
      toast.warning(
        session.symptoms.length > 0
          ? "A low reading with symptoms was saved. Repeat carefully and contact your clinician promptly; seek urgent help for fainting, confusion, or severe symptoms. Do not change medicine yourself."
          : "A low reading was saved. Repeat carefully; if it recurs or you feel dizzy, faint, confused, nauseated, or have blurred vision, contact your clinician promptly.",
        { duration: 15000 },
      );
    } else if (
      session.readings.length >= 2 &&
      averageBloodPressure(session.readings) &&
      ((averageBloodPressure(session.readings)?.systolic ?? 0) >=
        healthData.settings.bpTargetSystolic ||
        (averageBloodPressure(session.readings)?.diastolic ?? 0) >=
          healthData.settings.bpTargetDiastolic)
    ) {
      toast.warning(
        "This pair is above your configured home target. Keep the structured log; if the pattern recurs, share it with your prescriber. Do not adjust medicine yourself.",
        { duration: 12000 },
      );
    } else if (session.readings.length === 1 && session.pairingClosedAt) {
      toast.success(
        "Single blood pressure reading kept. Start a fresh session when ready.",
      );
    } else if (session.readings.length === 1) {
      toast.success("One blood pressure reading saved. Add the second after one minute when possible.");
    } else {
      toast.success("Blood pressure session recorded");
    }
  }

  function handleDeleteBloodPressure(id: string) {
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      bloodPressureSessions: currentData.bloodPressureSessions.filter(
        (session) => session.id !== id,
      ),
      deletedEntryIds: {
        ...currentData.deletedEntryIds,
        bloodPressureSessionIds: Array.from(
          new Set([
            ...currentData.deletedEntryIds.bloodPressureSessionIds,
            id,
          ]),
        ),
      },
      updatedAt,
    }));
    toast.success("Blood pressure session deleted");
  }

  function handleAddDietCheckIn(checkIn: DietCheckIn) {
    updateHealthData((currentData, updatedAt) => {
      const existing = currentData.dietCheckIns.find(
        (currentEntry) => currentEntry.id === checkIn.id,
      );
      const nextEntry: DietCheckIn = {
        ...checkIn,
        createdAt: existing?.createdAt ?? checkIn.createdAt,
        careDayKey: careDayKeyForInstant(checkIn.measuredAt),
        updatedAt,
      };

      return {
        ...currentData,
        dietCheckIns: [
          nextEntry,
          ...currentData.dietCheckIns.filter(
            (currentEntry) => currentEntry.id !== checkIn.id,
          ),
        ],
        updatedAt,
      };
    });
    toast.success("Diet check-in saved");
  }

  function handleDeleteDietCheckIn(id: string) {
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      dietCheckIns: currentData.dietCheckIns.filter((entry) => entry.id !== id),
      deletedEntryIds: {
        ...currentData.deletedEntryIds,
        dietCheckInIds: Array.from(
          new Set([...currentData.deletedEntryIds.dietCheckInIds, id]),
        ),
      },
      updatedAt,
    }));
    toast.success("Diet check-in deleted");
  }

  function handleAddWaist(entry: WaistEntry) {
    updateHealthData((currentData, updatedAt) => {
      const existing = currentData.waistEntries.find(
        (currentEntry) => currentEntry.id === entry.id,
      );
      const nextEntry: WaistEntry = {
        ...entry,
        createdAt: existing?.createdAt ?? entry.createdAt,
        careDayKey:
          entry.measuredAtPrecision === "date"
            ? entry.measuredAt.slice(0, 10)
            : careDayKeyForInstant(entry.measuredAt),
        updatedAt,
      };
      const allEntries = [
        nextEntry,
        ...currentData.waistEntries.filter(
          (currentEntry) => currentEntry.id !== entry.id,
        ),
      ];
      const latest = [...allEntries].sort(
        (first, second) =>
          Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
      )[0];

      return {
        ...currentData,
        waistEntries: allEntries,
        profile: {
          ...currentData.profile,
          waistCircumferenceCm: latest.waistCircumferenceCm,
          waistMeasuredAt: latest.careDayKey ?? latest.measuredAt.slice(0, 10),
          waistMeasurementMethod: latest.measurementMethod,
        },
        profileUpdatedAt: updatedAt,
        updatedAt,
      };
    });
    toast.success("Waist measurement saved");
  }

  function handleDeleteWaist(id: string) {
    updateHealthData((currentData, updatedAt) => {
      const remaining = currentData.waistEntries.filter((entry) => entry.id !== id);
      const latest = [...remaining].sort(
        (first, second) =>
          Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
      )[0];
      return {
        ...currentData,
        waistEntries: remaining,
        deletedEntryIds: {
          ...currentData.deletedEntryIds,
          waistEntryIds: Array.from(
            new Set([...currentData.deletedEntryIds.waistEntryIds, id]),
          ),
        },
        ...(latest
          ? {
              profile: {
                ...currentData.profile,
                waistCircumferenceCm: latest.waistCircumferenceCm,
                waistMeasuredAt:
                  latest.careDayKey ?? latest.measuredAt.slice(0, 10),
                waistMeasurementMethod: latest.measurementMethod,
              },
              profileUpdatedAt: updatedAt,
            }
          : {}),
        updatedAt,
      };
    });
    toast.success("Waist measurement deleted");
  }

  function handleAddActivityCheckIn(checkIn: ActivityCheckIn) {
    updateHealthData((currentData, updatedAt) => {
      const existing = currentData.activityCheckIns.find(
        (currentEntry) => currentEntry.id === checkIn.id,
      );
      const nextEntry: ActivityCheckIn = {
        ...checkIn,
        createdAt: existing?.createdAt ?? checkIn.createdAt,
        careDayKey: careDayKeyForInstant(checkIn.measuredAt),
        updatedAt,
      };

      return {
        ...currentData,
        activityCheckIns: [
          nextEntry,
          ...currentData.activityCheckIns.filter(
            (currentEntry) => currentEntry.id !== checkIn.id,
          ),
        ],
        updatedAt,
      };
    });
    toast.success("Activity check-in saved");
  }

  function handleDeleteActivityCheckIn(id: string) {
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      activityCheckIns: currentData.activityCheckIns.filter(
        (entry) => entry.id !== id,
      ),
      deletedEntryIds: {
        ...currentData.deletedEntryIds,
        activityCheckInIds: Array.from(
          new Set([...currentData.deletedEntryIds.activityCheckInIds, id]),
        ),
      },
      updatedAt,
    }));
    toast.success("Activity check-in deleted");
  }

  async function handleUpdateHealthSettings(nextSettings: HealthSettings) {
    let settings = nextSettings;
    if (
      settings.browserNotifications &&
      typeof Notification !== "undefined" &&
      Notification.permission !== "granted"
    ) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        settings = { ...settings, browserNotifications: false };
        toast.error("Notifications are blocked; in-app reminders remain active");
      }
    }

    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      settings,
      settingsUpdatedAt: updatedAt,
      updatedAt,
    }));
  }

  function handleUpdateHealthProfile(profile: HealthProfile) {
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      profile,
      profileUpdatedAt: updatedAt,
      updatedAt,
    }));
    toast.success("Health profile saved");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isRecord(payload) || payload.authenticated !== true) {
        toast.error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Invalid username or password",
        );
        return;
      }

      setIsAuthenticated(true);
      setUsername("");
      setPassword("");
      setSyncStatus("loading");
      setSyncMessage("Loading cloud database");

      const now = new Date();
      const localData = createLocalSyncData(now);
      const localHealthData = readLocalHealthData(now);

      try {
        const [cloudResult, healthResult] = await Promise.all([
          readCloudSyncData(localData, now),
          readCloudHealthData(localHealthData),
        ]);
        setMedications(cloudResult.data.medications);
        setLogs(cloudResult.data.logs);
        setDeletedLogIds(cloudResult.data.deletedLogIds);
        setCategories(cloudResult.data.categories);
        setRoutineCategories(cloudResult.data.routineCategories);
        setCareDayKey(cloudResult.data.careDayKey);
        setReminderSettings(cloudResult.data.reminderSettings);
        setHealthData(healthResult.data);
        setIsCloudConfigured(cloudResult.configured);
        setIsHealthCloudConfigured(healthResult.configured);
        setHealthSyncStatus(
          healthResult.configured ? "synced" : "not-configured",
        );
        setSyncStatus(cloudResult.configured ? "synced" : "not-configured");
        setSyncMessage(
          cloudResult.configured
            ? "Cloud sync is active"
            : "Database env variables are missing",
        );
        setLastCloudSyncAt(
          cloudResult.configured ? cloudResult.data.updatedAt : "",
        );
        writeLocalSyncData(cloudResult.data);
        writeLocalHealthData(healthResult.data);
      } catch (error) {
        setSyncStatus("error");
        setHealthSyncStatus("error");
        setSyncMessage(
          error instanceof Error ? error.message : "Cloud sync failed",
        );
      }

      toast.success("Welcome back to MedTrack");
    } catch {
      toast.error("Could not sign in. Check your connection and try again.");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => null);
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

    const actualTodayKey =
      tehranDateKey(today ?? new Date()) ??
      getDefaultCareDayKey(today ?? new Date());

    if (todayKey >= actualTodayKey) {
      toast.error("Today is already the current care day");
      return;
    }

    if (
      pendingCareDayCount > 0 &&
      !window.confirm(
        `End this care day with ${pendingCareDayCount} pending item(s)? You can undo immediately after.`,
      )
    ) {
      return;
    }

    const previousCareDayKey = todayKey;
    const nextCareDayKey = getNextCareDayKey(todayKey);
    setCareDayKey(nextCareDayKey);
    notifiedReminderKeys.current.clear();
    toast.success(`Care day moved to ${
      formatDateKey(nextCareDayKey, { month: "short", day: "numeric" }) ??
      nextCareDayKey
    }`, {
      action: {
        label: "Undo",
        onClick: () => setCareDayKey(previousCareDayKey),
      },
    });
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
      updateHealthData((currentData, updatedAt) => ({
        ...currentData,
        settings: {
          ...currentData.settings,
          browserNotifications: true,
        },
        settingsUpdatedAt: updatedAt,
        updatedAt,
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
    updateHealthData((currentData, updatedAt) => ({
      ...currentData,
      settings: {
        ...currentData.settings,
        browserNotifications: isEnabled,
      },
      settingsUpdatedAt: updatedAt,
      updatedAt,
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
    const nextMedications = mergePersonalMedicationPlan(
      medications,
      true,
      todayKey || getDefaultCareDayKey(new Date()),
    );

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
    toast.success("Personal plan updated. History logs were kept.");
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

    const existingMedication = form.id
      ? medications.find((medication) => medication.id === form.id)
      : undefined;

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
      trackingMode: existingMedication?.trackingMode ?? "completion",
      activeFrom:
        existingMedication?.activeFrom ??
        todayKey ??
        getDefaultCareDayKey(new Date()),
      activeUntil: undefined,
    };

    setMedications((currentMedications) => {
      if (form.id) {
        return currentMedications.map((currentMedication) =>
          currentMedication.id === form.id ? medication : currentMedication,
        );
      }

      return [...currentMedications, medication];
    });

    toast.success(
      form.id
        ? "Medication updated. History logs were kept."
        : "Medication added. Existing history was not changed.",
    );
    resetForm();
    handleTabChange("medications");
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
    handleTabChange("add");
  }

  function handleDeleteMedication(medication: Medication) {
    const shouldRemove = window.confirm(
      `Remove ${medication.name} from the daily list?\n\nHistory logs stay saved. Past adherence is not deleted.`,
    );

    if (!shouldRemove) {
      return;
    }

    const lastTrackableDateKey = todayKey
      ? addCareDays(todayKey, -1)
      : medication.activeUntil;

    setMedications((currentMedications) =>
      currentMedications.map((currentMedication) =>
        currentMedication.id === medication.id
          ? {
              ...currentMedication,
              isActive: false,
              // Stop counting this item from today onward without erasing older days.
              activeUntil:
                currentMedication.activeUntil &&
                lastTrackableDateKey &&
                currentMedication.activeUntil < lastTrackableDateKey
                  ? currentMedication.activeUntil
                  : lastTrackableDateKey,
            }
          : currentMedication,
      ),
    );
    toast.success("Removed from daily list. History logs kept.");
  }

  function handleMarkAsTaken(entry: TodayMedication) {
    if (!todayKey) {
      toast.error("The schedule is still loading");
      return;
    }

    if (entry.lapseLogId) {
      toast.error("Hookah use is already recorded for this day");
      return;
    }

    if (entry.isTaken) {
      toast.error(
        isAvoidanceEntry(entry)
          ? "This hookah-free day is already recorded"
          : "This dose is already marked as taken",
      );
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
      date: entry.dateKey,
      status: "taken",
      notes: entry.medication.notes || undefined,
    };

    setLogs((currentLogs) => [log, ...currentLogs]);
    toast.success(
      isAvoidanceEntry(entry)
        ? "Hookah-free day recorded"
        : `${entry.medication.name} marked as taken`,
    );
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

  function removeAvoidanceLapse(logId: string, medicationName: string) {
    rememberDeletedLogIds([logId]);
    setLogs((currentLogs) =>
      currentLogs.filter((currentLog) => currentLog.id !== logId),
    );
    recordedAvoidanceKeys.current.clear();
    toast.success(`${medicationName} moved back to check-in`);
  }

  function handleRecordAvoidanceLapse(entry: TodayMedication) {
    if (!isAvoidanceEntry(entry)) {
      toast.error("This action is only available for avoidance check-ins");
      return;
    }

    if (entry.lapseLogId) {
      toast.error("Hookah use is already recorded for this day");
      return;
    }

    if (entry.isTaken) {
      toast.error(
        "A hookah-free outcome is already recorded. Undo it before logging use.",
      );
      return;
    }

    const now = new Date();
    const occurrenceCareDayKey = entry.dateKey;
    const dedupeKey = `${entry.medication.id}:${occurrenceCareDayKey}:lapse`;

    if (recordedAvoidanceKeys.current.has(dedupeKey)) {
      return;
    }

    const alreadyRecorded = logs.some(
      (log) =>
        log.medicationId === entry.medication.id &&
        log.date === occurrenceCareDayKey &&
        log.status === "lapse",
    );

    if (alreadyRecorded) {
      toast.error("Hookah use is already recorded for today");
      return;
    }

    recordedAvoidanceKeys.current.add(dedupeKey);
    const routineCategory = getRoutineCategoryOption(
      routineCategories,
      entry.routineCategoryId,
    );
    const log: IntakeLog = {
      id: createId(),
      medicationId: entry.medication.id,
      medicationName: entry.medication.name,
      dosage: entry.medication.dosage,
      unit: entry.medication.unit,
      category: entry.medication.category,
      scheduleType: "ordered",
      scheduledTime: null,
      order: entry.order ?? 1,
      routineCategoryId: routineCategory.id,
      routineCategoryName: routineCategory.name,
      takenAt: now.toISOString(),
      date: occurrenceCareDayKey,
      status: "lapse",
      notes: "Hookah use reported at the time it happened.",
    };

    setLogs((currentLogs) => [log, ...currentLogs]);
    toast(`Hookah use logged at ${getTehranTime(now)}`, {
      action: {
        label: "Undo",
        onClick: () => removeAvoidanceLapse(log.id, entry.medication.name),
      },
    });
  }

  function handleUndoAvoidanceOutcome(entry: TodayMedication) {
    const logId = entry.lapseLogId ?? entry.takenLogId;

    if (!logId) {
      toast.error("There is no hookah check-in to undo");
      return;
    }

    rememberDeletedLogIds([logId]);
    setLogs((currentLogs) =>
      currentLogs.filter((currentLog) => currentLog.id !== logId),
    );
    recordedAvoidanceKeys.current.clear();
    toast.success("Hookah check-in moved back to pending");
  }

  function handleMarkGroupAsTaken(entries: TodayMedication[]) {
    if (!todayKey) {
      toast.error("The schedule is still loading");
      return;
    }

    const pendingEntries = entries.filter(
      (entry) => !isAvoidanceEntry(entry) && !entry.isTaken,
    );

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
    if (isAvoidanceEntry(entry)) {
      toast.error("Hookah outcomes cannot be added through medication backfill");
      return;
    }
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
      log.status === "lapse"
        ? "Delete this recorded hookah-use event? The check-in will return to today's list if it was recorded today."
        : `Delete the history log for ${log.medicationName}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setLogs((currentLogs) =>
      currentLogs.filter((currentLog) => currentLog.id !== log.id),
    );
    rememberDeletedLogIds([log.id]);
    recordedAvoidanceKeys.current.clear();
    toast.success(
      log.status === "lapse"
        ? "Hookah-use event deleted"
        : "History log deleted",
    );
  }

  if (!isStorageReady || !today || !todayKey) {
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
    <main className="min-h-[100dvh] bg-[#f5faf8] text-zinc-950">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[17rem_1fr]">
        <aside className="border-b border-emerald-100 bg-white px-4 py-3 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
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
              className="hidden items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 lg:mt-7 lg:flex lg:w-full lg:justify-center"
              type="button"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </div>

          <nav className="mt-8 hidden space-y-2 lg:block" aria-label="Main navigation">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                activeTab === tab.id ||
                (tab.id === "medications" && activeTab === "add");

              return (
                <button
                  key={tab.id}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition lg:w-full ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800"
                  }`}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden lg:block">
            <SyncStatusPanel
              syncStatus={syncStatus}
              syncMessage={syncMessage}
              isCloudConfigured={isCloudConfigured}
              lastCloudSyncAt={lastCloudSyncAt}
            />
          </div>
        </aside>

        <section
          ref={pageContentRef}
          className="px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8"
        >
          {activeTab === "dashboard" && (
            <DashboardView
              activeMedicationCount={activeMedications.length}
              todayMedications={todayMedications}
              orderedMedicationGroups={orderedMedicationGroups}
              takenTodayCount={takenTodayCount}
              pendingTodayCount={pendingTodayCount}
              careDayLabel={todayLabel}
              currentClockLabel={currentClockLabel}
              adherenceStats={adherenceStats}
              reminderSettings={reminderSettings}
              healthData={healthData}
              now={today}
              careDayKey={todayKey}
              categories={categories}
              routineCategories={routineCategories}
              onMarkAsTaken={handleMarkAsTaken}
              onUndoTaken={handleUndoTaken}
              onRecordAvoidanceLapse={handleRecordAvoidanceLapse}
              onUndoAvoidanceOutcome={handleUndoAvoidanceOutcome}
              onMarkGroupAsTaken={handleMarkGroupAsTaken}
              onUndoGroupTaken={handleUndoGroupTaken}
              onAddMedication={() => handleTabChange("add")}
              onOpenReports={() => handleTabChange("reports")}
              onOpenHealth={() => handleTabChange("health")}
              onEndCareDay={handleEndCareDay}
            />
          )}

          {activeTab === "health" && (
            <>
              {healthSyncStatus === "error" && (
                <div
                  className="mx-auto mb-4 max-w-7xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                  role="status"
                >
                  Health data is saved on this device, but cloud health sync needs
                  attention. It will retry when the app regains focus.
                </div>
              )}
              <HealthTracker
                careDayKey={todayKey}
                weightEntries={healthData.weightEntries}
                bloodPressureSessions={healthData.bloodPressureSessions}
                dietCheckIns={healthData.dietCheckIns}
                waistEntries={healthData.waistEntries}
                activityCheckIns={healthData.activityCheckIns}
                profile={healthData.profile}
                settings={healthData.settings}
                now={today}
                onAddWeight={handleAddWeight}
                onDeleteWeight={handleDeleteWeight}
                onAddBloodPressure={handleAddBloodPressure}
                onDeleteBloodPressure={handleDeleteBloodPressure}
                onAddDiet={handleAddDietCheckIn}
                onDeleteDiet={handleDeleteDietCheckIn}
                onAddWaist={handleAddWaist}
                onDeleteWaist={handleDeleteWaist}
                onAddActivity={handleAddActivityCheckIn}
                onDeleteActivity={handleDeleteActivityCheckIn}
                onUpdateProfile={handleUpdateHealthProfile}
                onUpdateSettings={handleUpdateHealthSettings}
              />
            </>
          )}

          {activeTab === "reports" && (
            <ReportsView
              medications={medications}
              logs={logs}
              careDayKey={todayKey}
              categories={categories}
              routineCategories={routineCategories}
            />
          )}

          {activeTab === "medications" && (
            <MedicationListView
              medications={activeMedications}
              categories={categories}
              routineCategories={routineCategories}
              onEdit={handleEditMedication}
              onDelete={handleDeleteMedication}
              onAddMedication={() => handleTabChange("add")}
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
                handleTabChange("medications");
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

          {activeTab === "more" && (
            <MoreView
              onNavigate={handleTabChange}
              onEndCareDay={handleEndCareDay}
              onLogout={handleLogout}
              syncStatus={syncStatus}
              syncMessage={syncMessage}
              isCloudConfigured={isCloudConfigured}
              lastCloudSyncAt={lastCloudSyncAt}
            />
          )}
        </section>
      </div>

      <MobileNavigation activeTab={activeTab} onChange={handleTabChange} />
    </main>
  );
}

function MobileNavigation({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  const moreTabs: TabId[] = ["more", "history", "settings", "add"];

  return (
    <nav
      className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(24,31,28,0.08)] backdrop-blur lg:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.id === "more"
              ? moreTabs.includes(activeTab)
              : activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
              }`}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardHealthCard({
  healthData,
  now,
  careDayKey,
  onOpenHealth,
}: {
  healthData: HealthSyncData;
  now: Date;
  careDayKey: string;
  onOpenHealth: () => void;
}) {
  const latestWeight = [...healthData.weightEntries].sort(
    (first, second) =>
      Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
  )[0];
  const latestBloodPressure = [...healthData.bloodPressureSessions].sort(
    (first, second) =>
      Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
  )[0];
  const evaluation = evaluateHealthTasks({
    now,
    careDayKey,
    settings: healthData.settings,
    weightEntries: healthData.weightEntries,
    bloodPressureSessions: healthData.bloodPressureSessions,
    dietCheckIns: healthData.dietCheckIns,
    waistEntries: healthData.waistEntries,
    activityCheckIns: healthData.activityCheckIns,
  });
  const taskLabels = {
    weight: "Weight due",
    "blood-pressure-morning": "After-waking BP due",
    "blood-pressure-evening": "Before-sleep BP due",
    diet: "Diet due",
    waist: "Waist due",
    activity: "Activity review due",
  } as const;
  const urgentBloodPressureTaskId =
    evaluation.bloodPressurePlan.urgentPeriod === "evening"
      ? "blood-pressure-evening"
      : "blood-pressure-morning";
  const tasks = evaluation.tasks
    .filter(
      (task) =>
        task.severity !== "urgent" || task.id === urgentBloodPressureTaskId,
    )
    .flatMap((task) =>
      task.status === "due" ||
      task.status === "partial" ||
      task.severity === "urgent"
        ? [
            task.severity === "urgent"
              ? "Urgent BP review"
              : task.status === "partial"
                ? "Complete BP pair"
                : task.reason === "incomplete-session-saved"
                  ? "Start fresh BP pair"
                : taskLabels[task.kind],
          ]
        : [],
    );
  const average = latestBloodPressure
    ? averageBloodPressure(latestBloodPressure.readings)
    : null;
  const latestBloodPressureTime = latestBloodPressure
    ? Date.parse(latestBloodPressure.measuredAt)
    : Number.NaN;
  const latestBloodPressureAge = now.getTime() - latestBloodPressureTime;
  const latestBloodPressureIsCurrent = Boolean(
    latestBloodPressure &&
      (entryCareDayKey(latestBloodPressure) === careDayKey ||
        (latestBloodPressureAge >= 0 &&
          latestBloodPressureAge <= 6 * 60 * 60 * 1000)),
  );
  const severe = Boolean(
    latestBloodPressureIsCurrent &&
      latestBloodPressure?.readings.some(
        (reading) => reading.systolic >= 180 || reading.diastolic >= 120,
      ),
  );

  return (
    <button
      className={`mb-3 w-full rounded-lg border p-4 text-left shadow-sm transition hover:shadow-md ${
        severe
          ? "border-rose-300 bg-rose-50"
          : "border-sky-200 bg-gradient-to-br from-white to-sky-50"
      }`}
      type="button"
      onClick={onOpenHealth}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <HeartPulse
              className={`h-5 w-5 ${severe ? "text-rose-700" : "text-sky-700"}`}
              aria-hidden="true"
            />
            <h2 className="font-semibold text-zinc-950">
              {severe ? "Urgent health review" : "Health check-in"}
            </h2>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            {tasks.length > 0 ? tasks.join(" · ") : "No health checks due now"}
          </p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-sky-800 shadow-sm">
          Open
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white/80 p-2.5">
          <span className="text-xs text-zinc-500">Latest weight</span>
          <strong className="mt-0.5 block text-zinc-950">
            {latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : "Not recorded"}
          </strong>
        </div>
        <div className="rounded-md bg-white/80 p-2.5">
          <span className="text-xs text-zinc-500">Latest BP average</span>
          <strong className="mt-0.5 block text-zinc-950">
            {average ? `${average.systolic}/${average.diastolic}` : "Record now"}
          </strong>
          {typeof average?.pulseBpm === "number" ? (
            <span className="mt-0.5 block text-xs text-zinc-500">
              Pulse {Math.round(average.pulseBpm)} bpm
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MoreView({
  onNavigate,
  onEndCareDay,
  onLogout,
  syncStatus,
  syncMessage,
  isCloudConfigured,
  lastCloudSyncAt,
}: {
  onNavigate: (tab: TabId) => void;
  onEndCareDay: () => void;
  onLogout: () => void;
  syncStatus: CloudSyncStatus;
  syncMessage: string;
  isCloudConfigured: boolean;
  lastCloudSyncAt: string;
}) {
  const actions: {
    tab: TabId;
    label: string;
    description: string;
    icon: typeof Activity;
  }[] = [
    {
      tab: "add",
      label: "Add medication",
      description: "Create a medication or care item",
      icon: Plus,
    },
    {
      tab: "history",
      label: "History",
      description: "Review and backfill care logs",
      icon: History,
    },
    {
      tab: "settings",
      label: "Settings",
      description: "Reminders, categories, and routines",
      icon: Settings,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="More" description="History, settings, sync, and account" />

      <section className="grid gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.tab}
              className="flex min-h-20 items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
              type="button"
              onClick={() => onNavigate(action.tab)}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-zinc-950">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                  {action.description}
                </span>
              </span>
            </button>
          );
        })}
      </section>

      <SyncStatusPanel
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        isCloudConfigured={isCloudConfigured}
        lastCloudSyncAt={lastCloudSyncAt}
      />

      <section className="mt-5 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          type="button"
          onClick={onEndCareDay}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          End previous care day
        </button>
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          type="button"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </section>
    </div>
  );
}

function DashboardView({
  activeMedicationCount,
  todayMedications,
  orderedMedicationGroups,
  takenTodayCount,
  pendingTodayCount,
  careDayLabel,
  currentClockLabel,
  adherenceStats,
  reminderSettings,
  healthData,
  now,
  careDayKey,
  categories,
  routineCategories,
  onMarkAsTaken,
  onUndoTaken,
  onRecordAvoidanceLapse,
  onUndoAvoidanceOutcome,
  onMarkGroupAsTaken,
  onUndoGroupTaken,
  onAddMedication,
  onOpenReports,
  onOpenHealth,
  onEndCareDay,
}: {
  activeMedicationCount: number;
  todayMedications: TodayMedication[];
  orderedMedicationGroups: OrderedMedicationGroup[];
  takenTodayCount: number;
  pendingTodayCount: number;
  careDayLabel: string;
  currentClockLabel: string;
  adherenceStats: AdherenceStats;
  reminderSettings: ReminderSettings;
  healthData: HealthSyncData;
  now: Date;
  careDayKey: string;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
  onMarkAsTaken: (entry: TodayMedication) => void;
  onUndoTaken: (entry: TodayMedication) => void;
  onRecordAvoidanceLapse: (entry: TodayMedication) => void;
  onUndoAvoidanceOutcome: (entry: TodayMedication) => void;
  onMarkGroupAsTaken: (entries: TodayMedication[]) => void;
  onUndoGroupTaken: (entries: TodayMedication[]) => void;
  onAddMedication: () => void;
  onOpenReports: () => void;
  onOpenHealth: () => void;
  onEndCareDay: () => void;
}) {
  const avoidanceEntries = todayMedications.filter(isAvoidanceEntry);
  const completionEntries = todayMedications.filter(
    (entry) => !isAvoidanceEntry(entry),
  );
  const timedMedications = completionEntries.filter(
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
  const resolvedTodayCount = takenTodayCount +
    avoidanceEntries.filter((entry) => Boolean(entry.lapseLogId)).length;
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
        title="Today"
        description="Your daily care checklist"
        action={
          <div className="hidden gap-2 lg:flex">
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

      <DashboardHealthCard
        healthData={healthData}
        now={now}
        careDayKey={careDayKey}
        onOpenHealth={onOpenHealth}
      />

      {avoidanceEntries.length > 0 && (
        <AvoidanceCheckInCard
          entries={avoidanceEntries}
          onRecordLapse={onRecordAvoidanceLapse}
          onRecordSuccess={onMarkAsTaken}
          onUndo={onUndoAvoidanceOutcome}
        />
      )}

      <section className="mb-4 hidden rounded-lg border border-emerald-100 bg-white p-5 shadow-sm sm:block">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-base font-semibold text-white sm:h-16 sm:w-16 sm:text-xl">
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
              <p className="mt-1 hidden max-w-2xl text-sm text-zinc-500 sm:block">
                Current clock: {currentClockLabel} Iran time. This care day stays open
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

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          icon={CalendarDays}
          label="Due today"
          value={todayMedications.length}
          tone="emerald"
        />
        <StatTile
          icon={CheckCircle2}
          label="Successful today"
          value={takenTodayCount}
          tone="sky"
        />
        <StatTile
          icon={AlarmClock}
          label="Still pending"
          value={pendingTodayCount}
          tone="rose"
        />
        <button
          className="text-left"
          type="button"
          onClick={onOpenReports}
          title="Open detailed reports"
        >
          <StatTile
            icon={BarChart3}
            label="7-day adherence"
            value={`${adherenceStats.rate}%`}
            tone="amber"
          />
        </button>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">
                Care Checklist
              </h2>
              <p className="text-sm text-zinc-500">
                {resolvedTodayCount} of {todayMedications.length} outcomes recorded
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
                        No pending medication or routine items
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
              <h2 className="font-semibold text-zinc-950">Quick status</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Active items</dt>
                <dd className="font-semibold text-zinc-900">
                  {activeMedicationCount}
                </dd>
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
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              type="button"
              onClick={onOpenReports}
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Open detailed reports
            </button>
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

function AvoidanceCheckInCard({
  entries,
  onRecordLapse,
  onRecordSuccess,
  onUndo,
}: {
  entries: TodayMedication[];
  onRecordLapse: (entry: TodayMedication) => void;
  onRecordSuccess: (entry: TodayMedication) => void;
  onUndo: (entry: TodayMedication) => void;
}) {
  return (
    <section className="mb-4 rounded-lg border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-950">Hookah check-in</h2>
          <p className="mt-1 text-sm leading-5 text-zinc-600">
            If you smoke, log it immediately. This records a negative event,
            saves the time, and removes the check-in from pending.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {entries.map((entry) => {
          const hasLapse = Boolean(entry.lapseLogId);

          if (hasLapse) {
            const recordedTime = entry.lapseRecordedAt
              ? getTehranTime(new Date(entry.lapseRecordedAt))
              : null;

            return (
              <div
                key={`avoidance-${entry.medication.id}`}
                className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-rose-950">
                      Hookah use recorded
                    </p>
                    <p className="mt-0.5 text-sm text-rose-800">
                      {recordedTime
                        ? `Recorded today at ${recordedTime}`
                        : "Recorded today"}
                      . This is not counted as a completed task.
                    </p>
                  </div>
                </div>
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 sm:w-auto"
                  type="button"
                  onClick={() => onUndo(entry)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Undo
                </button>
              </div>
            );
          }

          if (entry.isTaken) {
            return (
              <div
                key={`avoidance-${entry.medication.id}`}
                className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-emerald-950">
                      Hookah-free day recorded
                    </p>
                    <p className="mt-0.5 text-sm text-emerald-800">
                      Today is saved as a hookah-free day.
                    </p>
                  </div>
                </div>
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 sm:w-auto"
                  type="button"
                  onClick={() => onUndo(entry)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Undo
                </button>
              </div>
            );
          }

          return (
            <div
              key={`avoidance-${entry.medication.id}`}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
            >
              <div>
                <p className="font-semibold text-zinc-950">Hookah-free today?</p>
                <p className="mt-1 text-sm text-zinc-600">
                  One tap records what happened. No confirmation is required.
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
                  type="button"
                  onClick={() => onRecordLapse(entry)}
                  aria-label="Log hookah use now"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span dir="auto">I smoked hookah · قلیان کشیدم</span>
                </button>
                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
                  type="button"
                  onClick={() => onRecordSuccess(entry)}
                  aria-label="Record a hookah-free day"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  End day: I stayed hookah-free
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
            className={`min-w-0 break-words font-semibold ${
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
          <details className="mt-2 text-sm text-zinc-500">
            <summary className="cursor-pointer font-medium text-emerald-800">
              Details
            </summary>
            <p className="mt-1 leading-5">{entry.medication.notes}</p>
          </details>
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
          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${
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
                    title="Remove from daily list (keeps history)"
                    aria-label={`Remove ${medication.name} from daily list`}
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
              Times (Iran time)
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
  const backfillEntries = buildMedicationEntriesForDate(
    activeMedications,
    logs,
    selectedDate,
  ).filter((entry) => !isAvoidanceEntry(entry));
  const missingEntries = backfillEntries.filter(
    (entry) => !isEntryResolved(entry),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="History" description="Past care and event logs" />

      <section className="mb-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Backfill a Care Day
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a day, then mark anything you actually took but forgot to
              check. Hookah use can only be recorded at the time it happens.
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
              Activity Logs
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
              const isLapse = log.status === "lapse";

              return (
                <article
                  key={log.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    isLapse
                      ? "border-rose-200 bg-rose-50/50"
                      : "border-zinc-200"
                  }`}
                >
                <div className="flex gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isLapse
                        ? "bg-rose-100 text-rose-700"
                        : toneClasses.iconClassName
                    }`}
                  >
                    {isLapse ? (
                      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    )}
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
                      {isLapse && (
                        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                          Hookah use recorded
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {isLapse
                        ? "Negative event recorded at the time it was reported"
                        : `${log.dosage} ${log.unit} - ${getLogScheduleLabel(log, routineCategories)}`}
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
                This switch covers medication and health alerts. In-app toasts and
                supported foreground browser alerts work while MedTrack is open. A
                closed or suspended mobile app cannot yet receive scheduled alerts
                reliably. Every reminder below uses Iran time (Asia/Tehran), regardless
                of the phone or browser time zone.
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
                Medication + health alerts
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

function ReportsView({
  medications,
  logs,
  careDayKey,
  categories,
  routineCategories,
}: {
  medications: Medication[];
  logs: IntakeLog[];
  careDayKey: string;
  categories: MedicationCategoryOption[];
  routineCategories: RoutineCategory[];
}) {
  const [rangeId, setRangeId] = useState<AdherenceRangeId>("7d");
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(
    careDayKey,
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const dayCount =
    ADHERENCE_RANGE_OPTIONS.find((range) => range.id === rangeId)?.days ?? 7;

  const dayDetails = useMemo(
    () =>
      getReportDayDetails(
        medications,
        logs,
        careDayKey,
        dayCount,
        routineCategories,
      ),
    [careDayKey, dayCount, logs, medications, routineCategories],
  );

  const series = useMemo(
    () =>
      [...dayDetails]
        .reverse()
        .map(({ dateKey, label, shortLabel, due, taken, rate }) => ({
          dateKey,
          label,
          shortLabel,
          due,
          taken,
          rate,
        })),
    [dayDetails],
  );

  const itemReports = useMemo(
    () => getItemReports(medications, dayDetails),
    [dayDetails, medications],
  );

  const categoryReports = useMemo(
    () => getCategoryReports(itemReports),
    [itemReports],
  );

  const selectedItem =
    itemReports.find((item) => item.medicationId === selectedItemId) ??
    itemReports[0] ??
    null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Reports"
        description="Detailed adherence charts, day reviews, and per-item performance"
      />

      <AdherenceChartCard
        rangeId={rangeId}
        onRangeChange={(nextRangeId) => {
          setRangeId(nextRangeId);
          setExpandedDayKey(careDayKey);
        }}
        series={series}
      />

      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Category breakdown
            </h2>
            <p className="text-sm text-zinc-500">
              Completion rate by category in the selected range
            </p>
          </div>
        </div>

        {categoryReports.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            No scheduled items in this range yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categoryReports.map((report) => {
              const category = getMedicationCategoryOption(
                categories,
                report.categoryId,
              );
              const toneClasses = CATEGORY_TONE_CLASSES[category.tone];

              return (
                <article
                  key={report.categoryId}
                  className="rounded-lg border border-zinc-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <CategoryBadge
                      categoryId={report.categoryId}
                      categories={categories}
                    />
                    <span className="text-lg font-semibold text-zinc-950">
                      {report.rate}%
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-500">
                    {report.taken}/{report.due} completed
                    {report.lapses > 0
                      ? ` · ${report.lapses} hookah use ${
                          report.lapses === 1 ? "event" : "events"
                        } recorded`
                      : ""}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full ${toneClasses.swatchClassName}`}
                      style={{ width: `${report.rate}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-zinc-950">
              Day-by-day review
            </h2>
            <p className="text-sm text-zinc-500">
              Expand any day to see exactly what was done and what was missed
            </p>
          </div>

          <div className="space-y-2">
            {dayDetails.map((day) => {
              const isExpanded = expandedDayKey === day.dateKey;
              const lapseEntries = day.entries.filter((entry) => entry.hasLapse);
              const missedEntries = day.entries.filter(
                (entry) => !entry.isTaken && !entry.hasLapse,
              );
              const takenEntries = day.entries.filter((entry) => entry.isTaken);
              const daySummary =
                day.due === 0
                  ? "No scheduled items"
                  : `${day.taken}/${day.due} done${
                      lapseEntries.length > 0
                        ? ` · ${lapseEntries.length} hookah use ${
                            lapseEntries.length === 1 ? "event" : "events"
                          }`
                        : ""
                    } · ${missedEntries.length} unrecorded · ${day.rate}%`;

              return (
                <article
                  key={day.dateKey}
                  className="overflow-hidden rounded-lg border border-zinc-200"
                >
                  <button
                    className="flex w-full items-center justify-between gap-3 bg-zinc-50 px-3 py-3 text-left transition hover:bg-white"
                    type="button"
                    onClick={() =>
                      setExpandedDayKey((current) =>
                        current === day.dateKey ? null : day.dateKey,
                      )
                    }
                    aria-expanded={isExpanded}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-950">
                        {day.label}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-zinc-500">
                        {daySummary}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          day.due === 0
                            ? "bg-zinc-100 text-zinc-500"
                            : day.rate === 100
                              ? "bg-emerald-100 text-emerald-800"
                              : day.rate >= 70
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {day.due === 0 ? "Empty" : `${day.rate}%`}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-500 transition ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-4 border-t border-zinc-200 p-3">
                      {day.entries.length === 0 ? (
                        <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-500">
                          Nothing was scheduled for this care day.
                        </p>
                      ) : (
                        <>
                          <div>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-emerald-700">
                              Done ({takenEntries.length})
                            </h3>
                            {takenEntries.length === 0 ? (
                              <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-500">
                                No items completed.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {takenEntries.map((entry) => (
                                  <ReportEntryRow
                                    key={`taken-${entry.key}`}
                                    entry={entry}
                                    categories={categories}
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          {lapseEntries.length > 0 && (
                            <div>
                              <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-rose-700">
                                Hookah use recorded ({lapseEntries.length})
                              </h3>
                              <div className="space-y-2">
                                {lapseEntries.map((entry) => (
                                  <ReportEntryRow
                                    key={`lapse-${entry.key}`}
                                    entry={entry}
                                    categories={categories}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-amber-700">
                              Not recorded ({missedEntries.length})
                            </h3>
                            {missedEntries.length === 0 ? (
                              <p className="rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                                No unresolved items.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {missedEntries.map((entry) => (
                                  <ReportEntryRow
                                    key={`missed-${entry.key}`}
                                    entry={entry}
                                    categories={categories}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-zinc-950">
              Item performance
            </h2>
            <p className="text-sm text-zinc-500">
              See how consistently each item was completed
            </p>
          </div>

          {itemReports.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No item data yet"
              description="Once you track scheduled items, per-item reports appear here."
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {itemReports.map((item) => {
                  const isSelected =
                    (selectedItem?.medicationId ?? null) === item.medicationId;

                  return (
                    <button
                      key={item.medicationId}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
                          : "border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                      }`}
                      type="button"
                      onClick={() => setSelectedItemId(item.medicationId)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-zinc-950">
                              {item.medicationName}
                            </h3>
                            <CategoryBadge
                              categoryId={item.categoryId}
                              categories={categories}
                            />
                            {!item.isActive && (
                              <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {item.dosage} {item.unit} · {item.taken}/{item.due}{" "}
                            · {item.missed} unrecorded
                            {item.lapses > 0
                              ? ` · ${item.lapses} hookah use ${
                                  item.lapses === 1 ? "event" : "events"
                                }`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold ${
                            item.rate >= 80
                              ? "text-emerald-700"
                              : item.rate >= 50
                                ? "text-amber-700"
                                : "text-rose-700"
                          }`}
                        >
                          {item.rate}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${
                            item.rate >= 80
                              ? "bg-emerald-500"
                              : item.rate >= 50
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          }`}
                          style={{ width: `${item.rate}%` }}
                        />
                      </div>
                      <ItemSparkline points={item.points} />
                    </button>
                  );
                })}
              </div>

              {selectedItem && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-zinc-950">
                      {selectedItem.medicationName}
                    </h3>
                    <CategoryBadge
                      categoryId={selectedItem.categoryId}
                      categories={categories}
                    />
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    Detailed timeline for the selected range. Green = done,
                    rose = hookah use recorded, amber = unrecorded, gray = not
                    due that day.
                  </p>
                  <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-10">
                    {selectedItem.points.map((point) => (
                      <div
                        key={`${selectedItem.medicationId}-${point.dateKey}`}
                        className={`rounded-md px-1 py-2 text-center ${
                          !point.wasDue
                            ? "bg-zinc-200/70"
                            : point.hasLapse
                              ? "bg-rose-500 text-white"
                              : point.isTaken
                              ? "bg-emerald-500 text-white"
                              : "bg-amber-300 text-amber-950"
                        }`}
                        title={`${point.dateKey}: ${
                          !point.wasDue
                            ? "Not due"
                            : point.hasLapse
                              ? "Hookah use recorded"
                            : point.isTaken
                              ? "Done"
                              : "Not recorded"
                        }`}
                      >
                        <span className="block text-[10px] font-semibold leading-3">
                          {point.shortLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                  <dl
                    className={`mt-4 grid gap-2 text-center text-sm ${
                      selectedItem.lapses > 0
                        ? "grid-cols-2 sm:grid-cols-4"
                        : "grid-cols-3"
                    }`}
                  >
                    <div className="rounded-md bg-white p-2">
                      <dt className="text-xs text-zinc-500">Due</dt>
                      <dd className="font-semibold text-zinc-900">
                        {selectedItem.due}
                      </dd>
                    </div>
                    <div className="rounded-md bg-white p-2">
                      <dt className="text-xs text-zinc-500">Done</dt>
                      <dd className="font-semibold text-emerald-700">
                        {selectedItem.taken}
                      </dd>
                    </div>
                    {selectedItem.lapses > 0 && (
                      <div className="rounded-md bg-rose-50 p-2">
                        <dt className="text-xs text-rose-700">Hookah use</dt>
                        <dd className="font-semibold text-rose-800">
                          {selectedItem.lapses}
                        </dd>
                      </div>
                    )}
                    <div className="rounded-md bg-white p-2">
                      <dt className="text-xs text-zinc-500">Unrecorded</dt>
                      <dd className="font-semibold text-amber-700">
                        {selectedItem.missed}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReportEntryRow({
  entry,
  categories,
}: {
  entry: ReportEntryDetail;
  categories: MedicationCategoryOption[];
}) {
  const outcomeClasses = entry.hasLapse
    ? "border-rose-200 bg-rose-50/60"
    : entry.isTaken
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-amber-200 bg-amber-50/50";
  const badgeClasses = entry.hasLapse
    ? "bg-rose-100 text-rose-800"
    : entry.isTaken
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-800";

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between ${outcomeClasses}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-zinc-950">{entry.medicationName}</p>
          <CategoryBadge categoryId={entry.categoryId} categories={categories} />
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {entry.dosage} {entry.unit} · {entry.scheduleLabel}
        </p>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${badgeClasses}`}
      >
        {entry.hasLapse ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : entry.isTaken ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {entry.hasLapse
          ? "Hookah use recorded"
          : entry.isTaken
            ? "Done"
            : "Not recorded"}
      </span>
    </div>
  );
}

function ItemSparkline({ points }: { points: ItemReportPoint[] }) {
  if (points.length === 0) {
    return null;
  }

  const displayPoints =
    points.length > 42
      ? points.slice(points.length - 42)
      : points;

  return (
    <div className="mt-3 flex h-8 items-end gap-0.5">
      {displayPoints.map((point) => (
        <span
          key={point.dateKey}
          className={`min-w-0 flex-1 rounded-sm ${
           !point.wasDue
              ? "bg-zinc-200"
              : point.hasLapse
                ? "bg-rose-500"
                : point.isTaken
                ? "bg-emerald-500"
                : "bg-amber-300"
          }`}
          style={{
            height: !point.wasDue
              ? "25%"
              : point.isTaken
                ? "100%"
                : point.hasLapse
                  ? "75%"
                  : "45%",
          }}
          title={`${point.dateKey}: ${
            !point.wasDue
              ? "Not due"
              : point.hasLapse
                ? "Hookah use recorded"
                : point.isTaken
                  ? "Done"
                  : "Not recorded"
          }`}
        />
      ))}
    </div>
  );
}

function summarizeAdherenceSeries(series: AdherenceDayPoint[]) {
  const due = series.reduce((sum, point) => sum + point.due, 0);
  const taken = series.reduce((sum, point) => sum + point.taken, 0);
  const trackedDays = series.filter((point) => point.due > 0).length;
  const perfectDays = series.filter(
    (point) => point.due > 0 && point.taken === point.due,
  ).length;

  return {
    due,
    taken,
    rate: due === 0 ? 0 : Math.round((taken / due) * 100),
    trackedDays,
    perfectDays,
  };
}

function buildChartDisplayPoints(series: AdherenceDayPoint[]) {
  if (series.length <= 45) {
    return series.map((point) => ({
      ...point,
      displayLabel: point.shortLabel,
    }));
  }

  const bucketCount = 30;
  const bucketSize = Math.ceil(series.length / bucketCount);
  const buckets: Array<
    AdherenceDayPoint & {
      displayLabel: string;
    }
  > = [];

  for (let index = 0; index < series.length; index += bucketSize) {
    const chunk = series.slice(index, index + bucketSize);
    const due = chunk.reduce((sum, point) => sum + point.due, 0);
    const taken = chunk.reduce((sum, point) => sum + point.taken, 0);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];

    buckets.push({
      dateKey: first.dateKey,
      label:
        first.dateKey === last.dateKey
          ? first.label
          : `${first.label} - ${last.label}`,
      shortLabel: first.shortLabel,
      displayLabel: first.shortLabel,
      due,
      taken,
      rate: due === 0 ? 0 : Math.round((taken / due) * 100),
    });
  }

  return buckets;
}

function AdherenceChartCard({
  rangeId,
  onRangeChange,
  series,
}: {
  rangeId: AdherenceRangeId;
  onRangeChange: (rangeId: AdherenceRangeId) => void;
  series: AdherenceDayPoint[];
}) {
  const summary = summarizeAdherenceSeries(series);
  const displayPoints = buildChartDisplayPoints(series);
  const chartHeight = 168;
  const chartWidth = Math.max(displayPoints.length * 18, 320);
  const maxDue = Math.max(...displayPoints.map((point) => point.due), 1);
  const rangeLabel =
    ADHERENCE_RANGE_OPTIONS.find((range) => range.id === rangeId)?.label ??
    rangeId;

  return (
    <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-zinc-950">
              Adherence overview
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Filter by 1 day, 1 week, 1 month, 3 months, 6 months, or 1 year.
            New items only affect adherence from the day they were added.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ADHERENCE_RANGE_OPTIONS.map((range) => {
            const isSelected = range.id === rangeId;

            return (
              <button
                key={range.id}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
                type="button"
                onClick={() => onRangeChange(range.id)}
              >
                {range.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
            Adherence
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-950">
            {summary.rate}%
          </p>
          <p className="mt-1 text-xs text-emerald-800">{rangeLabel}</p>
        </div>
        <div className="rounded-md bg-sky-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">
            Taken / due
          </p>
          <p className="mt-1 text-2xl font-semibold text-sky-950">
            {summary.taken}/{summary.due}
          </p>
          <p className="mt-1 text-xs text-sky-800">Scheduled items completed</p>
        </div>
        <div className="rounded-md bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-amber-700">
            Perfect days
          </p>
          <p className="mt-1 text-2xl font-semibold text-amber-950">
            {summary.perfectDays}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            of {summary.trackedDays} tracked days
          </p>
        </div>
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            Daily average
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950">
            {summary.trackedDays === 0
              ? "0"
              : (summary.taken / summary.trackedDays).toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Taken items per tracked day</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
        {displayPoints.every((point) => point.due === 0) ? (
          <p className="rounded-md bg-white p-4 text-sm text-zinc-500">
            No scheduled items in this range yet. Mark doses to build the chart.
          </p>
        ) : (
          <svg
            role="img"
            aria-label={`Adherence chart for ${rangeLabel}`}
            viewBox={`0 0 ${chartWidth} ${chartHeight + 36}`}
            className="min-w-full"
            style={{ height: chartHeight + 36, minWidth: chartWidth }}
          >
            <title>{`Adherence chart for ${rangeLabel}`}</title>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = chartHeight - fraction * (chartHeight - 12) + 8;

              return (
                <line
                  key={`grid-${fraction}`}
                  x1={0}
                  x2={chartWidth}
                  y1={y}
                  y2={y}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                />
              );
            })}

            {displayPoints.map((point, index) => {
              const slotWidth = chartWidth / displayPoints.length;
              const barWidth = Math.max(slotWidth * 0.55, 4);
              const x = index * slotWidth + (slotWidth - barWidth) / 2;
              const dueHeight =
                point.due === 0
                  ? 0
                  : Math.max((point.due / maxDue) * (chartHeight - 12), 2);
              const takenHeight =
                point.due === 0
                  ? 0
                  : Math.max((point.taken / maxDue) * (chartHeight - 12), point.taken > 0 ? 2 : 0);
              const baseY = chartHeight + 8;
              const showLabel =
                displayPoints.length <= 14 ||
                index === 0 ||
                index === displayPoints.length - 1 ||
                index % Math.ceil(displayPoints.length / 6) === 0;

              return (
                <g key={`${point.dateKey}-${index}`}>
                  <rect
                    x={x}
                    y={baseY - dueHeight}
                    width={barWidth}
                    height={dueHeight}
                    rx={3}
                    fill="#d4d4d8"
                  />
                  <rect
                    x={x}
                    y={baseY - takenHeight}
                    width={barWidth}
                    height={takenHeight}
                    rx={3}
                    fill={
                      point.due > 0 && point.taken === point.due
                        ? "#059669"
                        : "#34d399"
                    }
                  >
                    <title>
                      {`${point.label}: ${point.taken}/${point.due} (${point.rate}%)`}
                    </title>
                  </rect>
                  {showLabel && (
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 28}
                      textAnchor="middle"
                      className="fill-zinc-500"
                      fontSize="10"
                    >
                      {point.displayLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-300" />
          Due
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          Taken
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
          Perfect day
        </span>
      </div>
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
    <article className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 sm:text-sm">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-3xl">
            {value}
          </p>
        </div>
        <div
          className={`hidden h-11 w-11 items-center justify-center rounded-lg sm:flex ${toneClasses[tone]}`}
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
