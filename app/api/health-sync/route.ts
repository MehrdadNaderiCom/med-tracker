import {
  isSessionAuthorized,
  isTrustedSessionOrigin,
} from "@/app/lib/session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_SYNC_KEY =
  process.env.MEDTRACK_HEALTH_SYNC_KEY ?? "medtrack:mehrdad:health:v1";
const MAX_SYNC_PAYLOAD_BYTES = 1024 * 1024;

type JsonRecord = Record<string, unknown>;

type DeletedEntryIds = {
  weightEntryIds: string[];
  bloodPressureSessionIds: string[];
  dietCheckInIds: string[];
  waistEntryIds: string[];
  activityCheckInIds: string[];
  exerciseSessionIds: string[];
};

type HealthSyncData = {
  schemaVersion: number;
  weightEntries: JsonRecord[];
  bloodPressureSessions: JsonRecord[];
  dietCheckIns: JsonRecord[];
  waistEntries: JsonRecord[];
  activityCheckIns: JsonRecord[];
  exerciseSessions: JsonRecord[];
  deletedEntryIds: DeletedEntryIds;
  profile?: unknown;
  profileUpdatedAt?: string;
  settings: unknown;
  settingsUpdatedAt: string;
  updatedAt: string;
};

type NormalizedHealthSyncData = Omit<
  HealthSyncData,
  "profile" | "profileUpdatedAt"
> & {
  profile: unknown;
  profileUpdatedAt: string;
};

const HEALTH_SYNC_EPOCH = "1970-01-01T00:00:00.000Z";
const MAX_CAS_ATTEMPTS = 6;
const COMPARE_AND_SET_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local expected_exists = ARGV[1] == "1"

if expected_exists then
  if not current or current ~= ARGV[2] then
    return 0
  end
elseif current then
  return 0
end

