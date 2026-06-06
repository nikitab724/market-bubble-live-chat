# Wiki Log

Append-only timeline for ingests, queries, lint passes, and repo-changing runs. Use stable headings so `rg "^## \\[" docs/wiki/log.md` shows the history.

## [2026-06-06] docs | Add LLM Wiki structure

- Added persistent wiki navigation with `docs/wiki/index.md`.
- Added append-only maintenance history with `docs/wiki/log.md`.
- Added `docs/sources/` as the raw/source-like layer.
- Corrected the earlier docs from an `llms.txt`-only interpretation to the user-provided persistent LLM Wiki pattern.
- Verification: `git diff --check`; `node --test tests/*.test.mjs` (59 passed).

## [2026-06-06] refactor | Split browser runtime and configure X extension backend URL

- Split the browser runtime out of `src/app.mjs` into focused stream, chat runtime, chat renderer, demo chat, platform, and fallback source modules.
- Moved seeded/demo chat behind explicit `?demoChat=1` or `?demoChat=true` opt-in.
- Added Chrome extension backend URL storage so the popup controls the backend base URL used for source config and X chat ingest.
- Added `tests/architecture-contract.test.mjs` to pin the new architecture boundaries.
- Verification: `git diff --check`; `node --test tests/*.test.mjs` (62 passed); `node --check` on browser/extension modules; in-app browser smoke for `/`, `/?demoChat=1`, and `/chat/?demoChat=1` with no console errors.

## [2026-06-06] ui | Add platform logos to compact chat rows

- Added compact Twitch, Kick, X, and MB platform logo badges before chat usernames.
- Tightened chat row spacing, label padding, message text size, and body alignment.
- Updated demo chat source resolution so `?demoChat=1` exercises current configured Twitch/Kick/X/room sources.
- Verification: `git diff --check`; `node --test tests/*.test.mjs` (63 passed); `node --check src/chat-renderer.mjs src/demo-chat.mjs src/app.mjs`; in-app browser smoke for `/chat/?demoChat=1` with Twitch/Kick/X/room logos and no console errors.

## [2026-06-06] ui | Stabilize live chat scrolling

- Replaced exact bottom detection with a 120px live-chat autoscroll threshold.
- Paused chat DOM updates while a viewer is reading older messages, keeping incoming messages in memory until jump-to-live renders the pending window.
- Updated the chat architecture note and interaction contract to pin the scroll behavior.
- Verification: `git diff --check`; `node --check src/chat-renderer.mjs src/app.mjs`; `node --test tests/*.test.mjs` (64 passed); in-app browser smoke for `/chat/?demoChat=1` where scrolled-up chat stayed frozen through injected Kick messages, jump-to-live rendered the backlog, distance from bottom returned to `0`, and console errors were empty.

## [2026-06-06] ui | Prevent chat boundary bounce

- Added non-passive wheel and touch guards on the chat feed so bottom/top boundary gestures cannot trigger rubber-band bounce.
- Kept normal scroll-up history reading, scroll-down return-to-live, and existing jump-to-live behavior intact.
- Added an interaction contract for the boundary guard.
- Updated the viewer and chat module cache-bust query so browsers fetch the new runtime on reload.
- Verification: `git diff --check`; `node --check src/chat-renderer.mjs src/app.mjs`; `node --test tests/*.test.mjs` (65 passed); in-app browser smoke for `/chat/?demoChat=1` where forced bottom scroll stayed pinned at distance `0`, normal scroll-up paused live mode, normal scroll-down returned to live, and console errors were empty.

## [2026-06-06] ui | Add chat scroll firewall

- Locked `html` and `body` so the browser page cannot rubber-band behind the chat surface.
- Moved wheel/touch capture to the whole chat panel and routed panel gestures into the chat feed, matching embedded live-chat surfaces where only the transcript scrolls.
- Preserved the bottom threshold, paused-reading state, and jump-to-live behavior.
- Updated the app module cache-bust query for the new runtime.
- Verification: `git diff --check`; `node --check src/chat-renderer.mjs src/app.mjs`; `node --test tests/*.test.mjs` (65 passed); in-app browser smoke for `/chat/?demoChat=1` confirmed `body`/`html` overflow hidden, `body` fixed, document height equal to viewport, scroll-down at bottom stayed at distance `0`, header scroll gestures moved the feed instead of the page, normal feed scroll still worked, and console errors were empty.
