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

## [2026-06-06] ui | Fit profile cards inside viewport

- Clamped profile-card top position upward when the border-attached placement would fall below the viewport.
- Kept right-side alignment and the preferred 1px message-border attachment when there is room.
- Updated the app module cache-bust query for the viewport-fitting hover-card runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; Chrome local bottom-row hover check measured the card moving upward to fit with a `12px` viewport bottom gap, a `12px` right gutter, and chat still at `distanceFromBottom: 0`.

## [2026-06-06] ui | Compact broadcast layout

- Replaced the old clock/title header space with one compact top bar containing the Market Bubble logo, combined viewers, and per-source breakdown.
- Removed internal stream/chat headers so the stream and chat panels fill the viewport area below the top bar.
- Tightened chat row, platform logo, label, and source-chip sizing toward Twitch-like density.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs`; `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; Chrome local viewer check measured a 52px top bar, no internal stream/chat headers, stream and chat panels both 787px tall in an 861px viewport, and video filling 785px of the stream panel.

## [2026-06-06] ui | Shrink profile hover cards

- Reduced the chat profile hover card width, max height, padding, shadow, heading size, handle size, and detail row spacing to match the compact Twitch-sized chat.
- Added a contract test so the hover card does not drift back to the oversized treatment.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs`; `git diff --check`; in-app browser local check loaded the compact CSS at `270px` width.

## [2026-06-07] ui | Keep profile cards clear of live button

- Profile hover cards now use the visible jump-to-live button as their lower boundary, keeping the profile card accessible while the live button remains available.
- Clicking jump-to-live clears profile inspection before rendering the pending live chat window.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (67 passed); `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; in-app browser local check scrolled up chat, showed jump-to-live, clicked it, and returned to `distanceFromBottom: 0` with the button hidden.

## [2026-06-07] ui | Pin profile cards on click

- Clicking a chat message now pins that message's profile card until the viewer clicks outside any chat message/profile card or uses jump-to-live.
- Pinned profile cards pause live following so incoming chat cannot move the inspected row, while jump-to-live clears the pin and resumes the live window.
- Updated both app module cache-bust query strings so browsers fetch the new pin runtime.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (68 passed); `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`; in-app browser local check pinned one profile card at 270px, showed jump-to-live, cleared on outside click, and cleared again through jump-to-live with `distanceFromBottom: 0`.

## [2026-06-07] ui | Suppress other hover cards while pinned

- Added a pinned-mode class to the chat feed so normal row-hover profile cards are disabled while one profile card is locked.
- Kept the pinned card visible and interactive, then removed pinned mode when the lock clears.
- Updated app and stylesheet cache-bust query strings so deployed browsers fetch the tightened selector.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (68 passed); `node --check src/app.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; in-app browser local check pinned one profile, hovered a different row, kept exactly one visible profile card, then cleared on outside click.

## [2026-06-07] ui | Move chat source labels under logos

- Removed the written Twitch/Kick/X platform badge from individual chat rows.
- Moved each row's stream/source label into a compact stack directly beneath the platform logo.
- Updated stylesheet and app cache-bust query strings so deployed browsers fetch the revised row layout.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (68 passed); `node --check src/app.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; in-app browser local check found zero chat-row platform badges, the source label below the logo, and message text aligned with the username.

## [2026-06-07] ui | Soften chat row spacing

- Centered the source label within the platform logo stack so logo and text read as one centered mark.
- Removed per-message borders and reduced alternating row contrast to make the feed less boxy.
- Tightened the vertical gap between username metadata and message text.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (69 passed); `node --check src/app.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; in-app browser local check measured `0px` message-row borders, centered logo/source mark, and `0px` gap between username line and message text.

## [2026-06-07] ui | Inline author names with chat colors

- Rendered messages Twitch-style as colored `author: message` text instead of a separate username metadata line.
- Preserved Twitch IRC username colors and Kick webhook `sender.identity.username_color` in the normalized message shape.
- Added deterministic fallback username colors for X, native room, and provider messages without a valid color.
- Verification: `node --test tests/chat-model.test.mjs tests/kick-webhook.test.mjs tests/twitch-connector.test.mjs tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (71 passed); `node --check src/app.mjs`; `node --check src/chat-renderer.mjs`; `node --check src/chat-model.mjs`; `git diff --check`; in-app browser local check confirmed no separate metadata line, inline colored author text, and `author: message` ordering.
