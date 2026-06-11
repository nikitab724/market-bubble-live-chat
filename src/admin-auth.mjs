import { createHmac, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);
const PASSWORD_ALGORITHM = "pbkdf2";
const PASSWORD_DIGEST = "sha256";
const PASSWORD_KEY_LENGTH = 32;
// OWASP 2023 guidance for PBKDF2-HMAC-SHA256. Stored hashes embed their own
// iteration count, so older hashes keep verifying after this default rises.
const DEFAULT_ITERATIONS = 600000;
const SECURE_SESSION_COOKIE_NAME = "__Host-mb_admin";
const LOCAL_SESSION_COOKIE_NAME = "mb_admin";
const INGEST_TOKEN_CONTEXT = "mb-x-ingest-v1";

export async function hashPassword(password, options = {}) {
  const iterations = Number(options.iterations || DEFAULT_ITERATIONS);
  const salt = options.salt || randomBytes(16).toString("hex");
  const hash = await pbkdf2(String(password), salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);

  return [PASSWORD_ALGORITHM, PASSWORD_DIGEST, iterations, salt, hash.toString("hex")].join("$");
}

export async function verifyPassword(password, storedHash) {
  const parsed = parseStoredHash(storedHash);

  if (!parsed) {
    return false;
  }

  const actual = await pbkdf2(String(password), parsed.salt, parsed.iterations, parsed.hash.length, parsed.digest);

  return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

// In-memory per-client brute-force guard for the login route. Pure and clock-
// injectable so it can be unit tested. Keyed by client identifier (IP).
export function createLoginThrottle({
  maxAttempts = 8,
  lockoutMs = 15 * 60 * 1000,
  now = Date.now,
} = {}) {
  const records = new Map();

  function read(key) {
    const record = records.get(key);
    if (!record) return null;
    if (record.lockedUntil && record.lockedUntil <= now()) {
      records.delete(key);
      return null;
    }
    return record;
  }

  return {
    check(key) {
      const record = read(key);
      if (record?.lockedUntil && record.lockedUntil > now()) {
        return { allowed: false, retryAfterMs: record.lockedUntil - now() };
      }
      return { allowed: true, retryAfterMs: 0 };
    },

    recordFailure(key) {
      const record = read(key) || { failures: 0, lockedUntil: 0 };
      record.failures += 1;
      if (record.failures >= maxAttempts) {
        record.lockedUntil = now() + lockoutMs;
      }
      records.set(key, record);
    },

    recordSuccess(key) {
      records.delete(key);
    },
  };
}

// The X chat bridge cannot send the admin session cookie (it runs cross-origin
// from the extension), so it authenticates with a bearer token. The token is
// derived from the admin password hash: stable across restarts, rotates when
// the password changes, and only obtainable by someone who can already log in
// (the admin UI surfaces it behind the session). Knowing the public config is
// not enough to forge it.
export function deriveIngestToken(adminPasswordHash) {
  if (!adminPasswordHash) {
    return "";
  }

  return createHmac("sha256", String(adminPasswordHash)).update(INGEST_TOKEN_CONTEXT).digest("hex");
}

export function verifyIngestToken(provided, adminPasswordHash) {
  const expected = deriveIngestToken(adminPasswordHash);
  if (!expected || !provided) {
    return false;
  }

  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function parseCookies(cookieHeader = "") {
  const cookies = {};

  for (const cookie of String(cookieHeader).split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (!rawName) continue;

    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

export function getSessionCookieName(options = {}) {
  return options.secure === false ? LOCAL_SESSION_COOKIE_NAME : SECURE_SESSION_COOKIE_NAME;
}

export function buildSessionCookie(token, options = {}) {
  const secure = options.secure !== false;

  return buildCookie(token, {
    maxAgeSeconds: options.maxAgeSeconds || 60 * 60 * 12,
    name: getSessionCookieName({ secure }),
    secure,
  });
}

export function buildExpiredSessionCookie(options = {}) {
  const secure = options.secure !== false;

  return buildCookie("", {
    maxAgeSeconds: 0,
    name: getSessionCookieName({ secure }),
    secure,
  });
}

function parseStoredHash(storedHash) {
  const [algorithm, digest, iterations, salt, hashHex] = String(storedHash || "").split("$");

  if (algorithm !== PASSWORD_ALGORITHM || digest !== PASSWORD_DIGEST || !iterations || !salt || !hashHex) {
    return null;
  }

  return {
    digest,
    hash: Buffer.from(hashHex, "hex"),
    iterations: Number(iterations),
    salt,
  };
}

function buildCookie(value, options) {
  const parts = [
    `${options.name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
