# Admin Config Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a server-backed, password-protected admin route for editing stream sources used by the viewer and chat pages.

**Architecture:** Keep the existing static UI, but serve it through a small Node HTTP server that owns admin authentication, source configuration, and future connector endpoints. Authentication uses server-side session tokens in hardened cookies; source config persists to `data/sources.json`; the browser receives only the public stream config.

**Tech Stack:** Node built-ins only (`node:http`, `node:crypto`, `node:fs/promises`), browser ES modules, Node test runner.

---

### Task 1: Admin Auth Unit

**Files:**
- Create: `src/admin-auth.mjs`
- Test: `tests/admin-auth.test.mjs`

- [x] Write failing tests for password hash verification, cookie parsing, and hardened session cookie attributes.
- [x] Implement PBKDF2 password verification and session cookie helpers with Node crypto.
- [x] Run `node --test tests/admin-auth.test.mjs`.

### Task 2: Source Config Unit

**Files:**
- Create: `src/source-config.mjs`
- Test: `tests/source-config.test.mjs`

- [x] Write failing tests for normalizing Twitch, Kick, X, and MarketBubble.com source rows.
- [x] Implement normalization, validation, public config projection, and default config loading.
- [x] Run `node --test tests/source-config.test.mjs`.

### Task 3: Server And Admin Route

**Files:**
- Create: `server.mjs`
- Create: `admin/index.html`
- Create: `admin/admin.mjs`
- Create: `data/sources.json`
- Modify: `README.md`

- [x] Add `GET /admin/` login/dashboard serving based on session.
- [x] Add `POST /api/admin/login`, `POST /api/admin/logout`, `GET/PUT /api/admin/sources`.
- [x] Add `GET /api/public-config` for viewer/chat pages.
- [x] Keep static serving for `/`, `/chat/`, CSS, and JS.
- [x] Run server locally and test login/config calls.

### Task 4: Viewer Config Wiring

**Files:**
- Modify: `src/app.mjs`
- Modify: `tests/chat-interaction-contract.test.mjs`

- [x] Fetch `/api/public-config` on startup and use it to build source rows.
- [x] Keep existing default sources when static serving or API fetch fails.
- [x] Preserve current Twitch connector behavior for configured Twitch sources.
- [x] Run existing chat model and interaction tests.

### Task 5: Verification

**Files:**
- No new files.

- [x] Run `node --check server.mjs src/*.mjs`.
- [x] Run `node --test tests/*.test.mjs`.
- [x] Browser-smoke `/`, `/chat/`, `/admin/` login, admin edit, and viewer refresh.