redis.call("SET", KEYS[1], ARGV[3])
return 1
`;

function json(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRedisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

  if (!url || !token) {
    return null;
  }

  return {
    token,
    url: url.replace(/\/$/, ""),
  };
}

async function redisCommand(command: unknown[]) {
  const config = getRedisConfig();

  if (!config) {
    return {
      configured: false as const,
      result: null,
    };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      configured: true as const,
      error:
        isRecord(payload) && "error" in payload
          ? String(payload.error)
          : "Database request failed",
      result: null,
    };
  }

  return {
    configured: true as const,
    result:
      isRecord(payload) && "result" in payload ? payload.result : null,
  };
}

function normalizeSchemaVersion(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function normalizeTimestamp(value: unknown, fallback = HEALTH_SYNC_EPOCH) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : fallback;
}

function normalizeEntries(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      return [];
    }

    const id = entry.id.trim();
    return id ? [{ ...entry, id }] : [];
  });
}

function normalizeBloodPressureEntries(value: unknown) {
  return normalizeEntries(value).map((entry) => {
    if (
      typeof entry.pairingClosedAt === "string" &&
      Number.isFinite(Date.parse(entry.pairingClosedAt))
    ) {
      return entry;
    }

    const normalized = { ...entry };
    delete normalized.pairingClosedAt;
    return normalized;
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

function normalizeDeletedEntryIds(value: unknown): DeletedEntryIds {
  const deletedEntryIds = isRecord(value) ? value : {};

  return {
    weightEntryIds: normalizeIdList(deletedEntryIds.weightEntryIds),
    bloodPressureSessionIds: normalizeIdList(
      deletedEntryIds.bloodPressureSessionIds,
    ),
    dietCheckInIds: normalizeIdList(deletedEntryIds.dietCheckInIds),
    waistEntryIds: normalizeIdList(deletedEntryIds.waistEntryIds),
    activityCheckInIds: normalizeIdList(deletedEntryIds.activityCheckInIds),
    exerciseSessionIds: normalizeIdList(deletedEntryIds.exerciseSessionIds),
  };
}

function normalizeHealthSyncData(value: unknown): NormalizedHealthSyncData {
  const data = isRecord(value) ? value : {};
  const legacySettingsUpdatedAt =
    "settings" in data
      ? normalizeTimestamp(data.updatedAt)
      : HEALTH_SYNC_EPOCH;
  const legacyProfileUpdatedAt =
    "profile" in data
      ? normalizeTimestamp(data.updatedAt)
      : HEALTH_SYNC_EPOCH;

  return {
    schemaVersion: normalizeSchemaVersion(data.schemaVersion),
    weightEntries: normalizeEntries(data.weightEntries),
    bloodPressureSessions: normalizeBloodPressureEntries(
      data.bloodPressureSessions,
    ),
    dietCheckIns: normalizeEntries(data.dietCheckIns),
    waistEntries: normalizeEntries(data.waistEntries),
    activityCheckIns: normalizeEntries(data.activityCheckIns),
    exerciseSessions: normalizeEntries(data.exerciseSessions),
    deletedEntryIds: normalizeDeletedEntryIds(data.deletedEntryIds),
    profile: "profile" in data ? data.profile : {},
    profileUpdatedAt: normalizeTimestamp(
      data.profileUpdatedAt,
      legacyProfileUpdatedAt,
    ),
    settings: "settings" in data ? data.settings : {},
    settingsUpdatedAt: normalizeTimestamp(
      data.settingsUpdatedAt,
      legacySettingsUpdatedAt,
    ),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

function getUpdatedAtTimestamp(entry: JsonRecord) {
  if (typeof entry.updatedAt !== "string") {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(entry.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function mergeEntries(
  existingEntries: JsonRecord[],
  incomingEntries: JsonRecord[],
  deletedIds: Set<string>,
) {
  const entriesById = new Map<string, JsonRecord>();

  for (const entry of [...existingEntries, ...incomingEntries]) {
    const id = String(entry.id);

    if (deletedIds.has(id)) {
      continue;
    }

    const currentEntry = entriesById.get(id);

    if (
      !currentEntry ||
      getUpdatedAtTimestamp(entry) > getUpdatedAtTimestamp(currentEntry)
    ) {
      entriesById.set(id, entry);
    }
  }

  return Array.from(entriesById.values());
}

function mergeDeletedEntryIds(
  existing: DeletedEntryIds,
  incoming: DeletedEntryIds,
): DeletedEntryIds {
  return {
    weightEntryIds: Array.from(
      new Set([...existing.weightEntryIds, ...incoming.weightEntryIds]),
    ),
    bloodPressureSessionIds: Array.from(
      new Set([
        ...existing.bloodPressureSessionIds,
        ...incoming.bloodPressureSessionIds,
      ]),
    ),
    dietCheckInIds: Array.from(
      new Set([...existing.dietCheckInIds, ...incoming.dietCheckInIds]),
    ),
    waistEntryIds: Array.from(
      new Set([...existing.waistEntryIds, ...incoming.waistEntryIds]),
    ),
    activityCheckInIds: Array.from(
      new Set([
        ...existing.activityCheckInIds,
        ...incoming.activityCheckInIds,
      ]),
    ),
    exerciseSessionIds: Array.from(
      new Set([
        ...existing.exerciseSessionIds,
        ...incoming.exerciseSessionIds,
      ]),
    ),
  };
}

function mergeDocumentFields(existing: unknown, incoming: unknown) {
  const existingFields = isRecord(existing) ? existing : {};
  const incomingFields = isRecord(incoming) ? incoming : {};
  return { ...existingFields, ...incomingFields };
}

function mergeHealthSyncData(
  existingValue: unknown,
  incomingValue: JsonRecord,
  savedAt: string,
): HealthSyncData {
  const hasExistingData = isRecord(existingValue);
  const existing = normalizeHealthSyncData(existingValue);
  const incoming = normalizeHealthSyncData(incomingValue);
  const existingHasProfile =
    isRecord(existingValue) && "profile" in existingValue;
  const incomingHasProfile = "profile" in incomingValue;
  const incomingProfileWins =
    incomingHasProfile &&
    (!existingHasProfile ||
      Date.parse(incoming.profileUpdatedAt) >
        Date.parse(existing.profileUpdatedAt));
  const profileFields =
    existingHasProfile || incomingHasProfile
      ? {
          profile: incomingProfileWins
            ? mergeDocumentFields(existing.profile, incoming.profile)
            : existing.profile,
          profileUpdatedAt: incomingProfileWins
            ? incoming.profileUpdatedAt
            : existing.profileUpdatedAt,
        }
      : {};
  const incomingSettingsWins =
    !hasExistingData ||
    Date.parse(incoming.settingsUpdatedAt) >
      Date.parse(existing.settingsUpdatedAt);
  const deletedEntryIds = mergeDeletedEntryIds(
    existing.deletedEntryIds,
    incoming.deletedEntryIds,
  );

  return {
    schemaVersion: Math.max(existing.schemaVersion, incoming.schemaVersion),
    weightEntries: mergeEntries(
      existing.weightEntries,
      incoming.weightEntries,
      new Set(deletedEntryIds.weightEntryIds),
    ),
    bloodPressureSessions: mergeEntries(
      existing.bloodPressureSessions,
      incoming.bloodPressureSessions,
      new Set(deletedEntryIds.bloodPressureSessionIds),
    ),
    dietCheckIns: mergeEntries(
      existing.dietCheckIns,
      incoming.dietCheckIns,
      new Set(deletedEntryIds.dietCheckInIds),
    ),
    waistEntries: mergeEntries(
      existing.waistEntries,
      incoming.waistEntries,
      new Set(deletedEntryIds.waistEntryIds),
    ),
    activityCheckIns: mergeEntries(
      existing.activityCheckIns,
      incoming.activityCheckIns,
      new Set(deletedEntryIds.activityCheckInIds),
    ),
    exerciseSessions: mergeEntries(
      existing.exerciseSessions,
      incoming.exerciseSessions,
      new Set(deletedEntryIds.exerciseSessionIds),
    ),
    deletedEntryIds,
    // Profile is an independent last-write-wins document. Older payloads that
    // omit it cannot erase a stored profile, and a newer legacy document only
    // overlays fields it actually knows about.
    ...profileFields,
    settings: incomingSettingsWins
      ? mergeDocumentFields(existing.settings, incoming.settings)
      : existing.settings,
    settingsUpdatedAt: incomingSettingsWins
      ? incoming.settingsUpdatedAt
      : existing.settingsUpdatedAt,
    updatedAt: savedAt,
  };
}

function getUtf8ByteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

async function readBodyWithinLimit(request: Request) {
  if (!request.body) {
    return { tooLarge: false as const, text: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_SYNC_PAYLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true as const, text: "" };
    }

    chunks.push(value);
  }

  return {
    tooLarge: false as const,
    text: Buffer.concat(chunks).toString("utf8"),
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readStoredData() {
  const result = await redisCommand(["GET", HEALTH_SYNC_KEY]);

  if (!result.configured || "error" in result) {
    return { ...result, data: null, raw: null };
  }

  if (typeof result.result !== "string") {
    return { ...result, data: null, raw: null };
  }

  try {
    const data: unknown = JSON.parse(result.result);

    if (!isRecord(data)) {
      return { ...result, invalid: true as const, data: null, raw: null };
    }

    return { ...result, data, raw: result.result };
  } catch {
    return { ...result, invalid: true as const, data: null, raw: null };
  }
}

async function compareAndSetStoredData(
  expectedValue: string | null,
  nextValue: string,
) {
  const result = await redisCommand([
    "EVAL",
    COMPARE_AND_SET_SCRIPT,
    1,
    HEALTH_SYNC_KEY,
    expectedValue === null ? "0" : "1",
    expectedValue ?? "",
    nextValue,
  ]);

  if (!result.configured || "error" in result) {
    return { ...result, swapped: false };
  }

  return {
    ...result,
    swapped: result.result === 1 || result.result === "1",
  };
}

export async function GET(request: Request) {
  if (!(await isSessionAuthorized(request))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const stored = await readStoredData();

  if (!stored.configured) {
    return json(
      {
        configured: false,
        data: null,
        error: "Database is not configured",
      },
      { status: 503 },
    );
  }

  if ("error" in stored) {
    return json(
      { configured: true, data: null, error: stored.error },
      { status: 502 },
    );
  }

  if ("invalid" in stored) {
    return json(
      { configured: true, data: null, error: "Stored data is invalid" },
      { status: 502 },
    );
  }

  return json({ configured: true, data: stored.data });
}

export async function PUT(request: Request) {
  if (
    !(await isSessionAuthorized(request)) ||
    !isTrustedSessionOrigin(request)
  ) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_PAYLOAD_BYTES) {
    return json(
      { error: "Sync payload is too large" },
      { status: 413 },
    );
  }

  const bodyResult = await readBodyWithinLimit(request);

  if (bodyResult.tooLarge) {
    return json(
      { error: "Sync payload is too large" },
      { status: 413 },
    );
  }

  const rawBody = bodyResult.text;

  const body = parseJson(rawBody);

  if (!isRecord(body) || !isRecord(body.data)) {
    return json({ error: "Invalid sync payload" }, { status: 400 });
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const stored = await readStoredData();

    if (!stored.configured) {
      return json(
        { configured: false, error: "Database is not configured" },
        { status: 503 },
      );
    }

    if ("error" in stored) {
      return json(
        { configured: true, error: stored.error },
        { status: 502 },
      );
    }

    if ("invalid" in stored) {
      return json(
        { configured: true, error: "Stored data is invalid" },
        { status: 502 },
      );
    }

    const savedAt = new Date().toISOString();
    const mergedData = mergeHealthSyncData(stored.data, body.data, savedAt);
    const serializedData = JSON.stringify(mergedData);

    if (getUtf8ByteLength(serializedData) > MAX_SYNC_PAYLOAD_BYTES) {
      return json(
        { error: "Merged health data is too large" },
        { status: 413 },
      );
    }

    const result = await compareAndSetStoredData(stored.raw, serializedData);

    if (!result.configured) {
      return json(
        { configured: false, error: "Database is not configured" },
        { status: 503 },
      );
    }

    if ("error" in result) {
      return json(
        { configured: true, error: result.error },
        { status: 502 },
      );
    }

    if (result.swapped) {
      return json({ configured: true, savedAt });
    }
  }

  return json(
    { configured: true, error: "Health data changed concurrently; retry the save" },
    { status: 409 },
  );
}
