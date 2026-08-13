import { NextResponse } from "next/server";
import { hasValidSession, isTrustedSessionOrigin } from "@/app/lib/session";
import { mergePrimarySyncData } from "@/app/api/sync/merge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYNC_KEY = process.env.MEDTRACK_SYNC_KEY ?? "medtrack:mehrdad:primary";
const MAX_SYNC_BODY_BYTES = 4 * 1024 * 1024;
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
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function declaredBodyIsTooLarge(request: Request) {
  const header = request.headers.get("content-length");

  if (!header) {
    return false;
  }

  const contentLength = Number(header);
  return Number.isFinite(contentLength) && contentLength > MAX_SYNC_BODY_BYTES;
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

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_SYNC_BODY_BYTES) {
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
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Database request failed",
      result: null,
    };
  }

  return {
    configured: true as const,
    result:
      payload && typeof payload === "object" && "result" in payload
        ? payload.result
        : null,
  };
}

function getUtf8ByteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

async function readStoredData() {
  const result = await redisCommand(["GET", SYNC_KEY]);

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
    SYNC_KEY,
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

export async function GET() {
  if (!(await hasValidSession())) {
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
  if (!(await hasValidSession()) || !isTrustedSessionOrigin(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (declaredBodyIsTooLarge(request)) {
    return json({ error: "Request payload is too large" }, { status: 413 });
  }

  const bodyResult = await readBodyWithinLimit(request);

  if (bodyResult.tooLarge) {
    return json({ error: "Request payload is too large" }, { status: 413 });
  }

  const rawBody = bodyResult.text;

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid sync payload" }, { status: 400 });
  }

  if (!isRecord(body) || !isRecord(body.data)) {
    return json({ error: "Invalid sync payload" }, { status: 400 });
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const stored = await readStoredData();

    if (!stored.configured) {
      return json(
        {
          configured: false,
          error: "Database is not configured",
        },
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
    const mergedData = mergePrimarySyncData(stored.data, body.data, savedAt);
    const serializedData = JSON.stringify(mergedData);

    if (getUtf8ByteLength(serializedData) > MAX_SYNC_BODY_BYTES) {
      return json({ error: "Merged sync data is too large" }, { status: 413 });
    }

    const result = await compareAndSetStoredData(stored.raw, serializedData);

    if (!result.configured) {
      return json(
        {
          configured: false,
          error: "Database is not configured",
        },
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
    { configured: true, error: "Data changed concurrently; retry the save" },
    { status: 409 },
  );
}
