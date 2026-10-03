"use client";

import { useRef, useState, type FormEvent } from "react";
import { Moon, Sunrise, Plus, Pencil, Clock3 } from "lucide-react";
import type { SleepKind, SleepQuality, SleepSession } from "@/types/health";
import { getTrailingTehranDateKeys } from "./health-data";
import {
  formatTehranInstant,
  tehranDateKey,
  tehranDateTimeLocal,
  tehranWallTimeToIso,
} from "./tehran-time";
import {
  formatSleepDuration,
  sleepDayWindow,
  sleepDurationMinutes,
  summarizeSleep,
  validateSleepSession,
  SLEEP_DAY_MS,
} from "./sleep-data";

const INPUT =
  "w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:text-sm";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";
const KIND: Record<SleepKind, string> = {
  main: "Main sleep",
  nap: "Nap",
  other: "Other sleep",
};
const QUALITY: Record<SleepQuality, string> = {
  1: "Very poor",
  2: "Poor",
  3: "Fair",
  4: "Good",
  5: "Very good",
};
type Draft = {
  id?: string;
  startedAt: string;
  endedAt: string;
  kind: SleepKind;
  quality: string;
  awakenings: string;
  notes: string;
  ongoing: boolean;
  createdAt?: string;
};
const emptyDraft = (): Draft => ({
  startedAt: "",
  endedAt: "",
  kind: "main",
  quality: "",
  awakenings: "",
  notes: "",
  ongoing: false,
});
const displayTime = (value: string) =>
  formatTehranInstant(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) ?? value;

