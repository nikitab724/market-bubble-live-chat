import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createLoginThrottle,
  deriveIngestToken,
  getSessionCookieName,
  hashPassword,
  parseCookies,
  verifyIngestToken,
  verifyPassword,
} from "../src/admin-auth.mjs";

describe("admin auth", () => {
  it("hashes and verifies admin passwords without storing plaintext", async () => {
    const storedHash = await hashPassword("market-password", {
      iterations: 1200,
      salt: "00112233445566778899aabbccddeeff",
    });

    assert.equal(storedHash, "pbkdf2$sha256$1200$00112233445566778899aabbccddeeff$155e58a6dbef31b650e7d2b1a463517eb910f1077c26def363f5759fffe62ef0");
    assert.equal(await verifyPassword("market-password", storedHash), true);
    assert.equal(await verifyPassword("wrong-password", storedHash), false);
  });

  it("parses request cookies by name", () => {
    assert.deepEqual(parseCookies("theme=dark; __Host-mb_admin=abc123; empty="), {
      theme: "dark",
      "__Host-mb_admin": "abc123",
      empty: "",
    });
  });

  it("builds hardened admin session cookies", () => {
    const cookie = buildSessionCookie("session-token", {
      maxAgeSeconds: 3600,
      secure: true,
    });

    assert.equal(
      cookie,
      "__Host-mb_admin=session-token; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict; Secure",
    );
  });

  it("uses a localhost-safe cookie name without secure cookies", () => {
    const cookie = buildSessionCookie("session-token", {
      maxAgeSeconds: 3600,
      secure: false,
    });

    assert.equal(getSessionCookieName({ secure: false }), "mb_admin");
    assert.equal(cookie, "mb_admin=session-token; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict");
  });

  it("builds an expired admin session cookie for logout", () => {
    const cookie = buildExpiredSessionCookie({ secure: false });

    assert.equal(cookie, "mb_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
  });

  it("defaults to OWASP-strength PBKDF2 iterations for new hashes", async () => {
    const storedHash = await hashPassword("market-password");
    assert.equal(storedHash.split("$")[2], "600000");
  });

  it("locks out brute-force login attempts per client and recovers after the lockout window", () => {
    let clock = 1_000_000;
    const throttle = createLoginThrottle({
      maxAttempts: 3,
      lockoutMs: 60_000,
      now: () => clock,
    });

    assert.equal(throttle.check("1.2.3.4").allowed, true);
    throttle.recordFailure("1.2.3.4");
    throttle.recordFailure("1.2.3.4");
    assert.equal(throttle.check("1.2.3.4").allowed, true);

    // The attempt that hits the cap locks the client out.
    throttle.recordFailure("1.2.3.4");
    const locked = throttle.check("1.2.3.4");
    assert.equal(locked.allowed, false);
    assert.equal(locked.retryAfterMs > 0, true);

    // A different client is unaffected by another client's failures.
    assert.equal(throttle.check("9.9.9.9").allowed, true);

    // The lock clears once the window elapses.
    clock += 60_001;
    assert.equal(throttle.check("1.2.3.4").allowed, true);
  });

  it("clears a client's failure count on a successful login", () => {
    let clock = 5_000;
    const throttle = createLoginThrottle({ maxAttempts: 2, lockoutMs: 60_000, now: () => clock });

    throttle.recordFailure("1.2.3.4");
    throttle.recordSuccess("1.2.3.4");
    throttle.recordFailure("1.2.3.4");

    // After a reset the next failure should not immediately lock the client.
    assert.equal(throttle.check("1.2.3.4").allowed, true);
  });

  it("derives a stable X ingest token from the admin password hash and verifies it in constant time", async () => {
    const storedHash = await hashPassword("market-password", {
      iterations: 1200,
      salt: "00112233445566778899aabbccddeeff",
    });

    const token = deriveIngestToken(storedHash);
    assert.equal(typeof token, "string");
    assert.equal(token.length >= 32, true);
    // Stable for the same hash; rotates when the password (hash) changes.
    assert.equal(deriveIngestToken(storedHash), token);

    const otherHash = await hashPassword("other-password", {
      iterations: 1200,
      salt: "00112233445566778899aabbccddeeff",
    });
    assert.notEqual(deriveIngestToken(otherHash), token);

    assert.equal(verifyIngestToken(token, storedHash), true);
    assert.equal(verifyIngestToken(`${token}x`, storedHash), false);
    assert.equal(verifyIngestToken("", storedHash), false);
    assert.equal(verifyIngestToken(token, ""), false);
  });
});
