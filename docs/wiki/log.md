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
