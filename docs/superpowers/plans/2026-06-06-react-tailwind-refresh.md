# React Tailwind Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the viewer/chat shell to React + Vite + Tailwind while preserving the existing backend, provider connectors, and high-volume chat renderer behavior.

**Architecture:** Vite builds the browser surfaces into `dist/client`; `server.mjs` serves built files first and falls back to the source allowlist for tests. React renders the viewer/chat shell, then calls `mountLiveApp()` so the existing stream/chat runtime attaches to stable DOM ids.

**Tech Stack:** Node server, Vite, React, Tailwind CSS, existing vanilla chat runtime modules.

---

### Task 1: Frontend Build Foundation

**Files:**
- Create: `vite.config.mjs`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `server.mjs`

- [x] Add Vite, React, Tailwind dependencies and scripts.
- [x] Configure Vite multi-page inputs for `/`, `/chat/`, and `/admin/`.
- [x] Build frontend assets in Docker before starting `server.mjs`.
- [x] Serve `dist/client` routes and `/assets/*` before source fallbacks.
- [x] Verify: `npm run build` and `node --test tests/server-contract.test.mjs`.

### Task 2: React Viewer/Chat Shell

**Files:**
- Create: `src/ui/main.jsx`
- Create: `src/ui/ViewerApp.jsx`
- Create: `src/ui/tailwind.css`
- Modify: `index.html`
- Modify: `chat/index.html`
- Modify: `src/app.mjs`

- [x] Replace static viewer/chat HTML with a React root and shared entry.
- [x] Render the same runtime DOM ids from React: `streamPlayer`, `chatFeed`, `jumpToLive`, `viewerCount`, and `sourceBreakdown`.
- [x] Convert `src/app.mjs` into exported `mountLiveApp()` so React can render before connectors attach.
- [x] Verify: `node --test tests/architecture-contract.test.mjs tests/chat-interaction-contract.test.mjs`.

### Task 3: Market Bubble Visual Polish

**Files:**
- Modify: `styles.css`
- Keep: `src/chat-renderer.mjs`

- [x] Keep the same viewer/chat layout while softening colors, borders, panel radius, and shadow.
- [x] Add restrained entry and chat-row motion inspired by the Market Bubble reference.
- [x] Preserve platform logo/source label rows, username colors, hover cards, and bottom-anchored chat.
- [x] Verify in browser at `/` and `/chat/`.

### Task 4: Docs And Deployment Notes

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/testing.md`
- Modify: `docs/wiki/log.md`

- [x] Document the Vite/React shell and build requirement.
- [x] Document deploy now runs `npm ci` and `npm run build` inside Docker.
- [x] Update testing commands with `npm test` and `npm run build`.
- [x] Append a wiki log entry with verification.
