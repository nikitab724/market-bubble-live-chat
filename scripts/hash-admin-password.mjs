#!/usr/bin/env node
// Generate an ADMIN_PASSWORD_HASH for the Market Bubble admin panel.
//
// Usage:
//   node scripts/hash-admin-password.mjs 'your-strong-password'
//   ADMIN_PASSWORD='your-strong-password' node scripts/hash-admin-password.mjs
//
// Copy the printed line into the server's .env (never commit it). The hash is
// PBKDF2-HMAC-SHA256 with a per-hash random salt and embedded iteration count,
// so it is safe to store and verifies without the plaintext.

import { hashPassword } from "../src/admin-auth.mjs";

const password = process.argv[2] || process.env.ADMIN_PASSWORD || "";

if (!password) {
  console.error("Provide a password as an argument or via ADMIN_PASSWORD.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("Refusing to hash a password under 12 characters. Use a longer passphrase.");
  process.exit(1);
}

const hash = await hashPassword(password);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
