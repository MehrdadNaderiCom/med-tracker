import {
  normalizeCareDayState,
  selectCareDayState,
} from "../../care-day-state";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeItems(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      return [];
    }

    const id = item.id.trim();
    return id ? [{ ...item, id }] : [];
  });
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.flatMap((id) =>
        typeof id === "string" && id.trim() !== "" ? [id.trim()] : [],
      ),
    ),
  );
}

function mergeItemsById(
  existingValue: unknown,
  incomingValue: unknown,
  deletedIds?: Set<string>,
) {
  const itemsById = new Map<string, JsonRecord>();

  for (const item of [
    ...normalizeItems(existingValue),
    ...normalizeItems(incomingValue),
  ]) {
    const id = String(item.id);

    if (!deletedIds?.has(id)) {
      itemsById.set(id, item);
    }
  }

  return Array.from(itemsById.values());
}

function isIntakeLogStatus(value: unknown) {
  return value === "taken" || value === "lapse";
}

function mergeLogsById(
  existingValue: unknown,
  incomingValue: unknown,
  deletedIds: Set<string>,
) {
  const logsById = new Map<string, JsonRecord>();

  for (const log of normalizeItems(existingValue)) {
    const id = String(log.id);

    if (!deletedIds.has(id)) {
      logsById.set(id, log);
    }
  }

  for (const incomingLog of normalizeItems(incomingValue)) {
    const id = String(incomingLog.id);

    if (deletedIds.has(id)) {
      continue;
    }

    const existingLog = logsById.get(id);

    if (!existingLog) {
      logsById.set(id, incomingLog);
      continue;
    }

    const mergedLog = { ...incomingLog };

    // A log's outcome is immutable for its ID. Older clients normalize every
    // log to `taken`, so accepting their full-state snapshot would otherwise
    // silently turn a previously recorded avoidance lapse into a completion.
    if (isIntakeLogStatus(existingLog.status)) {
      mergedLog.status = existingLog.status;
    }

    // Intake records are immutable for an ID. In particular, keep a corrected
    // noon-to-noon Care Day and exact occurrence time from being reverted by a
    // stale tab that still carries the older civil-date interpretation.
    if (isDateKey(existingLog.date)) {
      mergedLog.date = existingLog.date;
    }
    if (
      typeof existingLog.takenAt === "string" &&
      Number.isFinite(Date.parse(existingLog.takenAt))
    ) {
      mergedLog.takenAt = existingLog.takenAt;
    }

    logsById.set(id, mergedLog);
  }

  return Array.from(logsById.values());
}

function isDateKey(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return false;
  }

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

function isMedicationTrackingMode(value: unknown) {
  return value === "completion" || value === "avoidance";
}

function isPersonalPlanVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function mergeMedicationsById(existingValue: unknown, incomingValue: unknown) {
  const medicationsById = new Map<string, JsonRecord>();

  for (const medication of normalizeItems(existingValue)) {
    medicationsById.set(String(medication.id), medication);
  }

  for (const incomingMedication of normalizeItems(incomingValue)) {
    const id = String(incomingMedication.id);
    const existingMedication = medicationsById.get(id);

    if (!existingMedication) {
      medicationsById.set(id, incomingMedication);
      continue;
    }

    const mergedMedication = { ...incomingMedication };

    // Older clients do not know these lifecycle fields. Keep a valid boundary
    // when an old full-state snapshot omits it or sends an invalid/null value.
    if (
      !isDateKey(incomingMedication.activeFrom) &&
      isDateKey(existingMedication.activeFrom)
    ) {
      mergedMedication.activeFrom = existingMedication.activeFrom;
    }

    const isExplicitReactivation =
      existingMedication.isActive === false &&
      incomingMedication.isActive === true;

    if (
      !isExplicitReactivation &&
      !isDateKey(incomingMedication.activeUntil) &&
      isDateKey(existingMedication.activeUntil)
    ) {
      mergedMedication.activeUntil = existingMedication.activeUntil;
    }

    // Clients predating tracking modes omit this field. Keep the server's
    // valid value unless a newer client sends another valid mode explicitly.
    if (
      !isMedicationTrackingMode(incomingMedication.trackingMode) &&
      isMedicationTrackingMode(existingMedication.trackingMode)
    ) {
      mergedMedication.trackingMode = existingMedication.trackingMode;
    }

    medicationsById.set(id, mergedMedication);
  }

  return Array.from(medicationsById.values());
}

/**
 * Merges the primary sync snapshot without allowing an older full-state client
 * to erase append-only history. Existing fields not owned by the merge policy
 * are retained, while incoming top-level fields keep the previous PUT contract.
 */
export function mergePrimarySyncData(
  existingValue: unknown,
  incomingValue: JsonRecord,
  savedAt: string,
) {
  const existing = isRecord(existingValue) ? existingValue : {};
  const existingCareDayState = normalizeCareDayState(
    existing.careDayState,
    existing.careDayKey,
  );
  const incomingCareDayState = normalizeCareDayState(
    incomingValue.careDayState,
    incomingValue.careDayKey,
  );
  const careDayState = selectCareDayState(
    existingCareDayState,
    incomingCareDayState,
  );
  const deletedLogIds = Array.from(
    new Set([
      ...normalizeIdList(existing.deletedLogIds),
      ...normalizeIdList(incomingValue.deletedLogIds),
    ]),
  );
  const deletedLogIdSet = new Set(deletedLogIds);
  const existingPlanVersion = existing.personalPlanVersion;
  const incomingPlanVersion = incomingValue.personalPlanVersion;
  const mergedPlanVersion =
    isPersonalPlanVersion(existingPlanVersion) &&
    isPersonalPlanVersion(incomingPlanVersion)
      ? Math.max(existingPlanVersion, incomingPlanVersion)
      : isPersonalPlanVersion(existingPlanVersion)
        ? existingPlanVersion
        : isPersonalPlanVersion(incomingPlanVersion)
          ? incomingPlanVersion
          : null;

  const mergedData: JsonRecord = {
    ...existing,
    ...incomingValue,
    medications: mergeMedicationsById(
      existing.medications,
      incomingValue.medications,
    ),
    logs: mergeLogsById(
      existing.logs,
      incomingValue.logs,
      deletedLogIdSet,
    ),
    deletedLogIds,
    categories: mergeItemsById(existing.categories, incomingValue.categories),
    routineCategories: mergeItemsById(
      existing.routineCategories,
      incomingValue.routineCategories,
    ),
    updatedAt: savedAt,
  };

  if (mergedPlanVersion !== null) {
    mergedData.personalPlanVersion = mergedPlanVersion;
  }

  if (careDayState) {
    mergedData.careDayState = careDayState;
    // Keep the legacy mirror until every deployed client understands revisions.
    mergedData.careDayKey = careDayState.key;
  }

  return mergedData;
}
