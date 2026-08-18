export interface CareDayState {
  key: string;
  revision: number;
  mutationId: string;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = DATE_KEY_PATTERN.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function createLegacyCareDayState(
  careDayKey: unknown,
): CareDayState | null {
  if (!isDateKey(careDayKey)) return null;

  const key = careDayKey.trim();
  return {
    key,
    revision: 0,
    mutationId: `legacy:${key}`,
  };
}

export function normalizeCareDayState(
  value: unknown,
  legacyCareDayKey?: unknown,
): CareDayState | null {
  if (!isRecord(value) || !isDateKey(value.key)) {
    return createLegacyCareDayState(legacyCareDayKey);
  }

  const key = value.key.trim();
  const revision =
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
      ? value.revision
      : 0;
  const mutationId =
    typeof value.mutationId === "string" && value.mutationId.trim()
      ? value.mutationId.trim()
      : revision === 0
        ? `legacy:${key}`
        : `recovered:${revision}:${key}`;

  return { key, revision, mutationId };
}

/**
 * Selects one Care Day cursor deterministically. A higher revision always
 * wins, while legacy revision-zero data falls back to the later date key.
 */
export function selectCareDayState(
  first: CareDayState | null | undefined,
  second: CareDayState | null | undefined,
): CareDayState | null {
  if (!first) return second ?? null;
  if (!second) return first;

  if (first.revision !== second.revision) {
    return first.revision > second.revision ? first : second;
  }

  if (first.revision === 0 && first.key !== second.key) {
    return first.key > second.key ? first : second;
  }

  if (first.mutationId !== second.mutationId) {
    return first.mutationId > second.mutationId ? first : second;
  }

  return first.key >= second.key ? first : second;
}

export function transitionCareDayState(
  current: CareDayState,
  nextKey: string,
  mutationId: string,
): CareDayState {
  if (!isDateKey(nextKey) || !mutationId.trim()) {
    throw new RangeError("Expected a valid Care Day transition");
  }

  if (current.key === nextKey) return current;

  return {
    key: nextKey,
    revision: current.revision + 1,
    mutationId: mutationId.trim(),
  };
}
