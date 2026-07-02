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
  IntakeLog,
  Medication,
  MedicationCategory,
  WeekDay,
} from "@/types";

type TabId = "dashboard" | "medications" | "add" | "history";

type MedicationFormState = {
  id: string | null;
  name: string;
  dosage: string;
  unit: string;
  category: MedicationCategory;
  times: string[];
  timeInput: string;
  days: WeekDay[];
  daily: boolean;
  notes: string;
};

type TodayMedication = {
  medication: Medication;
  time: string;
  isTaken: boolean;
};

const LOGIN_USERNAME = "mail@mehrdadnaderi.com";
const LOGIN_PASSWORD = "Naderi$2050";
const MEDICATIONS_STORAGE_KEY = "medtrack-medications";
const LOGS_STORAGE_KEY = "medtrack-intake-logs";

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

const TABS: {
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "medications", label: "My Medications", icon: ClipboardList },
  { id: "add", label: "Add Medication", icon: Plus },
  { id: "history", label: "History", icon: History },
];

const CATEGORY_META: Record<
  MedicationCategory,
  {
    label: string;
    className: string;
    iconClassName: string;
    dotClassName: string;
  }
> = {
  skin: {
    label: "Skin",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    iconClassName: "bg-rose-100 text-rose-700",
    dotClassName: "bg-rose-500",
  },
  hair: {
    label: "Hair",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    iconClassName: "bg-amber-100 text-amber-800",
    dotClassName: "bg-amber-500",
  },
  "blood-pressure": {
    label: "Blood pressure",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    iconClassName: "bg-sky-100 text-sky-800",
    dotClassName: "bg-sky-500",
  },
  liver: {
    label: "Liver",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconClassName: "bg-emerald-100 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  other: {
    label: "Other",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
    iconClassName: "bg-zinc-100 text-zinc-700",
    dotClassName: "bg-zinc-400",
  },
};

