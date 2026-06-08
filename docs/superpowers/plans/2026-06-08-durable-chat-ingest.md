# Durable Chat Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop chat messages from disappearing during bursts or reconnects by routing provider chat through one durable backend delivery lane.

**Architecture:** Add a small replay buffer to the SSE chat event hub with event ids, startup/reconnect replay, and heartbeat comments. Move Twitch chat ingestion from browser tabs to a server-managed connector pool that broadcasts normalized messages through the same hub as Kick and X.

**Tech Stack:** Node HTTP server, Server-Sent Events, existing browser runtime modules, `node --test`.

---

### Task 1: Durable SSE Hub

**Files:**
- Modify: `src/chat-events.mjs`
- Test: `tests/chat-events.test.mjs`

- [x] Write failing tests proving burst broadcasts keep ordered ids and a reconnect with `Last-Event-ID` receives missed events.
- [x] Run `node --test tests/chat-events.test.mjs` and confirm the new reconnect test fails.
- [x] Add a bounded replay buffer, SSE `id:` output, reconnect replay, and optional heartbeat cleanup.
- [x] Re-run `node --test tests/chat-events.test.mjs` and confirm it passes.

### Task 2: Server-Side Twitch Fan-In

**Files:**
- Create: `src/twitch-chat-service.mjs`
- Modify: `src/twitch-connector.mjs`
- Modify: `server.mjs`
- Modify: `src/chat-runtime.mjs`
- Test: `tests/twitch-chat-service.test.mjs`
- Test: `tests/chat-interaction-contract.test.mjs`

- [x] Write failing tests proving Twitch source changes start/stop one connector per enabled source and broadcast messages through the supplied hub.
- [x] Run the focused test and confirm it fails because the service does not exist.
- [x] Add an injectable Twitch chat service that manages connector lifecycles by source id.
- [x] Start/sync that service when public config, live-state, and admin saves load source config.
- [x] Remove browser-side Twitch connector startup from the viewer runtime so Twitch no longer competes with backend chat delivery.
- [x] Re-run focused tests and the chat interaction contract.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/connectors.md`
- Modify: `docs/wiki/log.md`

- [x] Update docs to say Twitch, Kick, and X chat arrive through backend SSE with replay for reconnects.
- [x] Append the wiki log entry with touched areas and verification.
- [x] Run `npm test`, `npm run build`, and `git diff --check`.
