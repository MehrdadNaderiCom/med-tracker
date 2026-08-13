import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createSessionToken,
  getSessionCookieOptions,
  hasValidSession,
  isTrustedSessionOrigin,
  SESSION_COOKIE_NAME,
  verifyLoginCredentials,
} from "@/app/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUTH_BODY_BYTES = 8 * 1024;
const MAX_USERNAME_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_SECONDS = Math.ceil(LOGIN_WINDOW_MS / 1000);
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_GLOBAL_LOGIN_ATTEMPTS = 100;
const MAX_LOCAL_RATE_LIMIT_KEYS = 1024;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

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
  return Number.isFinite(contentLength) && contentLength > MAX_AUTH_BODY_BYTES;
}

function getClientAddress(request: Request) {
  const forwardedFor =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const clientAddress = forwardedFor.split(",")[0]?.trim() || "unknown";
  return clientAddress.slice(0, 128);
}

function getLoginRateLimitKey(request: Request) {
  return createHash("sha256")
    .update(getClientAddress(request))
    .digest("hex")
    .slice(0, 24);
}

function cleanupLocalAttempts(now: number) {
  for (const [key, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(key);
  }
}

function consumeLocalLoginAttempt(request: Request) {
  const now = Date.now();
  cleanupLocalAttempts(now);
  const key = getLoginRateLimitKey(request);
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    if (loginAttempts.size >= MAX_LOCAL_RATE_LIMIT_KEYS) {
      return {
        allowed: false as const,
        retryAfterSeconds: LOGIN_WINDOW_SECONDS,
      };
    }
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true as const, retryAfterSeconds: 0 };
}

const DISTRIBUTED_RATE_LIMIT_SCRIPT = `
local ipCount = redis.call("INCR", KEYS[1])
if ipCount == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
local globalCount = redis.call("INCR", KEYS[2])
if globalCount == 1 then redis.call("EXPIRE", KEYS[2], ARGV[1]) end
local ttl = math.max(redis.call("TTL", KEYS[1]), redis.call("TTL", KEYS[2]))
return {ipCount, globalCount, ttl}
`;

async function consumeDistributedLoginAttempt(request: Request) {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

  if (!url || !token) return null;

  const bucket = Math.floor(Date.now() / LOGIN_WINDOW_MS);
  const ipKey = `medtrack:auth-limit:ip:${bucket}:${getLoginRateLimitKey(request)}`;
  const globalKey = `medtrack:auth-limit:global:${bucket}`;

  try {
    const response = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        "EVAL",
        DISTRIBUTED_RATE_LIMIT_SCRIPT,
        "2",
        ipKey,
        globalKey,
        String(LOGIN_WINDOW_SECONDS),
      ]),
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);

    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      !("result" in payload) ||
      !Array.isArray(payload.result)
    ) {
      return { unavailable: true as const };
    }

    const [ipCount, globalCount, ttl] = payload.result.map(Number);
    if (![ipCount, globalCount, ttl].every(Number.isFinite)) {
      return { unavailable: true as const };
    }

    const allowed =
      ipCount <= MAX_LOGIN_ATTEMPTS &&
      globalCount <= MAX_GLOBAL_LOGIN_ATTEMPTS;
    return {
      unavailable: false as const,
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(ttl)),
    };
  } catch {
    return { unavailable: true as const };
  }
}

async function consumeLoginAttempt(request: Request) {
  const distributed = await consumeDistributedLoginAttempt(request);

  if (!distributed) return consumeLocalLoginAttempt(request);
  if (distributed.unavailable) {
    return {
      allowed: false as const,
      retryAfterSeconds: 30,
      unavailable: true as const,
    };
  }
  return distributed;
}

function clearLoginAttempts(request: Request) {
  loginAttempts.delete(getLoginRateLimitKey(request));
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

    if (totalBytes > MAX_AUTH_BODY_BYTES) {
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

export async function GET() {
  return json({ authenticated: await hasValidSession() });
}

export async function POST(request: Request) {
  if (!isTrustedSessionOrigin(request)) {
    return json({ error: "Untrusted request origin" }, { status: 403 });
  }

  const rateLimit = await consumeLoginAttempt(request);

  if (!rateLimit.allowed) {
    const response = json(
      {
        error:
          "unavailable" in rateLimit && rateLimit.unavailable
            ? "Login protection is temporarily unavailable. Try again shortly."
            : "Too many login attempts. Try again later.",
      },
      {
        status:
          "unavailable" in rateLimit && rateLimit.unavailable ? 503 : 429,
      },
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
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
    return json({ error: "Invalid login payload" }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    body.username.length === 0 ||
    body.username.length > MAX_USERNAME_LENGTH ||
    body.password.length === 0 ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    return json({ error: "Invalid login payload" }, { status: 400 });
  }

  if (!(await verifyLoginCredentials(body.username, body.password))) {
    return json(
      { authenticated: false, error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const sessionToken = createSessionToken(body.username);

  if (!sessionToken) {
    return json(
      { authenticated: false, error: "Session authentication is not configured" },
      { status: 503 },
    );
  }

  const response = json({ authenticated: true });
  clearLoginAttempts(request);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions(),
  );
  return response;
}

export async function DELETE(request: Request) {
  if (!isTrustedSessionOrigin(request)) {
    return json({ error: "Untrusted request origin" }, { status: 403 });
  }

  const response = json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}
