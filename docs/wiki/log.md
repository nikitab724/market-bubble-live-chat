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

## [2026-06-06] ui | Use controlled chat scrolling

- Removed native vertical scrolling from `.chat-feed` with `overflow-y: hidden` and `touch-action: none`.
- Changed wheel/touch handling to always cancel native scroll and manually clamp `scrollTop` between `0` and the last message.
- Updated the app module cache-bust query for the controlled scroller.
- Verification: `git diff --check`; `node --check src/chat-renderer.mjs src/app.mjs`; `node --test tests/*.test.mjs` (65 passed); in-app browser smoke for `/chat/?demoChat=1` confirmed `overflow-y: hidden`, `touch-action: none`, repeated wheel-down directly over the last row stayed at distance `0`, normal wheel-up paused live mode, wheel-down clamped to bottom, `window.scrollY` stayed `0`, and console errors were empty.

## [2026-06-06] ui | Keep bottom hover live

- Allowed append-only live rendering while hovering bottom chat rows so profile hover does not make the feed fall behind live.
- Kept hover/profile render freezing only for the scrolled-up reading state.
- Updated the app module cache-bust query for the hover follow-up.
- Verification: Chrome deployed-page repro showed live chat could fall `181px` behind bottom while hammering the newest rows before this patch; `git diff --check`; `node --check src/chat-renderer.mjs src/app.mjs`; `node --test tests/*.test.mjs` (65 passed) now pins bottom hover as a live-following state.

## [2026-06-06] ui | Fix bottom hover scroll overflow

- Moved chat profile hover cards to fixed overlay positioning so hovering the newest rows cannot add scrollable overflow below the last message.
- Removed the native chat feed scroll listener from the controlled-scroll path and clamped live autoscroll to the feed's current max scroll position.
- Updated the app module cache-bust query for the fixed hover-card runtime.
- Verification: focused `node --test tests/chat-interaction-contract.test.mjs` passed; Chrome local repro with 180 injected chat messages plus repeated wheel-down gestures over the bottom rows stayed at `distanceFromBottom: 0`, with jump-to-live hidden and `window.scrollY: 0`; scroll-up still paused at `distanceFromBottom: 900`, and jump-to-live returned to `0`.

## [2026-06-06] ui | Center jump-to-live control

- Moved the chat jump-to-live button to bottom center of the chat panel.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `git diff --check`.

## [2026-06-06] ui | Anchor profile cards to hovered users

- Kept profile cards fixed so they do not add chat scroll height, but positioned them from the hovered username row instead of the viewport corner.
- Added pointer-move positioning so live chat row movement keeps the card attached to the user under the cursor.
- Updated the app module cache-bust query for the anchored hover-card runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; Chrome local hover check measured the profile card left edge matching the hovered username left edge with chat still at `distanceFromBottom: 0`.

## [2026-06-06] ui | Place profile cards below messages

- Positioned profile cards from the hovered message bottom edge so the card opens below the message instead of covering it.
- Made clipped bottom-edge cards scrollable while keeping them fixed outside chat layout.
- Updated the app module cache-bust query for the below-message hover-card runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; Chrome local hover check measured the card `10px` below the hovered message row, left-aligned with the username, with chat still at `distanceFromBottom: 0`.

## [2026-06-06] ui | Attach profile cards to message border

- Moved profile cards to overlap the hovered message border by 1px so the pointer can travel directly from the message onto the card.
- Counted profile-card hover as active profile inspection so the fixed card stays open while navigating onto it.
- Updated the app module cache-bust query for the border-attached hover-card runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; Chrome local hover check measured the profile card overlapping the hovered message border by `1px`, left-aligned with the username, with chat still at `distanceFromBottom: 0`.

## [2026-06-06] ui | Shift profile cards to message right side

- Anchored profile cards toward the right side of the hovered message row instead of the username's left edge.
- Preserved the 1px message-border overlap so pointer travel from message to card stays continuous.
- Updated the app module cache-bust query for the right-side hover-card runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; Chrome local hover check measured a `12px` right gutter from message row to card, `1px` message-border overlap, and chat still at `distanceFromBottom: 0`.
