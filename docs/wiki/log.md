# Wiki Log

Append-only timeline for ingests, queries, lint passes, and repo-changing runs. Use stable headings so `rg "^## \\[" docs/wiki/log.md` shows the history.

## [2026-06-06] ui | React Tailwind visual refresh

- Added a Vite/React/Tailwind frontend shell for `/` and `/chat/` while keeping the existing backend, provider connectors, and high-volume chat renderer.
- Updated Docker/server static serving so production builds `dist/client` and the Node server serves built assets before source fallbacks.
- Refreshed the Market Bubble visual treatment with softer black/off-white panels, compact source metrics, restrained motion, and cleaner chat/profile styling.
- Verification: `npm run build`; `npm test`; in-app browser smoke checks for `/`, `/chat/?demoChat=1`, and `/admin/` with no console warnings/errors.

## [2026-06-06] fix | Remove chat bottom bounce regression

- Removed the visual-refresh bottom padding from `.chat-feed` so the newest row sits flush with the controlled scroll boundary again.
- Changed chat row entrance motion to fade-only so new rows do not use vertical transforms that can look like bounce at the bottom clamp.
- Added a chat interaction contract covering the no-padding/no-row-transform behavior.
- Verification: `npm test`; `npm run build`; `git diff --check`; in-app browser `/chat/?demoChat=1` check confirmed bottom distance stayed `0`, newest row bottom equaled feed bottom, and `window.scrollY` stayed `0` after hard down-scroll.

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

## [2026-06-07] ui | Hide row timestamps

