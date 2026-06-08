# SQLite Chat Event Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist backend chat events in SQLite so SSE ids and replay survive server restarts while keeping setup easy for a single-container deployment.

**Architecture:** Add an embedded SQLite event store at `data/chat-events.sqlite` by default, wire it into `createChatEventHub`, and use DB row ids as SSE ids. Keep in-memory fallback injectable for tests and simple failure isolation.

**Tech Stack:** Node HTTP server, Server-Sent Events, SQLite via `better-sqlite3`, `node --test`.

---

### Task 1: SQLite Event Store

**Files:**
- Create: `src/chat-event-store.mjs`
- Test: `tests/chat-event-store.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

- [x] Write failing tests for append, replay after id, recent replay limit, startup persistence, and retention cleanup.
- [x] Run `node --test tests/chat-event-store.test.mjs` and confirm the store module is missing.
- [x] Install `better-sqlite3`.
- [x] Implement schema creation, append, replay, close, and retention cleanup.
- [x] Ignore generated local SQLite files under `data/`.
- [x] Re-run `node --test tests/chat-event-store.test.mjs`.

### Task 2: Hub And Server Wiring

**Files:**
- Modify: `src/chat-events.mjs`
- Modify: `server.mjs`
- Test: `tests/chat-events.test.mjs`
- Test: `tests/server-contract.test.mjs`

- [x] Write failing hub/server tests proving stored ids are used and replay survives hub recreation.
- [x] Update `createChatEventHub` to accept an event store and use persisted ids before broadcasting.
- [x] Create the default SQLite store in `server.mjs`, with `CHAT_DB_PATH`, `CHAT_RETENTION_DAYS`, and `CHAT_REPLAY_LIMIT` env support.
- [x] Close the DB store when the HTTP server closes.
- [x] Re-run focused tests.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/connectors.md`
- Modify: `docs/deployment.md`
- Modify: `docs/wiki/index.md`
- Modify: `docs/wiki/log.md`
- Modify: `docs/superpowers/plans/2026-06-08-sqlite-chat-event-log.md`

- [x] Document the DB path, env vars, retention behavior, and single-container tradeoff.
- [x] Link this spec and plan from the wiki index.
- [x] Append the wiki log entry.
- [x] Run `node --test tests/chat-event-store.test.mjs tests/chat-events.test.mjs tests/server-contract.test.mjs`.
- [x] Run `npm test`, `npm run build`, and `git diff --check`.
