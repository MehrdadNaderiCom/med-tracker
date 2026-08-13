import { NextResponse } from "next/server";
import { hasValidSession, isTrustedSessionOrigin } from "@/app/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYNC_KEY = process.env.MEDTRACK_SYNC_KEY ?? "medtrack:mehrdad:primary";
const MAX_SYNC_BODY_BYTES = 4 * 1024 * 1024;

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

export async function GET() {
  if (!(await hasValidSession())) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await redisCommand(["GET", SYNC_KEY]);

  if (!result.configured) {
    return json(
      {
        configured: false,
        data: null,
        error: "Database is not configured",
      },
      { status: 503 },
    );
  }

  if ("error" in result) {
    return json(
      { configured: true, data: null, error: result.error },
      { status: 502 },
    );
  }

  if (typeof result.result !== "string") {
    return json({ configured: true, data: null });
  }

  try {
    return json({
      configured: true,
      data: JSON.parse(result.result),
    });
  } catch {
    return json(
      { configured: true, data: null, error: "Stored data is invalid" },
      { status: 502 },
    );
  }
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

  const savedAt = new Date().toISOString();
  const result = await redisCommand([
    "SET",
    SYNC_KEY,
    JSON.stringify({ ...body.data, updatedAt: savedAt }),
  ]);

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

  return json({ configured: true, savedAt });
}
