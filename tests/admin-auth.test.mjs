import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  getSessionCookieName,
  hashPassword,
  parseCookies,
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
});