- Removed the visible sent-time from inline chat message rows.
- Kept timing available through the existing profile hover card `Last seen` detail.
- Updated app and stylesheet cache-bust query strings so deployed browsers fetch the timestamp-free row markup.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --test tests/*.test.mjs` (71 passed); `node --check src/app.mjs`; `node --check src/chat-renderer.mjs`; `git diff --check`; in-app browser local check confirmed no visible row time element or clock text while the profile hover card still showed `Last seen` and a timestamp.

## [2026-06-07] connectors | Render Twitch and Kick chat badges

- Added shared normalized chat badge metadata, Twitch IRC badge parsing, and Kick webhook identity badge parsing.
- Added `GET /api/twitch-badges?channel=...` to cache Twitch global/channel badge images from Helix so Twitch badges render as images when available.
- Rendered compact inline badges before chat authors; Kick badges render as text chips from type/text/count metadata.
- Verification: `node --test tests/chat-model.test.mjs tests/twitch-connector.test.mjs tests/kick-webhook.test.mjs tests/twitch-api.test.mjs tests/chat-interaction-contract.test.mjs`; `node --test tests/server-contract.test.mjs`; `npm test` (79 passed); `npm run build`; `node --check src/chat-model.mjs src/twitch-connector.mjs src/kick-webhook.mjs src/twitch-api.mjs src/chat-runtime.mjs src/app.mjs src/chat-renderer.mjs server.mjs`; in-app browser smoke loaded `/?demoChat=1&layout=mini`, found chat/stream mounted, badge CSS present, and no browser errors.

## [2026-06-07] ui | Badge-only hover tooltips

- Wrapped inline chat badges with badge-specific hover targets so Twitch image badges and Kick text chips can show their badge title directly.
- Suppressed the user profile hover card while the pointer is on a badge, including badge clicks, so badge inspection does not accidentally pin/open profile details.
- Kept badge hover on the normal cursor instead of the browser help/question-mark cursor.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (80 passed); `npm run build`; `node --check src/app.mjs src/chat-renderer.mjs`; `git diff --check`.

## [2026-06-07] ui | Stabilize pinned-profile jump-to-live

- Kept pinned profile cards in paused-chat mode during wheel/touch scroll so scroll events cannot flip the chat back to following live.
- Kept the Jump to Live control visible while a profile card is pinned, preventing rapid hidden/visible flicker when the pinned card is scrolled near the bottom.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (81 passed); `npm run build`; `node --check src/chat-renderer.mjs`; `git diff --check`.

## [2026-06-07] ui | Move mini source popovers right

- Changed mini-layout source/profile popovers to open to the right of the left source rail instead of below each source chip.
- Kept the popover touching the chip edge so the viewer can move from the chip into the popover without losing hover.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (81 passed); `npm run build`; `git diff --check`.

## [2026-06-07] ui | Add cinematic layout transition

- Replaced the text mini/full toggle with an icon-only layout control and `F` keyboard shortcut.
- Added View Transitions API support for the mini/full layout switch, with CSS transition fallback on the stream, chat, and top bar surfaces.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (81 passed); `npm run build`; `git diff --check`.

## [2026-06-07] ui | Roll viewer count changes

- Added persistent animated counters for the combined viewer total and each source viewer count.
- Count changes now step up or down by one with a subtle vertical roll animation after the initial paint; reduced-motion clients snap directly to the latest count.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `npm test` (82 passed); `npm run build`; `git diff --check`.

## [2026-06-07] ui | Speed up viewer count rolling

- Replaced the fixed one-count timer with a timestamp-based `requestAnimationFrame` loop for smoother browser-scheduled number animation.
- Added exponential catch-up math so large viewer-count gaps move quickly, then ease into small final steps near the target.
- Shortened the visual roll duration from 140ms to 90ms.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `npm test` (82 passed); `npm run build`; `git diff --check`.

## [2026-06-07] fix | Remove viewer count bounce

- Removed the vertical count-roll keyframes from live viewer counts because they restarted every animation frame during exponential catch-up.
- Kept the fast exponential counter, but changed the live visual treatment to a non-moving color/opacity highlight so count changes do not bounce.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `npm test` (82 passed); `npm run build`; `git diff --check`.

## [2026-06-07] ui | Add per-digit count motion

- Replaced whole-number viewer count highlighting with individual clipped digit slots so changed digits roll independently during exponential catch-up.
- Changed the full-layout toggle icon from inward corners to a simple minimize line while keeping the mini-layout expand corners.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `npm test` (82 passed); `npm run build`; `git diff --check`.

## [2026-06-07] perf | Remove extra viewer count animations

- Removed the per-digit odometer DOM, digit-roll keyframes, and decorative rolling state from viewer counts.
- Kept the exponential catch-up value updates and tabular number styling so counts remain responsive without extra visual work.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check src/chat-renderer.mjs`; `npm test` (83 passed); `npm run build`; `git diff --check`.

## [2026-06-08] connector | Resolve Kick broadcaster ids in admin

- Added Kick handle-to-broadcaster id resolution through the Kick Channels API and persisted `broadcasterUserId` on Kick admin source saves.
- Added a read-only Kick broadcaster user id field to the admin profile editor so operators can confirm which Kick channel was resolved.
- Updated source config/admin model/server contract tests for the new Kick data shape.
- Verification: `node --test tests/kick-api.test.mjs`; `node --test tests/source-config.test.mjs tests/admin-profile-model.test.mjs`; `node --test tests/server-contract.test.mjs`; `npm test` (85 passed); `npm run build`; `node --check src/kick-api.mjs`; `node --check admin/admin.mjs`; `node --check server.mjs`.

## [2026-06-08] fix | Restore admin page scrolling

- Added an `admin-root` document class and scoped CSS override so the admin page can scroll while the viewer/chat surfaces keep their locked anti-bounce body behavior.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `node --check admin/admin.mjs`; `npm run build`; browser check confirmed `/admin/` scrolls after rebuild; `npm test` (86 passed); `git diff --check`.

## [2026-06-08] ui | Use official Market Bubble logo asset

- Replaced the typed Market Bubble wordmark and native `MB` chat badge with the official Market Bubble logo image from the public site favicon asset.
- Updated viewer/chat/admin favicons and the server static asset allowlist for the new logo file.
- Verification: `node --check src/chat-renderer.mjs`; `node --check server.mjs`; `git diff --check`; `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; browser smoke confirmed the topbar logo loaded at 36px with no console errors and `/assets/market-bubble-logo.jpg` served as a JPEG.

## [2026-06-08] ui | Add Banks quote overlay

- Added the “if no one sees the vision, go alone” quote as a small bottom-left note on the main viewer surface, outside the stream embed.
- Styled the quote with the Market Bubble display font as a single horizontal uppercase line and reserved a narrow bottom gutter so it sits below the stream in full layout.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; in-app browser check for `/?layout=full&demoChat=1` confirmed the quote is outside `.video-frame`/`.stream-view`, below the stream, 14px from viewport left, 10px from viewport bottom, 11.52px, horizontal, with no console errors.

## [2026-06-08] ui | Refine logo text lockup

- Kept the official Market Bubble icon, enlarged the top-left brand lockup, and restored visible Market Bubble text beside it.
- Replaced the liquid threshold attempt with a reduced-motion-safe text write-in on page refresh.
- Verification: `git diff --check`; `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; in-app browser checks on `/?layout=full&demoChat=1` confirmed the desktop lockup renders at 141x56 with a 44px logo, `brand-text-write-in` resolves from clipped to visible, mobile 390px does not spill or overlap, and no console errors were logged.

## [2026-06-08] ui | Move stream layout toggle overlay

- Moved the full/mini layout toggle from the top bar into the stream frame's top-left overlay position.
- Changed the full-layout minimize icon from a flat line to inward-facing corner arrows that pair with the mini-layout outward expand icon.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; `git diff --check`; in-app browser smoke on `/?layout=full&demoChat=1` confirmed the control sits 12px from the stream frame top-left, no top-bar duplicate exists, click toggles to the outward expand icon, and no console errors were logged.

## [2026-06-08] ui | Dock stream layout toggle into border

- Changed the stream layout toggle from an inset floating overlay to a flush top-left border tab on the stream frame.
- Kept the inward minimize corners and outward expand corners while removing the tab's top/left border so it reads as part of the frame edge.
- Verification: red/green `node --test --test-name-pattern "docks the layout toggle" tests/chat-interaction-contract.test.mjs`; `node --test tests/chat-interaction-contract.test.mjs`; `npm run build`; `npm test` (86 passed); `git diff --check`; in-app browser smoke on `/?layout=full&demoChat=1` confirmed the tab offset is 0/0 from the stream frame, no top-bar duplicate exists, and no console errors were logged.

## [2026-06-08] ui | Reference-driven broadcast polish

- Restyled the viewer and admin surfaces around the public Market Bubble reference: light paper page, rounded black stage, quiet pill metrics, and restrained translucent stream/chat/admin panels.
- Enlarged and stabilized the top-left logo/text lockup, softened chat row density, and converted the sub-500px source metrics into a compact horizontally-scrollable strip so mobile fits without clipping.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; `git diff --check`; in-app browser checks on `/?demoChat=1` at 1280x720 and 390x844 plus `/admin` confirmed no overlaps, no page overflow, and no console errors.

## [2026-06-08] ui | Restore all-black broadcast surface

- Removed the light paper page treatment and restored the viewer/admin base surfaces to black-on-black.
- Kept the larger logo/text lockup and compact mobile metric strip, but changed the viewer counter and metrics bar back to dark/translucent instead of pale pills.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm run build`; `git diff --check`; in-app browser checks on `/?demoChat=1` at 1280x720 and 390x844 plus `/admin` confirmed black backgrounds, no overlaps, no page overflow, and no console errors.

## [2026-06-08] ui | Center top metric numbers

- Removed the visible top metrics capsule so the viewer/source stats sit directly on the black surface.
- Reworked source stats into two-line blocks with each count centered under its source label on desktop and mobile.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm run build`; `git diff --check`; in-app browser checks on `/?demoChat=1` at 1280x720 and 390x844 confirmed no metric pill, centered counts, no overflow, and no console errors.

## [2026-06-08] fix | Restore mini toggle and scroll lock after fetch

- Merged the latest `origin/main` UI baseline into the frontend polish branch and updated the interaction contract to match the fetched DOM/style shape.
- Kept the stream layout toggle as a stable 40px circular border control in both full and mini layouts, restored the hover/focus visual state, and changed the full-layout minimize icon back to inward corners.
- Removed vertical row movement from the chat message entrance keyframes and locked the viewer surface against overscroll so wheel-down does not restart the visual bounce.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`; in-app browser smoke on `/?layout=mini&demoChat=1` confirmed a 40x40 circular mini toggle, outward expand icon, no page scroll after wheel-down, no console errors, and clicking back to full restored the 40x40 inward minimize icon.

## [2026-06-08] fix | Keep profile hover stable during live chat

- Changed live chat rendering so any active profile hover queues incoming chat DOM updates instead of appending/scrolling rows under the pointer.
- Updated the chat interaction contract to cover profile hover inspection at the live bottom, not only while reading older messages.
- Verification: `node --test tests/chat-interaction-contract.test.mjs`; `npm test` (86 passed); `npm run build`.

## [2026-06-08] fix | Restore visible chat profile cards

- Removed the remaining blur filter from chat row entrance keyframes because the filled animation made each row a containing block for fixed-position profile cards.
- Extended the chat interaction contract so row keyframes cannot use transform or filter, keeping profile cards positioned against the viewport.
- Verification: `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "controlled chat bottom"`; `node --test tests/chat-interaction-contract.test.mjs`; `npm run build`; in-app browser smoke confirmed a pinned profile card renders at `left=1024 top=475` within a 1280x720 viewport with row `filter: none` and no console errors.

## [2026-06-08] ui | Brighten chat row hover text

- Increased chat row hover contrast by brightening the message body, author name, colon, and source label instead of relying only on the row background.
- Updated the chat interaction contract to lock in the brighter hover text treatment.
- Verification: `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "keeps chat rows tight"`; `npm test` (86 passed); `npm run build`; `git diff --check`; in-app browser smoke confirmed the served demo chat loaded 26 messages, all four hover text brightening rules were present, and there were no console errors.

## [2026-06-08] ui | Add shadcn count animation component

- Added the `components/ui/count-animation.tsx` Framer Motion count animation and colocated demo under the shadcn-style component path.
- Added the shared `@/lib/utils` `cn` helper, shadcn metadata, TypeScript config, Vite `@/` alias, and required npm dependencies for the TSX component.
- Documented the reusable component path in the architecture notes and added a focused component integration contract.
- Verification: `node --test tests/count-animation-component.test.mjs`; `npx tsc --noEmit`; `npm test` (88 passed); `npm run build`; `git diff --check`.

## [2026-06-08] ui | Remove chat hover text shadow

- Removed the hover text-shadow from chat authors and source labels so the brighter hover text does not pick up a dark smoky overlay.
- Extended the chat interaction contract to keep hover text brightening while preventing hover text shadows from returning.
- Verification: `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "keeps chat rows tight"`; `npm test` (88 passed); `npm run build`; in-app browser smoke confirmed served hover text rules have no `text-shadow`, still brighten all chat text parts, and report no console errors.

## [2026-06-08] fix | Subscribe Kick chat webhooks on admin save

- Added Kick event subscription support for configured broadcasters so admin saves create missing `chat.message.sent` webhook subscriptions after resolving `broadcasterUserId`.
- Wired the admin source save route and existing public config loads to ensure Kick chat subscriptions, with a cache so normal polling does not repeat successful subscription checks.
- Documented the webhook/subscription setup requirement.
- Verification: `node --test tests/kick-api.test.mjs`; `node --test tests/server-contract.test.mjs --test-name-pattern "existing public config|resolves Kick"`; `npm test` (90 passed); `npm run build`; local SSE smoke confirmed `/api/dev/kick-chat` broadcasts a normalized Kick chat event.

## [2026-06-08] ui | Integrate layout toggle into stream border

- Reworked the stream layout toggle from a circular arrow button into a clickable L-shaped border-corner control.
- Hid the old arrow icon CSS while keeping the existing button semantics, layout mode toggle behavior, and keyboard focus affordance.
- Verification: `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "layout"`; `npm test` (90 passed); `npm run build`; in-app browser smoke confirmed the 58x58 mini control aligns with the video frame corner, toggles to full layout on click, and logs no console errors.
