import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYNC_USERNAME =
  process.env.MEDTRACK_SYNC_USERNAME ?? "mail@mehrdadnaderi.com";
const SYNC_PASSWORD = process.env.MEDTRACK_SYNC_PASSWORD ?? "Naderi$2050";
const SYNC_KEY = process.env.MEDTRACK_SYNC_KEY ?? "medtrack:mehrdad:primary";

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

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedAuth = `Basic ${Buffer.from(
    `${SYNC_USERNAME}:${SYNC_PASSWORD}`,
  ).toString("base64")}`;

  return authHeader === expectedAuth;
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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await redisCommand(["GET", SYNC_KEY]);

  if (!result.configured) {
    return NextResponse.json(
      {
        configured: false,
        data: null,
        error: "Database is not configured",
      },
      { status: 503 },
    );
  }

  if ("error" in result) {
    return NextResponse.json(
      { configured: true, data: null, error: result.error },
      { status: 502 },
    );
  }

  if (typeof result.result !== "string") {
    return NextResponse.json({ configured: true, data: null });
  }

  try {
    return NextResponse.json({
      configured: true,
      data: JSON.parse(result.result),
    });
  } catch {
    return NextResponse.json(
      { configured: true, data: null, error: "Stored data is invalid" },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || !("data" in body)) {
    return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });
  }

  const savedAt = new Date().toISOString();
  const result = await redisCommand([
    "SET",
    SYNC_KEY,
    JSON.stringify({ ...(body.data as object), updatedAt: savedAt }),
  ]);

  if (!result.configured) {
    return NextResponse.json(
      {
        configured: false,
        error: "Database is not configured",
      },
      { status: 503 },
    );
  }

  if ("error" in result) {
    return NextResponse.json(
      { configured: true, error: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ configured: true, savedAt });
}
