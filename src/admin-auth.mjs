import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);
const PASSWORD_ALGORITHM = "pbkdf2";
const PASSWORD_DIGEST = "sha256";
const PASSWORD_KEY_LENGTH = 32;
const DEFAULT_ITERATIONS = 210000;
const SECURE_SESSION_COOKIE_NAME = "__Host-mb_admin";
const LOCAL_SESSION_COOKIE_NAME = "mb_admin";

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
