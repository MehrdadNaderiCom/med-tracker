import "server-only";

import {
  createHash,
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "medtrack-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const SESSION_TOKEN_VERSION = "v1";
const DEFAULT_SYNC_USERNAME = "mail@mehrdadnaderi.com";
const AUTH_CREDENTIAL_KEY =
  process.env.MEDTRACK_AUTH_CREDENTIAL_KEY ?? "medtrack:mehrdad:auth:v1";
const MAX_SESSION_TOKEN_LENGTH = 2048;

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function getConfiguredUsername() {
  return process.env.MEDTRACK_SYNC_USERNAME ?? DEFAULT_SYNC_USERNAME;
}

function getConfiguredPassword() {
  return process.env.MEDTRACK_SYNC_PASSWORD ?? "";
}

type StoredCredential = {
  version: 1;
  username: string;
  salt: string;
  passwordHash: string;
};

type StoredCredentialResult =
  | { status: "found"; credential: StoredCredential }
  | { status: "missing" }
  | { status: "unavailable" };

function isStoredCredential(value: unknown): value is StoredCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const credential = value as Record<string, unknown>;
  return (
    credential.version === 1 &&
    typeof credential.username === "string" &&
    typeof credential.salt === "string" &&
    credential.salt.length >= 16 &&
    typeof credential.passwordHash === "string" &&
    credential.passwordHash.length >= 64
  );
}

async function getStoredCredential(): Promise<StoredCredentialResult> {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

  if (!url || !token) {
    return { status: "missing" };
  }

  try {
    const response = await fetch(url.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["GET", AUTH_CREDENTIAL_KEY]),
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);

    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      !("result" in payload)
    ) {
      return { status: "unavailable" };
    }

    if (payload.result === null) {
      return { status: "missing" };
    }

    if (typeof payload.result !== "string") {
      return { status: "unavailable" };
    }

    const credential: unknown = JSON.parse(payload.result);
    return isStoredCredential(credential)
      ? { status: "found", credential }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

function getSessionSecret() {
  const candidates = [
    process.env.MEDTRACK_SESSION_SECRET,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.KV_REST_API_TOKEN,
    process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN,
    process.env.KV_REST_API_READ_ONLY_TOKEN,
  ];

  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.length > 0,
    ) ?? null
  );
}

function getSigningKey() {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  return createHash("sha256")
    .update(`medtrack-session:${secret}`)
    .digest();
}

function constantTimeStringEqual(first: string, second: string) {
  const firstDigest = createHash("sha256").update(first).digest();
  const secondDigest = createHash("sha256").update(second).digest();

  return timingSafeEqual(firstDigest, secondDigest);
}

function sign(value: string) {
  const signingKey = getSigningKey();

  if (!signingKey) {
    return null;
  }

  return createHmac("sha256", signingKey).update(value).digest("base64url");
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.sub === "string" &&
    Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp)
  );
}

export async function verifyLoginCredentials(
  username: string,
  password: string,
) {
  const storedCredential = await getStoredCredential();

  if (storedCredential.status === "found") {
    const credential = storedCredential.credential;
    const providedHash = scryptSync(
      password,
      Buffer.from(credential.salt, "base64url"),
      64,
    );
    const expectedHash = Buffer.from(
      credential.passwordHash,
      "base64url",
    );

    return (
      expectedHash.length === providedHash.length &&
      constantTimeStringEqual(username, credential.username) &&
      timingSafeEqual(providedHash, expectedHash)
    );
  }

  // A configured credential store must fail closed during an outage or when
  // its record is malformed. Falling back to an older environment password in
  // that state would silently re-enable a retired credential.
  if (storedCredential.status === "unavailable") {
    return false;
  }

  const configuredPassword = getConfiguredPassword();
  return (
    configuredPassword.length > 0 &&
    constantTimeStringEqual(username, getConfiguredUsername()) &&
    constantTimeStringEqual(password, configuredPassword)
  );
}

export function createSessionToken(username: string) {
  if (!constantTimeStringEqual(username, getConfiguredUsername())) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: getConfiguredUsername(),
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const unsignedToken = `${SESSION_TOKEN_VERSION}.${encodedPayload}`;
  const signature = sign(unsignedToken);

  return signature ? `${unsignedToken}.${signature}` : null;
}

export function isTrustedSessionOrigin(request: Request) {
  const origin = request.headers.get("origin");

  // Non-browser clients may omit Origin. Browser mutations must match the
  // effective host so a cross-site form or fetch cannot reuse the session.
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host");
    return Boolean(host) && originUrl.host === host;
  } catch {
    return false;
  }
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token || token.length > MAX_SESSION_TOKEN_LENGTH) {
    return false;
  }

  const tokenParts = token.split(".");

  if (tokenParts.length !== 3) {
    return false;
  }

  const [version, encodedPayload, providedSignature] = tokenParts;

  if (
    version !== SESSION_TOKEN_VERSION ||
    !encodedPayload ||
    !providedSignature
  ) {
    return false;
  }

  const expectedSignature = sign(`${version}.${encodedPayload}`);

  if (
    !expectedSignature ||
    !constantTimeStringEqual(providedSignature, expectedSignature)
  ) {
    return false;
  }

  try {
    const parsedPayload: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (!isSessionPayload(parsedPayload)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const hasValidLifetime =
      parsedPayload.iat > 0 &&
      parsedPayload.iat <= now + 60 &&
      parsedPayload.exp > parsedPayload.iat &&
      parsedPayload.exp > now &&
      parsedPayload.exp - parsedPayload.iat <= SESSION_MAX_AGE_SECONDS;

    return (
      hasValidLifetime &&
      constantTimeStringEqual(parsedPayload.sub, getConfiguredUsername())
    );
  } catch {
    return false;
  }
}

export async function hasValidSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function isSessionAuthorized(request?: Request) {
  void request;
  return hasValidSession();
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}