export default function SleepTracker({
  sessions,
  now,
  onSave,
}: {
  sessions: SleepSession[];
  now: Date;
  onSave: (session: SleepSession) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [range, setRange] = useState<"7" | "30" | "all">("7");
  const [visibleCount, setVisibleCount] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const dateKey = tehranDateKey(now)!;
  const active = sessions
    .filter((s) => !s.endedAt)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const last24 = summarizeSleep(
    sessions,
    new Date(now.getTime() - SLEEP_DAY_MS),
    now,
  );
  const weekKeys = getTrailingTehranDateKeys(dateKey, 7);
  const days = weekKeys.map((key) => {
    const window = sleepDayWindow(key)!;
    return {
      key,
      ...summarizeSleep(
        sessions,
        window.start,
        new Date(Math.min(window.end.getTime(), now.getTime())),
      ),
    };
  });
  const recordedDays = days.filter((day) => day.sessionCount > 0);
  const week = summarizeSleep(
    sessions,
    sleepDayWindow(weekKeys[0])!.start,
    now,
  );
  const rangeStart =
    range === "all"
      ? -Infinity
      : sleepDayWindow(
          getTrailingTehranDateKeys(dateKey, Number(range))[0],
        )!.start.getTime();
  const history = sessions
    .filter((s) => !s.endedAt || Date.parse(s.endedAt) > rangeStart)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const recentWake = sessions
    .filter(
      (s) =>
        s.kind === "main" &&
        s.endedAt &&
        Date.parse(s.endedAt) <= now.getTime() &&
        now.getTime() - Date.parse(s.endedAt) < 12 * 60 * 60_000,
    )
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0];

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function openForm(next: Draft) {
    setDraft(next);
    setError("");
    setMessage("");
    setFormOpen(true);
    requestAnimationFrame(() =>
      document
        .getElementById("sleep-entry")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function edit(session: SleepSession, finish = false) {
    openForm({
      id: session.id,
      createdAt: session.createdAt,
      startedAt: tehranDateTimeLocal(session.startedAt) ?? "",
      endedAt: finish
        ? tehranDateTimeLocal(new Date())!
        : session.endedAt
          ? tehranDateTimeLocal(session.endedAt)!
          : "",
      ongoing: !finish && !session.endedAt,
      kind: session.kind,
      quality: session.quality?.toString() ?? "",
      awakenings: session.awakenings?.toString() ?? "",
      notes: session.notes ?? "",
    });
  }

  async function persist(session: SleepSession) {
    if (savingRef.current) return false;
    const issue = validateSleepSession(session, sessions, new Date());
    if (issue) {
      setError(issue);
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await onSave(session);
      setMessage(
        session.endedAt
          ? "Sleep episode saved."
          : "Sleep started. Finish this episode after waking.",
      );
      setDraft(emptyDraft());
      setFormOpen(false);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sleep could not be saved. Your form is still here; try again.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startedAt = tehranWallTimeToIso(draft.startedAt);
    const endedAt = draft.ongoing
      ? undefined
      : tehranWallTimeToIso(draft.endedAt);
    if (!startedAt || endedAt === null) {
      setError("Enter valid dates and times in Iran time.");
      return;
    }
    if (!draft.ongoing && !draft.quality) {
      setError("Choose a quality rating, or Not rated if you do not remember.");
      return;
    }
    const timestamp = new Date().toISOString();
    await persist({
      id: draft.id ?? `sleep-${crypto.randomUUID()}`,
      startedAt,
      ...(endedAt ? { endedAt } : {}),
      kind: draft.kind,
      ...(!draft.ongoing && draft.quality !== "unknown"
        ? { quality: Number(draft.quality) as SleepQuality }
        : {}),
      ...(draft.awakenings === ""
        ? {}
        : { awakenings: Number(draft.awakenings) }),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      createdAt: draft.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  async function startNow() {
    const timestamp = new Date().toISOString();
    await persist({
      id: `sleep-${crypto.randomUUID()}`,
      startedAt: timestamp,
      kind: draft.kind,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return (
    <section
      id="health-sleep"
      className="scroll-mt-24 rounded-lg border border-indigo-100 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="sleep-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="sleep-title"
            className="flex items-center gap-2 text-lg font-semibold text-zinc-950"
          >
            <Moon className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            Sleep
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
            Log every sleep episode, including naps and split sleep. Dates and
            times always use Iran time; no fixed bedtime is assumed.
          </p>
        </div>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => openForm(emptyDraft())}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Log past sleep
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
        {active.length ? (
          <div className="space-y-3">
            {active.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-indigo-950">
                    Sleeping · {KIND[session.kind]}
                  </p>
                  <p className="mt-1 text-xs text-indigo-800">
                    Since {displayTime(session.startedAt)} ·{" "}
                    {formatSleepDuration(
                      Math.max(
                        0,
                        (now.getTime() - Date.parse(session.startedAt)) /
                          60_000,
                      ),
                    )}{" "}
                    elapsed
                  </p>
                  {now.getTime() - Date.parse(session.startedAt) >
                  SLEEP_DAY_MS ? (
                    <p className="mt-1 text-xs text-amber-900">
                      Still open after 24 hours. Enter the actual wake-up time
                      if you forgot to finish.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => edit(session, true)}
                  >
                    <Sunrise className="h-4 w-4" aria-hidden="true" />I woke up
                  </button>
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => edit(session)}
                  >
                    Edit start
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <label className="block text-xs font-semibold text-indigo-900">
                Start a new episode
                <select
                  className={`${INPUT} mt-1`}
                  value={draft.kind}
                  onChange={(e) => field("kind", e.target.value as SleepKind)}
                >
                  {Object.entries(KIND).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className={BUTTON}
              disabled={saving || formOpen}
              onClick={startNow}
            >
              <Moon className="h-4 w-4" aria-hidden="true" />
              Start sleeping now
            </button>
            <p className="w-full text-xs text-indigo-800">
              No open episode. This is a recording status, not automatic sleep
              detection.
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="Last 24 hours"
          value={
            last24.sessionCount
              ? formatSleepDuration(last24.minutes)
              : "No data"
          }
          note={`${last24.sessionCount} completed episodes overlap this window`}
        />
        <Stat
          label="Today in Tehran"
          value={
            days.at(-1)!.sessionCount
              ? formatSleepDuration(days.at(-1)!.minutes)
              : "No data"
          }
          note="Midnight to now · may be a partial day"
        />
        <Stat
          label="Daily average · 7 days"
          value={
            recordedDays.length
              ? formatSleepDuration(
                  days.reduce((sum, day) => sum + day.minutes, 0) /
                    recordedDays.length,
                )
              : "No data"
          }
          note={`${recordedDays.length} of 7 days contain recorded sleep`}
        />
        <Stat
          label="Quality · 7 days"
          value={
            week.averageQuality === null
              ? "Not rated"
              : `${week.averageQuality.toFixed(1)} / 5`
          }
          note={`${week.ratedCount} rated episodes · subjective`}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Totals use completed start-to-end intervals, including any brief
        awakenings within them; they are estimates, not measured time asleep.
        Ongoing episodes are excluded. Missing days stay unknown. Overnight
        episodes are split at midnight for daily totals, and overlapping records
        are counted only once.
      </p>
      <div
        className="mt-4 grid grid-cols-7 gap-1.5"
        aria-label="Recorded sleep over seven Tehran calendar days"
      >
        {days.map((day) => (
          <div
            key={day.key}
            className="min-w-0 rounded-md bg-zinc-50 px-1 py-2 text-center"
          >
            <div className="mx-auto flex h-20 w-full max-w-8 items-end rounded bg-zinc-100">
              <div
                className="w-full rounded bg-indigo-400"
                style={{
                  height: `${Math.min(100, (day.minutes / 1440) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600 sm:text-xs">
              {day.key.slice(5)}
            </p>
            <p className="text-[10px] font-semibold text-indigo-900 sm:text-xs">
              {day.sessionCount ? `${(day.minutes / 60).toFixed(1)}h` : "—"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Each column represents up to 24 hours. An empty day means no recorded
        sleep, not zero sleep.
      </p>
      {recentWake ? (
        <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-950">
            After waking from main sleep
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Quick access when these measurements are part of your plan. Reminder
            and medication times stay under your control.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              className="font-medium text-emerald-800 underline"
              href="#weight-entry"
            >
              Record weight
            </a>
            <a
              className="font-medium text-emerald-800 underline"
              href="#bp-entry"
            >
              Record blood pressure
            </a>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {formOpen ? (
        <form
          id="sleep-entry"
          onSubmit={submit}
          className="mt-5 scroll-mt-24 rounded-lg border border-indigo-200 p-3 sm:p-4"
        >
          <h3 className="mb-3 font-semibold text-zinc-950">
            {draft.id ? "Edit sleep episode" : "Add sleep episode"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700">
              Sleep started · Iran time
              <input
                className={`${INPUT} mt-1`}
                type="datetime-local"
                required
                max={tehranDateTimeLocal(now)!}
                value={draft.startedAt}
                onChange={(e) => field("startedAt", e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Woke up · Iran time
              <input
                className={`${INPUT} mt-1 disabled:bg-zinc-100`}
                type="datetime-local"
                required={!draft.ongoing}
                disabled={draft.ongoing}
                max={tehranDateTimeLocal(now)!}
                value={draft.endedAt}
                onChange={(e) => field("endedAt", e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Sleep type
              <select
                className={`${INPUT} mt-1`}
                value={draft.kind}
                onChange={(e) => field("kind", e.target.value as SleepKind)}
              >
                {Object.entries(KIND).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Quality after waking
              <select
                className={`${INPUT} mt-1`}
                required={!draft.ongoing}
                disabled={draft.ongoing}
                value={draft.quality}
                onChange={(e) => field("quality", e.target.value)}
              >
                <option value="">Choose quality…</option>
                {Object.entries(QUALITY).map(([id, label]) => (
                  <option key={id} value={id}>
                    {id} · {label}
                  </option>
                ))}
                <option value="unknown">Not rated / do not remember</option>
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Number of awakenings · optional
              <input
                className={`${INPUT} mt-1`}
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="numeric"
                placeholder="Unknown"
                value={draft.awakenings}
                onChange={(e) => field("awakenings", e.target.value)}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={draft.ongoing}
                onChange={(e) => field("ongoing", e.target.checked)}
              />
              Still sleeping / end time not recorded yet
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Use the actual calendar dates if sleep crosses midnight. Add another
            episode for each separate sleep. Blank awakenings means unknown, not
            zero.
          </p>
          <label className="mt-3 block text-sm font-medium text-zinc-700">
            Notes · optional
            <textarea
              className={`${INPUT} mt-1 min-h-20`}
              dir="auto"
              maxLength={2000}
              value={draft.notes}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="For example: interrupted sleep, noise, caffeine, how you felt after waking"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className={BUTTON} disabled={saving}>
              {saving ? "Saving…" : "Save sleep episode"}
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={saving}
              onClick={() => {
                setFormOpen(false);
                setDraft(emptyDraft());
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-zinc-950">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Sleep history
          </h3>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Show
            <select
              className="min-h-11 rounded-md border border-zinc-200 bg-white px-2"
              value={range}
              onChange={(e) => {
                setRange(e.target.value as typeof range);
                setVisibleCount(10);
              }}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All history</option>
            </select>
          </label>
        </div>
        <div className="mt-3 space-y-2">
          {history.length ? (
            history.slice(0, visibleCount).map((session) => (
              <article
                key={session.id}
                className="rounded-lg border border-zinc-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">
                      {KIND[session.kind]} ·{" "}
                      {session.endedAt
                        ? formatSleepDuration(sleepDurationMinutes(session))
                        : "Still open"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-600">
                      {displayTime(session.startedAt)} →{" "}
                      {session.endedAt
                        ? displayTime(session.endedAt)
                        : "Not finished"}
                    </p>
                    <p className="mt-1 text-sm text-indigo-800">
                      {session.quality
                        ? `${QUALITY[session.quality]} · ${session.quality}/5`
                        : "Quality not rated"}
                      {session.awakenings !== undefined
                        ? ` · ${session.awakenings} awakenings`
                        : ""}
                    </p>
                    {session.notes ? (
                      <p
                        className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-600"
                        dir="auto"
                      >
                        {session.notes}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={`Edit sleep starting ${displayTime(session.startedAt)}`}
                    className={SECONDARY}
                    onClick={() => edit(session)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500">
              No sleep episodes recorded in this range. Add an episode or start
              sleeping now.
            </p>
          )}
        </div>
        {history.length > visibleCount ? (
          <button
            type="button"
            className={`${SECONDARY} mt-3`}
            onClick={() => setVisibleCount((count) => count + 20)}
          >
            Show more ({history.length - visibleCount} remaining)
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-indigo-50 p-3">
      <p className="text-xs font-medium text-indigo-700">{label}</p>
      <p className="mt-1 text-lg font-semibold text-indigo-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-indigo-700">{note}</p>
    </div>
  );
}