const UNITS = [
  "mg",
  "ml",
  "tablet",
  "capsule",
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
    category: "other",
    times: ["08:00"],
    timeInput: "08:00",
    days: ALL_DAYS,
    daily: true,
    notes: "",
  };
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMedicationCategory(value: unknown): value is MedicationCategory {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CATEGORY_META, value)
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

  return {
    id: normalizeString(value.id, createId()),
    name: normalizeString(value.name, "Unnamed medication"),
    dosage: normalizeString(value.dosage),
    unit: normalizeString(value.unit, "mg"),
    category: isMedicationCategory(value.category) ? value.category : "other",
    schedule: {
      times: times.length > 0 ? Array.from(new Set(times)).sort() : ["08:00"],
      days: days.length > 0 ? days : ALL_DAYS,
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

  return {
    id: normalizeString(value.id, createId()),
    medicationId: normalizeString(value.medicationId),
    medicationName: normalizeString(value.medicationName, "Medication"),
    dosage: normalizeString(value.dosage),
    unit: normalizeString(value.unit, "mg"),
    category: isMedicationCategory(value.category) ? value.category : "other",
    scheduledTime: normalizeTime(value.scheduledTime) ?? "08:00",
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

function getMedicationDaysLabel(days: WeekDay[]) {
  if (days.length === WEEK_DAYS.length) {
    return "Daily";
  }

  return WEEK_DAYS.filter((day) => days.includes(day.id))
    .map((day) => day.short)
    .join(", ");
}

export default function MedTrackApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<IntakeLog[]>([]);
  const [form, setForm] = useState<MedicationFormState>(() =>
    createEmptyForm(),
  );
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

      setMedications(
        readStoredArray<Medication>(
          MEDICATIONS_STORAGE_KEY,
          normalizeMedication,
        ),
      );
      setLogs(readStoredArray<IntakeLog>(LOGS_STORAGE_KEY, normalizeIntakeLog));
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
    const intervalId = window.setInterval(
      () => setToday(new Date()),
      60 * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, []);

  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.isActive),
    [medications],
  );

  const todayMedications = useMemo<TodayMedication[]>(() => {
    if (!today) {
      return [];
    }

    const todayDay = getTodayDay(today);

    return activeMedications
      .filter((medication) => medication.schedule.days.includes(todayDay))
      .flatMap((medication) =>
        medication.schedule.times.map((time) => ({
          medication,
          time,
          isTaken: logs.some(
            (log) =>
              log.medicationId === medication.id &&
              log.scheduledTime === time &&
              log.date === todayKey,
          ),
        })),
      )
      .sort((first, second) => first.time.localeCompare(second.time));
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

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      setIsAuthenticated(true);
      setPassword("");
      toast.success("Welcome back to MedTrack");
      return;
    }

    toast.error("Invalid username or password");
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

  function handleDailyChange(isDaily: boolean) {
    setForm((currentForm) => ({
      ...currentForm,
      daily: isDaily,
      days: isDaily ? ALL_DAYS : [],
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

  function handleMedicationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const dosage = form.dosage.trim();
    const unit = form.unit.trim();
    const times = Array.from(new Set(form.times)).sort();
    const selectedDays = form.daily
      ? ALL_DAYS
      : WEEK_DAYS.map((day) => day.id).filter((day) =>
          form.days.includes(day),
        );

    if (!name || !dosage || !unit) {
      toast.error("Name, dosage, and unit are required");
      return;
    }

    if (times.length === 0) {
      toast.error("Add at least one scheduled time");
      return;
    }

    if (selectedDays.length === 0) {
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
        times,
        days: selectedDays,
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
      times: [...medication.schedule.times].sort(),
      timeInput: medication.schedule.times[0] ?? "08:00",
      days: [...medication.schedule.days],
      daily: medication.schedule.days.length === WEEK_DAYS.length,
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

    const log: IntakeLog = {
      id: createId(),
      medicationId: entry.medication.id,
      medicationName: entry.medication.name,
      dosage: entry.medication.dosage,
      unit: entry.medication.unit,
      category: entry.medication.category,
      scheduledTime: entry.time,
      takenAt: new Date().toISOString(),
      date: todayKey,
      status: "taken",
      notes: entry.medication.notes || undefined,
    };

    setLogs((currentLogs) => [log, ...currentLogs]);
    toast.success(`${entry.medication.name} marked as taken`);
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
              onClick={() => setIsAuthenticated(false)}
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
              takenTodayCount={takenTodayCount}
              logCount={logs.length}
              onMarkAsTaken={handleMarkAsTaken}
              onAddMedication={() => setActiveTab("add")}
            />
          )}

          {activeTab === "medications" && (
            <MedicationListView
              medications={activeMedications}
              onEdit={handleEditMedication}
              onDelete={handleDeleteMedication}
              onAddMedication={() => setActiveTab("add")}
            />
          )}

          {activeTab === "add" && (
            <MedicationFormView
              form={form}
              setForm={setForm}
              onSubmit={handleMedicationSubmit}
              onAddTime={handleAddTime}
              onRemoveTime={handleRemoveTime}
              onDailyChange={handleDailyChange}
              onDayToggle={handleDayToggle}
              onCancelEdit={() => {
                resetForm();
                setActiveTab("medications");
              }}
            />
          )}

          {activeTab === "history" && <HistoryView logs={sortedLogs} />}
        </section>
      </div>
    </main>
  );
}

function DashboardView({
  activeMedicationCount,
  todayMedications,
  takenTodayCount,
  logCount,
  onMarkAsTaken,
  onAddMedication,
}: {
  activeMedicationCount: number;
  todayMedications: TodayMedication[];
  takenTodayCount: number;
  logCount: number;
  onMarkAsTaken: (entry: TodayMedication) => void;
  onAddMedication: () => void;
}) {
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
          <div className="space-y-3">
            {todayMedications.map((entry) => (
              <div
                key={`${entry.medication.id}-${entry.time}`}
                className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                      CATEGORY_META[entry.medication.category].iconClassName
                    }`}
                  >
                    <Pill className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-zinc-950">
                        {entry.medication.name}
                      </h3>
                      <CategoryBadge category={entry.medication.category} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {entry.medication.dosage} {entry.medication.unit} at{" "}
                      {formatReadableTime(entry.time)}
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MedicationListView({
  medications,
  onEdit,
  onDelete,
  onAddMedication,
}: {
  medications: Medication[];
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
          {medications.map((medication) => (
            <article
              key={medication.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                      CATEGORY_META[medication.category].iconClassName
                    }`}
                  >
                    <Pill className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">
                        {medication.name}
                      </h2>
                      <CategoryBadge category={medication.category} />
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
                  <dt className="font-medium text-zinc-500">Times</dt>
                  <dd className="mt-1 text-zinc-800">
                    {medication.schedule.times
                      .map((time) => formatReadableTime(time))
                      .join(", ")}
                  </dd>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <dt className="font-medium text-zinc-500">Days</dt>
                  <dd className="mt-1 text-zinc-800">
                    {getMedicationDaysLabel(medication.schedule.days)}
                  </dd>
                </div>
              </dl>

              {medication.notes && (
                <p className="mt-4 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
                  {medication.notes}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function MedicationFormView({
  form,
  setForm,
  onSubmit,
  onAddTime,
  onRemoveTime,
  onDailyChange,
  onDayToggle,
  onCancelEdit,
}: {
  form: MedicationFormState;
  setForm: Dispatch<SetStateAction<MedicationFormState>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddTime: () => void;
  onRemoveTime: (time: string) => void;
  onDailyChange: (isDaily: boolean) => void;
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
                  category: event.target.value as MedicationCategory,
                }))
              }
            >
              {Object.entries(CATEGORY_META).map(([category, meta]) => (
                <option key={category} value={category}>
                  {meta.label}
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

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-zinc-700">Days</span>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                className="h-4 w-4 accent-emerald-600"
                type="checkbox"
                checked={form.daily}
                onChange={(event) => onDailyChange(event.target.checked)}
              />
              Daily
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {WEEK_DAYS.map((day) => {
              const isSelected = form.days.includes(day.id);

              return (
                <button
                  key={day.id}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-emerald-200 hover:bg-emerald-50"
                  } ${form.daily ? "cursor-default opacity-80" : ""}`}
                  type="button"
                  onClick={() => onDayToggle(day.id)}
                  disabled={form.daily}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
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

function HistoryView({ logs }: { logs: IntakeLog[] }) {
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
            {logs.map((log) => (
              <article
                key={log.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      CATEGORY_META[log.category].iconClassName
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">
                        {log.medicationName}
                      </h2>
                      <CategoryBadge category={log.category} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      {log.dosage} {log.unit} scheduled for{" "}
                      {formatReadableTime(log.scheduledTime)}
                    </p>
                  </div>
                </div>
                <time className="text-sm font-medium text-zinc-500">
                  {formatLogDate(log.takenAt)}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
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

function CategoryBadge({ category }: { category: MedicationCategory }) {
  const meta = CATEGORY_META[category];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-sm ${meta.dotClassName}`} />
      {meta.label}
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
