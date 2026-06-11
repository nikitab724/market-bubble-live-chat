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

## [2026-06-08] fix | Restore fullscreen layout toggle hover

- Changed the stream layout toggle hover state so hovering the fullscreen stream border applies the same bright corner color and light background as direct button hover.
- Extended the layout interaction contract to require the visible hover treatment on stream hover, direct hover, and keyboard focus.
- Verification: `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "layout"`; `npm test` (90 passed); `npm run build`.

## [2026-06-08] fix | Durable backend chat delivery

- Added replayable SSE event ids, heartbeat comments, startup replay, and `Last-Event-ID` reconnect replay for `/api/chat-events`.
- Moved Twitch chat fan-in to a server-managed connector service so Twitch, Kick, and X chat use the same backend SSE delivery path, with backend Twitch status events consumed by the current and legacy browser runtimes.
- Documented the new chat flow and linked the durable ingest plan.
- Verification: red/green `node --test tests/chat-events.test.mjs`; red/green `node --test tests/twitch-chat-service.test.mjs`; red/green `node --test tests/server-contract.test.mjs --test-name-pattern "syncs server-side Twitch"`; red/green `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "listens for backend chat events"`; `npm test` (95 passed); `npm run build`.

## [2026-06-08] db | Persist chat event replay in SQLite

- Added an embedded SQLite chat event store at `data/chat-events.sqlite` by default, with optional `CHAT_DB_PATH`, `CHAT_RETENTION_DAYS`, and `CHAT_REPLAY_LIMIT` settings.
- Wired `/api/chat-events` to persist events before broadcasting and to use database row ids as SSE event ids, so replay survives server restarts while keeping setup to a single container and persistent `data/` mount.
- Added Docker build dependencies for the stable `better-sqlite3` package, ignored generated SQLite sidecar files, and documented setup/retention tradeoffs.
- Verification: red/green `node --test tests/chat-event-store.test.mjs`; red/green `node --test tests/chat-events.test.mjs --test-name-pattern "hub restart"`; red/green `node --test tests/server-contract.test.mjs --test-name-pattern "configured event store"`; `node --test tests/chat-event-store.test.mjs tests/chat-events.test.mjs tests/server-contract.test.mjs` (15 passed); `npm test` (101 passed); `npm run build`.

## [2026-06-08] ui | Add per-source chat filters

- Added a compact ON/OFF filter bar above chat with one button per enabled source/platform.
- Filtering hides or restores rows by `sourceId` in the rendered chat window while keeping full message history and provider ingest intact.
- Added the requested shadcn-style `ThemeToggle` component and `lucide-react` dependency without replacing the existing count-animation demo.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "chat filter"`; red/green `node --test tests/theme-toggle-component.test.mjs`; `node --check src/app.mjs src/chat-renderer.mjs`; `npx tsc --noEmit`; `npm test` (104 passed); `npm run build`; in-app browser smoke on `/?demoChat=1&layout=full` toggled the Twitch/Xtwin filter off and back on, hiding/restoring its rows with no console errors.

## [2026-06-08] db | Limit chat event retention to two hours

- Changed the SQLite chat event retention default from 7 days to 2 hours through `CHAT_RETENTION_HOURS`.
- Kept `CHAT_RETENTION_DAYS` as a compatibility fallback when hours are unset, and pruned old rows when the store opens, before replay queries, and after writes.
- Verification: red/green `node --test tests/chat-event-store.test.mjs`; red/green `node --test tests/server-contract.test.mjs --test-name-pattern "two-hour chat retention"`; `node --test tests/chat-event-store.test.mjs tests/server-contract.test.mjs` (12 passed); `npm test` (106 passed); `npm run build`; `git diff --check`.

## [2026-06-08] ui | Show Kick live status dots

- Added Kick to the source-chip live status dot path, using Kick `/api/live-state` `isLive` data when available.
- Kept Twitch source dots on the server-side chat connector status path.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "live status|Kick live-state"`; `npm test` (108 passed); `npm run build`; `git diff --check`.

## [2026-06-08] ui | Keep offline Kick status orange

- Adjusted Kick source-chip status so `isLive: true` is green, while a connected Kick provider with an offline channel is orange instead of red.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "Kick live-state"`; `npm test` (108 passed); `npm run build`; `git diff --check`.

## [2026-06-09] ui | Make source status dots profile-aware

- Changed source-chip status so a live source in a profile makes the profile's Twitch/Kick status dots green, even when another provider source in that same profile is offline.
- Kept the orange offline state for checked provider sources only when no source in that profile is live.
- Verification: red/green `node --test tests/chat-interaction-contract.test.mjs --test-name-pattern "profile live-state"`; `npm test` (109 passed); `npm run build`; `git diff --check`.

## [2026-06-10] docs | Mirror AGENTS instructions for Claude

- Added sibling `CLAUDE.md` files for each existing `AGENTS.md`, with byte-identical content in every matching directory.
- Verification: byte-compare loop confirmed every `CLAUDE.md` matched its sibling `AGENTS.md`.

## [2026-06-10] perf | Fix off-screen profile cards and cut viewer animation cost

- Fixed the main-viewer profile hover/pin cards rendering off screen: the `panel-expand-in` entrance animation retained a `forwards` fill transform on the stream/chat panels, which made them containing blocks for the fixed-position cards. Entrances now end at `transform: none` with a `backwards` fill.
- Removed the topbar `backdrop-filter` blur (continuous GPU cost over live video), removed `blur()` from the shell entrance keyframes, and stopped transitioning geometric properties (width/height/padding) that re-layout every frame and fight the layout-toggle view transition.
- Added `content-visibility: auto` to chat rows so offscreen rows in the 500-row window skip rendering, with containment lifted on hovered/pinned rows so overlays are not clipped; cached the shared `Intl.NumberFormat` used by per-frame viewer-count animation renders.
- Hardened the server: API request bodies are capped at 1 MB, and X chat ingest truncates author/handle/body lengths before broadcast.
- Verification: `npm test` (111 passed, including two new contract tests for the containing-block and content-visibility rules); `npm run build`; browser smoke on `/?demoChat=1` and `/chat/?demoChat=1` confirmed on-screen hover/pinned profile cards, working layout toggle and jump-to-live, 500 rendered rows with `content-visibility: auto`, and no app console errors.

## [2026-06-10] ui | Keep layout toggles from re-fading the stream and chat panels

- Made the `panel-expand-in`/`shell-calm-in` entrance animations load-only: the viewer surface sets `data-entered` after the intro (or on first toggle), and entered surfaces drop the entrance animations so mini/full layout toggles travel without fading out/in. The fade happened because re-adding `.live-layout-full` restarted the entrances from `opacity: 0`, which also blanked the view transition's new-state snapshot.
- Verification: `npm test` (112 passed, including a new entrance-once contract test); `npm run build`; browser smoke sampled stream/chat opacity across both toggle directions at ~130 frames each and it never dropped below 1, while the load entrance still plays before `data-entered` flips.

## [2026-06-10] ui | Move chat source filters into a sources popover

- Replaced the always-visible row of per-source filter pills above chat with a compact `Sources n/n` button that opens a popover of ON/OFF rows, freeing the top of the narrow chat column and scaling past five sources.
- Hidden sources persist in `localStorage` and can be preset with `?hide=<sourceId,...>`, which takes precedence for OBS/browser-source embeds; outside clicks and Escape close the popover, and the count turns amber when any source is muted.
- Fixed a popover self-close bug found during verification: the open-click re-rendered the container, detaching the event target, so the document-level close handler now ignores disconnected targets.
- Verification: `npm test` (113 passed with the rewritten filter contract and a new persistence contract); `npm run build`; browser smoke on `/?demoChat=1` confirmed open/toggle/persist/`?hide=`/outside-click/Escape behavior and per-source row hiding.

## [2026-06-10] ui | Textless filter switches and intrinsic-size fallback

- Removed the On/Off text from the chat filter switches; the knob position and platform color carry the state, with the row title/aria-pressed keeping it accessible.
- Added a plain-length `contain-intrinsic-size` fallback before the `auto` form so browsers that do not parse the auto keyword never collapse skipped chat rows to zero height.
- Verification: `npm test` (113 passed); `npm run build`; browser smoke confirmed empty switch text and the popover renders cleanly.

## [2026-06-10] ui | Calm Firefox animations

- Firefox now skips the view-transition layout morph (instant switch) and drops the per-row chat fade plus blurred corner-text entrances through a Gecko-only `@supports (-moz-appearance: none)` block, because Windows Gecko re-rasterizes animating text with grayscale anti-aliasing and its new view-transition morph drops frames over live video.
- Verification: `npm test` (114 passed including the new Gecko contract test); `npm run build`.

## [2026-06-10] connector | Add server-side X (Periscope) broadcast chat

- Added `src/x-api.mjs` (guest-token handshake: `guest/activate` -> `broadcasts/show` -> `live_video_stream/status` -> `accessChatPublic`, plus chat-frame normalization into the shared shape) and `src/x-chat-service.mjs` (one Periscope `chatnow` websocket per enabled X source with a broadcast id, fanning messages/status into the SSE hub, reconnecting with a fresh handshake). The Chrome extension bridge stays as a fallback for sources without a broadcast id.
- Added a server-side-only `broadcastId` field to X source normalization (bare id or `/i/broadcasts/<id>` URL; numeric post ids in `conversationId` are ignored), wired both connectors through a single `syncChatConnectorSources` in `server.mjs`, and stopped the X service on server close.
- Documented the path in `connectors.md`/`architecture.md` including unofficial-endpoint and ToS caveats.
- Verification: `node --test tests/x-api.test.mjs tests/x-chat-service.test.mjs tests/source-config.test.mjs` (red/green, 22 new assertions covering the handshake with mocked fetch, message normalization, the websocket pool with a fake socket, reconnect, and `broadcastId` normalization); `npm test` (130 passed); `npm run build`; server boot smoke served `/`, `/api/public-config`, `/api/live-state` without crashing; a real-network probe confirmed `guest/activate` returns a live guest token (200) and `broadcasts/show` accepts the bearer (400 on a deliberately bogus id, not 401/403). The full chat chain past the handshake is unit-tested but was not exercised against a live broadcast.

## [2026-06-10] connector | Harden X chat parsing against real frame structure

- Verified the X connector handshake against a real live broadcast (id 1yKAPPboWlDxb): guest-token -> show -> live status -> accessChatPublic all succeed, the `chatnow` websocket opens and subscribes, and frames are received. Real frames turned out to be an envelope (`kind` 2) wrapping a nested `{kind, sender, body}` whose deepest body is repeatedly JSON-encoded; observed control frames were join (inner kind 1, body {room,following,unlimited}) and occupancy (inner kind 4, body {room,occupancy,total_participants}).
- Replaced the rigid outer-`kind===1` gate in `normalizeXBroadcastMessage` with a structural walk down the `body` chain that treats a frame as chat only when it has a non-empty leaf text body, collecting identity/uuid/timestamp across levels. This filters the real control frames regardless of envelope kind and accepts chat whether the outer kind is 1 or 2.
- Locked the behavior with real-captured join/occupancy fixtures (must filter) and a chat frame with outer kind 2 (must accept) in `tests/x-api.test.mjs`.
- Verification: `npm test` (132 passed); `npm run build`; 30s live capture against the real broadcast classified its control frame correctly (0 false chat, no crash). A rendered chat line was not captured because the broadcast was silent during the window; the chat-text path is covered by unit fixtures.

## [2026-06-10] admin | Add X broadcast id field for server-side chat

- Added a "Broadcast id (chat)" text field to the X row in the admin profile editor so operators can paste a broadcast id or `/i/broadcasts/<id>` URL without hand-editing `data/sources.json`. Threaded `broadcastId` through `admin/profile-model.mjs` (build/collect/empty slots) and widened the X social row grid to six columns.
- Verification: `npm test` (133 passed, including a new profile-model round-trip test); `npm run build`; browser smoke on `/admin/` confirmed the field renders with its placeholder; a real PUT saved a `/i/broadcasts/<id>` URL, the server normalized it to the bare id, persisted it to disk, kept it out of `/api/public-config`, and synced the X connector on save with no errors.

## [2026-06-10] connector | Auto-capture X broadcast id from the extension

- Added `POST /api/x-broadcast`: the Chrome extension reports the broadcast id from the broadcaster's own `x.com/i/broadcasts/<id>` page (read from the URL in `extension/content.js`, deduped, sent on attach and source selection), and the server writes it to the matching enabled X source and re-syncs the X chat connector. This removes the per-stream manual paste since X mints a new broadcast id each time the account goes live.
- The endpoint is a bounded sibling to `/api/x-chat`: unauthenticated like the existing extension bridge, but it can only set `broadcastId` on an existing enabled X source matched by handle (no source creation or other edits), validates the id strictly, is idempotent, and never leaks the id to public config.
- Documented in `x-live-setup.md`, `connectors.md`, and `architecture.md`.
- Verification: `npm test` (134 passed, including a new server-contract test covering set/persist/sync, idempotency, unknown handle 404, and invalid id 400); `node --check extension/content.js`; live server smoke posted a `/i/broadcasts/<id>` URL, saw it normalized to the bare id, persisted server-side only, and logged `[x-broadcast] x-banks -> 1yKAPPboWlDxb` with the connector re-synced.

## [2026-06-10] fix | Stop duplicate X chat from connector + extension bridge

- Fixed X chat messages arriving twice when both the server-side connector and the extension DOM bridge were active for the same source. `POST /api/x-chat` now ignores ingest for any X source that has a `broadcastId`, since that source is owned by the server-side connector — one source, one chat path.
- Verification: `npm test` (135 passed, including a new server-contract test that delivers a DOM-bridge post before a broadcast id is set and drops it after); live SSE smoke confirmed one delivery before the id and zero additional deliveries after.

## [2026-06-10] feature | Admin live status, handle-only rows, offline countdown, inset shell

- Admin `/admin/` now shows a live status line per platform row (dot + plain English: "Live · 4,321 watching", "Save to connect", "Connected, waiting for chat…", "Needs Twitch credentials on the server", X extension hint). Zero new endpoints: the page opens the public `/api/chat-events` SSE stream (chat timestamps + connector `chat-status` per sourceId) and polls `/api/live-state` every 15s plus immediately after load/save. Status precedence is a pure function in `admin/status-model.mjs`.
- Admin rows are handle-only: removed Display label, Conversation id, Broadcast id, and Broadcaster user id inputs. Hidden fields ride along from loaded state through saves (`collectSocialSource` merge), so saves never wipe resolved/captured ids or labels. Handle inputs are paste-tolerant (full `twitch.tv/...`/`kick.com/...`/`x.com/...` URLs and `@names` collapse to the handle; non-profile URLs like `/i/broadcasts/...` collapse to empty), and typing a handle into an empty row auto-enables it.
- Viewer `/` got a real offline state: when live-state definitively reports the selected Twitch/Kick stream source offline, the player swaps to a countdown panel ("Back Thursday · 1PM PST", big tabular numerals, days auto-hidden under 24h) targeting the next Thursday 13:00 America/Los_Angeles via the new DST-safe `src/broadcast-schedule.mjs`; it swaps back to the embed when the source goes live, without reloading healthy iframes on polls.
- Viewer `/` is now wrapped in a rounded inset `.site-shell` (12px frame, 22px radius, 1px border) on the viewer surface only; `/chat/` keeps a transparent pass-through shell for OBS. Shell heights moved from `100vh` math to flex fill. The brand mark, viewer counter, source breakdown, and layout toggle carry their own view-transition names (`mb-brand`/`mb-count`/`mb-sources`/`mb-toggle`) for element-level travel on the full/mini toggle.
- Touched: `admin/admin.mjs`, `admin/profile-model.mjs`, `admin/status-model.mjs` (new), `src/broadcast-schedule.mjs` (new), `src/viewer-stream.mjs`, `src/app.mjs`, `src/ui/ViewerApp.jsx`, `styles.css`, tests, docs (`architecture.md`, `connectors.md`, `x-live-setup.md`, `testing.md`), spec `docs/superpowers/specs/2026-06-10-admin-status-and-offline-countdown-design.md`.
- Verification: `npm test` (158 passed; new `admin-status-model` + `broadcast-schedule` suites incl. DST cases; updated shell/admin contract assertions); `npm run build`; live server walkthrough on :4179 confirmed green "Live · N watching" rows for a live channel, "Save to connect" on edit with auto-enable, save round-trip preserving `conversationId` with no input field, the offline countdown rendering/ticking for an offline showStream source in both layouts, the offline→live swap on the next poll, and `/chat/` unchanged (transparent, full-height). Known pre-existing quirk (not from this change, verified against the previous build): chat rows stay unrendered if the page loads with the cursor resting over the feed until the cursor moves.

## [2026-06-10] fix | Render chat while hovered at live (parked-cursor blank feed)

- Fixed `/` and `/chat/` rendering zero chat rows when the page loads with the cursor already resting over the feed: Chromium dispatches synthetic pointerover as replayed rows appear under a stationary cursor, `state.inspectingProfile` flips on, and `render()` in `src/chat-renderer.mjs` returned early before ever checking follow state — so the first replay batch (and everything after) stayed pending until the cursor moved off the feed or jump-to-live was clicked. This closes the "known pre-existing quirk" noted in the previous entry.
- `render()` now freezes the chat DOM only for a pinned profile card or when the viewer is away from live (`shouldPauseChatRender`); hover no longer blocks rendering while pinned to live, matching the documented contract in `docs/architecture.md`.
- Touched: `src/chat-renderer.mjs`, `tests/chat-interaction-contract.test.mjs` (new `createChatRenderer` behavioral harness + two regression tests; two textual contract assertions updated off the old unconditional freeze), `docs/architecture.md`.
- Verification: the new test "renders the initial replayed chat while the pointer rests over a live feed" failed before the fix and passes after; `npm test` 159/160 pass (the 1 failure is the in-flight VOD/offline-countdown contract test from the concurrent 2026-06-10 admin work, unrelated to this change); Playwright on the built app at :4178 with the cursor parked at (400,400) before load: 426 replay rows rendered, live rows kept appending while a row was genuinely hovered with jump-to-live hidden, scrolling away while hovered froze the feed with jump-to-live shown, and clicking jump-to-live restored following.

## [2026-06-10] change | Offline countdown moves to bottom-center; player shows VODs

- Operator follow-up to the same-day offline state: the countdown no longer covers the player. When the selected Twitch/Kick source is offline, the player now keeps content — Twitch fetches the latest VOD through the shared `GET /api/twitch-vod` endpoint (added by the v2 work; reused, not modified) and embeds it with `autoplay=false`, falling back to the channel embed when no VOD exists; Kick keeps its channel embed.
- The clock became a compact bottom-center footer element: a `#offlineCountdown` slot in the `.surface-corners` footer (amber-dot "Offline · Back Thursday 1PM PST" label over a 30px tabular `2d 19:38:07` clock, days hidden under 24h). The runtime fills/hides it on presence changes; the `.stream-offline` takeover panel and its styles were removed.
- Touched: `src/viewer-stream.mjs` (presence split: `renderEmbedContent`, `renderOfflinePresence`, `swapToLatestVod`, `renderCornerCountdown`), `src/ui/ViewerApp.jsx` (footer slot), `styles.css`, `tests/chat-interaction-contract.test.mjs` (offline contract rewritten), `docs/architecture.md`, spec amendment note.
- Verification: `npm test` (160 passed, including the concurrent parked-cursor chat fix that landed in this tree); `npm run build`; live walkthrough with an offline showStream channel confirmed the VOD embed in the player, the centered footer countdown ticking in full and mini layouts, the countdown hiding and live embed mounting on the next poll after the source went live, and `/chat/` unaffected.

## [2026-06-10] fix | X admin status freshness + live viewers from chat occupancy

- X rows in `/admin/` could sit on "Connected, waiting for chat…" while chat flowed, and never showed live viewers. Two causes addressed:
  - Periscope chat frames mix epoch scales per field (seconds/ms/µs/ns); the old clamp only divided once, so nanosecond stamps landed in year ~55k and second stamps in 1970 — either pinning "Chat active" on forever or never letting it fire. `resolveTimestampMs` now normalizes any magnitude to wall-clock ms (`normalizeEpochMs`), and the admin additionally clamps chat freshness to arrival time so future-skewed stamps can't stick.
  - `/api/live-state` only aggregated Twitch and Kick. The X connector now doubles as the X live-state provider: occupancy control frames (`{room, occupancy, total_participants}`, real fixture) are parsed by the new `extractBroadcastOccupancy` in `src/x-api.mjs`, tracked in memory per connection in `src/x-chat-service.mjs`, and exposed through `getLiveState()` which the server merges into `/api/live-state`. Admin X rows now show "Live · N watching" and viewer counts include X — with zero new endpoints and no chat-event-log noise (occupancy is never broadcast).
- Touched: `src/x-api.mjs` (shared frame walk, occupancy extraction, epoch normalization), `src/x-chat-service.mjs` (entry source/socketOpen/occupancy state + `getLiveState`), `server.mjs` (live-state aggregation includes the X service), `admin/admin.mjs` (freshness clamp), `docs/connectors.md`, `docs/architecture.md` (also documented the previously undocumented `/api/twitch-vod` route from the v2 work).
- Verification: `npm test` (166 passed; new failing-first tests for ns/seconds timestamp scales, occupancy extraction from the real captured frame, service live-state incl. no_sources/connecting/connected and no hub spam, and a server-contract merge test); `npm run build`; live smoke on :4179 confirmed `/api/live-state` now carries `x: {status: "no_sources"}` for a config without a captured broadcast id (a stale pre-change server process was found holding the port and killed — env-prefixed pkill patterns don't match argv).

## [2026-06-10] design | Countdown gets its own bottom strip + rolling digits; X chips get live dots

- Full layout: the offline countdown was overlaying the bottom edge of the stream/VOD panel (the corners strip reserved 56px, the clock needed ~63px). A `.live-layout-full .site-shell:has(.corner-countdown:not([hidden])) .app-shell` rule now widens the bottom padding to 104px while the countdown is visible, so it sits in its own strip — verified 24px of clear gap below the panel, and mini layout unchanged.
- Countdown polish: clock is larger (clamp 32–42px), each digit is its own span rolling in via `countdown-digit-roll` on change (seconds tick visibly), colons breathe, and the amber Offline dot pulses. Named distinctly from the removed viewer-count `digit-roll` keyframes the contract pins as deleted.
- Viewer source chips: `shouldRenderSourceStatusDot` now includes `x`, and `getSourceStatus` treats a live-state-locked X source like Kick (green when `isLive`, orange when offline) — X liveness comes from the connector occupancy added earlier today, so the green live bubble now appears for live X streams.
- Touched: `src/chat-renderer.mjs`, `src/viewer-stream.mjs`, `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/architecture.md`.
- Verification: `npm test` (167 passed; failing-first contract updates for the X dot, X chip status, the `:has` bottom reserve, and digit-roll markup/keyframes); `npm run build`; live walkthrough with an offline showStream source confirmed VOD + countdown in separate strips in full layout (gap 24px), digits rolling each second, mini layout clear (gap 116px).

## [2026-06-10] fix+feature | Truthful offline statuses, admin chat labels, Kick emotes

- X liveness no longer lies after a show ends: `src/x-chat-service.mjs` keeps the handshake's broadcast state, never joins an ended broadcast's replay chat room (replay rooms keep occupancy, which previously surfaced replay watchers as a live stream), and reports such sources as `isLive: false` with zero viewers so source chips lock orange and totals exclude replay occupancy. A broadcast that ends mid-connection corrects on the next reconnect handshake. `admin/status-model.mjs` now ranks a definitive provider offline above "Chat active"/"Connected, waiting" so an offline channel with busy chat reads "Offline" instead of green.
- Admin rows regained an editable per-source chat label ("Chat label" input, saved through the existing `label → sourceLabel` path; blank falls back to the profile name). Label edits participate in the "Save to connect" dirty check, and the row grid gained a column.
- Kick chat now renders emotes: `src/kick-webhook.mjs` converts `[emote:id:name]` tokens into positioned emote entries on the Kick emote CDN instead of stripping them to text; `src/emote-renderer.mjs` treats Kick like Twitch (native ranges + third-party tokens); `src/chat-runtime.mjs` loads 7TV/BTTV/FFZ maps for Kick sources too, borrowing the profile-mate Twitch channel's map when one exists and falling back to the source's own handle (global sets) otherwise.
- Touched: `src/x-chat-service.mjs`, `admin/status-model.mjs`, `admin/admin.mjs`, `styles.css`, `src/kick-webhook.mjs`, `src/emote-renderer.mjs`, `src/chat-runtime.mjs`, `src/app.mjs`, tests (`x-chat-service`, `admin-status-model`, `kick-webhook`, `emote-renderer`, new `chat-runtime`, contract), docs (`architecture.md`, `connectors.md`).
- Verification: TDD red→green per area; `npm test` 173/173; `npm run build`; dev-server SSE check confirming injected Kick `[emote:…]` content arrives with positioned `emotes` entries.

## [2026-06-10] feature+polish | X identity hover cards, admin header redesign

- The viewer's source-chip popover now leads with a live X identity card when the profile has a connected X account: avatar, display name with verified mark, @handle, bio, compact follower count, and a Follow pill linking to the X profile. Data comes from a new `GET /api/x-profile?handle=` route in `server.mjs` backed by `getUserProfile` in `src/x-api.mjs` — the same guest-token handshake as X chat, hitting the logged-out web client's `UserByScreenName` GraphQL lookup (pinned query id + feature flags, verified working live), cached server-side 15 minutes, soft-failing to `{ profile: null }` so the popover just skips the card. The browser loads profiles once per page load (`loadXProfiles` in `src/chat-runtime.mjs`, `state.xProfiles`).
- Redesigned the admin header: dedicated `admin-brand` treatment (38px rounded logo + italic serif "Market Bubble") replaces the borrowed viewer `brand-mark`, which had no img sizing on `/admin/` and blew the 133px logo past its 36px row with the wordmark reveal mask over it. The heading column gets a hairline divider, tracked eyebrow, sentence-case italic serif "Profile Manager", and a staggered rise/blur entrance (`admin-header-rise`, reduced-motion safe).
- Touched: `src/x-api.mjs`, `server.mjs`, `src/chat-runtime.mjs`, `src/app.mjs`, `src/chat-renderer.mjs`, `styles.css`, `admin/index.html`, tests (`x-api`, `chat-runtime`, `server-contract`, contract), docs (`architecture.md`, `connectors.md`).
- Verification: TDD red→green; `npm test` 176/176; `npm run build`; live spike of the GraphQL lookup before building (Cloudflare blocks the legacy `users/show.json`, syndication endpoints are dead — only the GraphQL path works); preview screenshots of `/admin/` (desktop + narrow) and the Banks popover on `/` showing the real X card (2.7M followers) after a popover anchor specificity fix (`.source-popover a` uppercased the card).

## [2026-06-10] feature | Social pill over the stream player

- Added a centered, ghosted social pill floating over the top edge of the stream player on `/` (viewer surface only, so `/chat/` OBS embeds stay clean): X, Instagram, and TikTok inline-SVG icons linking to the Market Bubble accounts (`x.com/MarketBubble` verified live via the new profile lookup — 76K followers; `instagram.com/marketbubble` and `tiktok.com/@marketbubble` probe 200). First attempt centered it in the broadcast topbar, but the source-breakdown chips stretch across the full topbar width by design, so the pill moved into `.stream-view` as a blurred-backdrop overlay (matching the reference screenshot, which shows the player's top strip).
- Touched: `src/ui/ViewerApp.jsx`, `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/architecture.md`.
- Verification: contract asserts red→green; `npm test` 176/176; `npm run build`; preview geometry check (pill center X exactly equals stream panel center X, 11px below its top edge, 3 links).

## [2026-06-10] feature+security | Hardened admin auth, gated X bridge ingest, social pill Spotify + mini reposition

- Hardened the admin password block (`src/admin-auth.mjs`): PBKDF2-HMAC-SHA256 default bumped 210k→600k iterations (OWASP 2023; stored hashes keep their own iteration count so old hashes still verify), and added `createLoginThrottle` — per-client brute-force lockout (default 8 failures → 15-min lock, checked before the PBKDF2 verify so a locked client is refused even with the right password; success resets). Wired into `POST /api/admin/login` (429 + Retry-After when locked), keyed by `x-forwarded-for`/remoteAddress.
- Closed the open X ingest vector: `/api/x-chat` and `/api/x-broadcast` were anonymous POSTs (CORS *), letting anyone spoof chat or rewrite a source's broadcast id. They now require a bridge **ingest token** when `ADMIN_PASSWORD_HASH` is set — `HMAC-SHA256(passwordHash, "mb-x-ingest-v1")`, stable across restarts, rotates with the password, only obtainable behind the admin session via the new session-gated `GET /api/admin/x-ingest-token`. Local dev (no hash) stays open. The admin editor shows a reveal/copy "X Bridge token" panel; the extension popup gained a Bridge token field (`chrome.storage`, never in code) and `content.js` sends `Authorization: Bearer` on both ingest posts.
- Added `scripts/hash-admin-password.mjs` to mint `ADMIN_PASSWORD_HASH` (refuses <12 chars).
- Viewer social pill: added a Spotify podcast icon (4th link). NOTE: the real show URL is still unknown — `SPOTIFY_PODCAST_URL` in `src/ui/ViewerApp.jsx` is a placeholder (Spotify search for "Market Bubble") pending the exact URL; swap that one const. In mini layout the pill now sits in the gap above the floating player (`bottom: calc(100% + 12px)`) instead of overlapping the video.
- Touched: `src/admin-auth.mjs`, `server.mjs`, `admin/admin.mjs`, `admin/index.html`, `extension/{content.js,popup.js,popup.html}`, `src/ui/ViewerApp.jsx`, `styles.css`, `scripts/hash-admin-password.mjs` (new), tests (`admin-auth`, `server-contract`, contract), docs (`architecture.md`, `deployment.md`, `x-live-setup.md`).
- Verification: TDD red→green; `npm test` 182/182; `npm run build`; live HTTP walkthrough on :4188 with a real 600k-iteration hash — anonymous admin/x-chat/x-broadcast/ingest-token all 401, login mints a 64-hex token, token authorizes ingest, wrong token 401, 8 bad logins → 429 Retry-After 900 even with the correct password; preview confirmed 4 social icons in full layout and the pill centered above the panel in mini.

## [2026-06-10] fix | Real Spotify show URL + correct Instagram handle

- Replaced the `SPOTIFY_PODCAST_URL` placeholder with the real show (`open.spotify.com/show/00yWnJPE80LSBglGwCrjZI`, "The Dollar Is Going to Zero") and fixed the Instagram link to `instagram.com/themarketbubble`. Both verified resolving 200; updated the matching contract assertion. Supersedes the placeholder note in the prior entry.

## [2026-06-10] fix | Social pill was invisible in mini layout

- The mini reposition (`bottom: calc(100% + 12px)`) places the pill entirely above `.stream-view`'s top edge, but `.stream-view` is the pill's containing block and carries `overflow: hidden`, so the pill was clipped to nothing in mini. Full layout was unaffected (`top: 10px` sits inside the box). The prior entry's "preview confirmed … centered above the panel in mini" was a geometry-only check — `getBoundingClientRect` reports laid-out coordinates even when paint is clipped; `document.elementFromPoint` at the pill's center (or a screenshot) is the check that catches it.
- Fix: `.live-layout-mini .stream-view { overflow: visible }`. The video keeps its rounded clip from `.video-frame`'s own `overflow: hidden`; nothing else in the panel overflows.
- Touched: `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/wiki/log.md`.
- Verification: contract assert red→green; `npm test` 182/182; `npm run build`; preview in mini — `elementFromPoint` at the pill center returns the pill, gap above panel exactly 12px, centered, screenshot shows it floating over the gap; full layout re-checked (pill 11px inside the panel top, `overflow: hidden` restored).

## [2026-06-10] feature | YouTube link in the social pill

- Added a YouTube icon to the viewer social pill (`youtube.com/@MarketBubble`, probed 200), slotted between TikTok and the Spotify closer — 5 links total. Inline solid-fill SVG matching the existing icon style.
- Also caught up `docs/architecture.md`'s pill enumeration, which had drifted (still said "X, Instagram, TikTok"; Spotify was never added to it).
- Touched: `src/ui/ViewerApp.jsx`, `tests/chat-interaction-contract.test.mjs`, `docs/architecture.md`.
- Verification: contract assert red→green; `npm test` 182/182; `npm run build`; preview at 1440×900 full layout — 5 icons render, `elementFromPoint` hits every link, pill centered 11px below the panel top edge; screenshot confirms the YouTube glyph 4th in the row. Known pre-existing quirk (not from this change): at ~716px-wide viewports the topbar source chips overlap the pill's hit area in full layout.

## [2026-06-10] ui | Offline source-chip dot is gray, not orange

- `.live-dot.offline` on the viewer surface changed from orange `#f5a623` to gray `#555`, matching the base/`configured` dot and the admin page's muted offline tone. Applies to Twitch, Kick, and X chips alike — all three already resolve to the `offline` class via live-state `isLive: false` (`getProfileSourceStatus`/`getSourceStatus`). Supersedes the [2026-06-08] "Keep offline Kick status orange" entry. `connecting` stays orange and `disconnected` stays red.
- Touched: `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/architecture.md`, `docs/connectors.md`.
- Verification: contract assert red→green; `npm test` 184/184; `npm run build`; preview probe — computed background of an `offline` dot is `rgb(85, 85, 85)`, `connected` still `rgb(61, 220, 132)`.

## [2026-06-10] feature | Admin password set + change-password flow

- New `POST /api/admin/password`: requires a valid session plus the current password while one is set (a stolen session cookie alone cannot rotate the password, and the route shares the login brute-force throttle); sets the initial password when none is configured; enforces the 12-char minimum. On success it invalidates all other sessions, keeps the caller on a fresh cookie, and rotates the derived X bridge ingest token.
- The hash now resolves as `admin-password.json` (next to `sources.json`, written atomically with mode 600) → `ADMIN_PASSWORD_HASH` env → open. The file outranks the env seed so UI changes survive restarts/redeploys; in production it lives on the persistent data mount. A present-but-corrupt file fails startup loudly.
- Admin UI: "Change password" collapsible under the X Bridge token panel (current + new + Update); success re-fetches the displayed bridge token. Local password seeded via `data/admin-password.json` (gitignored).
- Touched: `server.mjs`, `admin/index.html`, `admin/admin.mjs`, `styles.css`, `.gitignore`, `tests/server-contract.test.mjs`, `data/AGENTS.md` (+`CLAUDE.md`), `README.md`, `docs/architecture.md`, `docs/deployment.md`.
- Verification: two contract tests red (405) → green (change flow incl. restart-with-stale-env-seed persistence; bootstrap-when-unset); `npm test` 184/184; `npm run build`; preview on 4178 — wrong login rejected, login works, wrong current password rejected with message, change → "Password updated." + token rotated + session kept, changed back, logout/login round-trip OK, no console errors.

## [2026-06-11] fix | Social pill unclickable at narrow widths in full layout

- Root cause, two stacked factors. (1) Overhang: the ≤860px/≤500px media queries wrapped source chips into 2-column/stacked grids while `.broadcast-topbar` keeps a fixed height (62px/94px) and `overflow: visible` — with 5 runtime chips the metrics grid ran ~148px past the header bottom, across the stream panel (at 375px: header bottom y≈107, `.viewer-counter` y 139–173 dead-center over the pill y 136–174). (2) Stacking: the topbar is `position: relative; z-index: 140` (needed so source-chip hover popovers overlay the panels), and the pill's `z-index: 30` is trapped inside `.stream-view`'s own stacking context (forced by `view-transition-name: mb-stream`, effective z 0 < 140) — so the spilled, mostly transparent chip/counter boxes also won every `elementFromPoint` hit over the pill. Desktop was safe only because one 5-column row fits the 52px header. Resolves the "known pre-existing quirk … at ~716px the topbar source chips overlap the pill's hit area" note in the [2026-06-10] YouTube entry.
- Fix is containment, scoped to `.live-layout-full .source-breakdown` so mini's intentional sidebar stack is untouched: ≤860px keeps chips on one shrinkable row (`grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)`); ≤500px keeps them readable at `minmax(96px, 1fr)` and lets the row scroll sideways (`overflow-x: auto` — the scroll container clips hover popovers there, which touch devices can't open anyway; five labeled chips cannot shrink into a ~216px track). The grouped `.source-breakdown, .chat-shell .source-breakdown` mobile overrides are gone; the chat surface falls back to its base single-row `repeat(5, minmax(0, 1fr))`, also contained.
- Touched: `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/architecture.md`, `docs/wiki/log.md`.
- Verification: contract asserts red→green; `npm test` 184/184; `npm run build`; preview on the rebuilt bundle — `elementFromPoint` at every pill link center returns the link at 375×812 and 716×812 (full) and at 1440×900 in both full and mini (layout toggled live); metrics boxes contained (375px: metrics bottom y=91 ≤ header bottom y=98); screenshots at 375px and 1440px show the one-row metrics inside the topbar and the video unobstructed. Mini's `overflow: visible` stream-view fix re-asserted green. Side note for future probes: `.site-shell` is a fixed-height column flexbox and the topbar (`flex-shrink: 1`, `min-height: auto`) can legitimately measure below its specified height — its content-based minimum, not a bug.

## [2026-06-11] fix | Mobile topbar brand cropped the wordmark to "Ma…" in full layout

- Root cause, two stacked factors. (1) Geometry: the brand SVG (`.brand-wordmark`, viewBox 360×64) has only an intrinsic aspect ratio, so at its base `height: 26px` it is ~146px wide — but the ≤860px/≤500px media queries still forced `.brand-mark` into a 34px/32px square, a leftover from the square-logo era (the admin header keeps one as `admin-brand-logo`). (2) The actual crop: `.brand-mark` carries the `wordmark-write` reveal `mask-image`, and masks clip painting to the border box by default, so the container's `overflow: visible` cannot save the overhanging SVG — only the first ~34px ("Ma…") painted. Desktop was fine (base `width: auto`); mini was fine (`.live-layout-mini .brand-mark { width/height: auto }` outranks the unscoped media rules on specificity).
- Treatment: the brand stays the full Playfair wordmark at every width — no invented compact monogram. The ≤860px square rule is deleted (the base 36px auto-width box fits the 62px bar), and ≤500px replaces its square with `.live-layout-full .brand-mark { height: 26px }` (scoped like the chip-row fix so mini stays untouched) — the box hugs the SVG so the brand row leaves the 94px topbar headroom for the metrics row below. Known tradeoff: in the 501–860px band the chips give up ~112px of row width to the wordmark and truncate labels harder — sanctioned by their `minmax(0, 1fr)` shrink design; one-row containment and pill clickability hold.
- Touched: `styles.css`, `tests/chat-interaction-contract.test.mjs`, `docs/wiki/log.md`.
- Verification: contract asserts red→green (`doesNotMatch` on a 34/32px `.brand-mark` width + the scoped 26px rule); `npm test` 184/184; `npm run build`; preview on the rebuilt bundle — 375×812: full "Market Bubble" paints on its own row (screenshot — paint, not just geometry, since the mask clips paint), SVG 146×26 inside the 26px brand row, metrics bottom y=85 ≤ topbar bottom y=92; 716×812: brand 146px and 5 chips share one contained row (labels truncate per the tradeoff above); 1440×900: full layout byte-identical base rules (36px box), and mini toggled live — sidebar wordmark intact. No console errors.

## [2026-06-11] ui | Remove MarketBubble.com row from admin profile editor

- Removed the `room` ("MarketBubble.com" / site chat slug) entry from `profilePlatforms` in `admin/profile-model.mjs`, so admin profiles now offer only Twitch/Kick/X rows and badges. Consequence: `buildProfilesFromSources` ignores stored room sources and `buildSourcesFromProfiles` never emits them, so an admin save drops room sources from the saved config.
- `src/source-config.mjs` is unchanged: `room` stays a supported platform, the default seed still includes a room source, and chat still renders room messages (viewer profile popovers already excluded room).
- Touched: `admin/profile-model.mjs`, `tests/admin-profile-model.test.mjs`, `docs/connectors.md`, `docs/wiki/log.md`.
- Verification: `node --test tests/admin-profile-model.test.mjs` (6 passed, slot keys now `["twitch","kick","x"]`); `node --test tests/*.test.mjs` (184 passed).

## [2026-06-11] connector | Disconnect the old X broadcast when an admin save changes the handle

- A handle change in `/admin/` now drops the source's extension-captured `broadcastId` (`dropStaleXBroadcastIds` in `server.mjs`, applied in `PUT /api/admin/sources` against the previously saved sources, matched by `sourceId`). The id identified the previous account's broadcast, so the re-sync disconnects the server-side X connector from that stream and the row returns to the "Go live..." prompt until the new handle's id is captured. Saves that keep the handle still ride the id along untouched.
- `POST /api/x-chat` no longer falls back to the first X source when the posted `sourceHandle` matches nothing — it returns 404, so an extension tab still watching the old account cannot leak that stream's chat into the new source. Posts without a handle keep the first-source fallback.
- Touched: `server.mjs`, `tests/server-contract.test.mjs`, `docs/connectors.md`, `docs/x-live-setup.md`, `docs/architecture.md`, `docs/wiki/log.md`.
- Verification: two new contract tests red→green (`drops the captured broadcast id when an admin save changes the X handle`, `rejects extension DOM-bridge chat when its handle no longer matches an X source`); `npm test` 186/186.

## [2026-06-11] connector | Stop foreign Kick chat from masquerading as the first Kick source

- Incident: the production feed flooded with another channel's chat labeled "kick banks". The Kick app held `chat.message.sent` subscriptions for previously configured broadcasters (xqc, nickwhite, kaneljoseph) — `ensureChatEventSubscriptions` never deletes — and xqc went live (~11k viewers); `findKickSource` attributed every unmatched webhook to `kickSources[0]`. Same bug family as the X first-source leak fixed in the entry above.
- Treatment: `src/kick-webhook.mjs` matches by resolved `broadcasterUserId` first (the slug can differ from the operator-typed handle: kick.com/fazebanks saved as "banks"), then slug, and returns null instead of the first-source/fabricated fallbacks; `POST /api/webhooks/kick` acks unmatched events with 204 without broadcasting (the dev injector returns 404). `PUT /api/admin/sources` now deletes chat subscriptions for the broadcasters the save drops (`removeChatEventSubscriptions` in `src/kick-api.mjs`) — only save-removed broadcasters, so one environment cannot tear down another's subscriptions on a shared Kick app; cleanup failure warns and never blocks the save.
- Ops: deleted the three stray subscriptions from the Kick app via API (kept fazebanks 81630 and ansem 110326750). The code fix needs a deploy to take effect on the Firecrawl server.
- Touched: `src/kick-webhook.mjs`, `src/kick-api.mjs`, `server.mjs`, `tests/kick-webhook.test.mjs`, `tests/kick-api.test.mjs`, `tests/server-contract.test.mjs`, `docs/connectors.md`, `docs/architecture.md`, `docs/wiki/log.md`.
- Verification: six new tests red→green (three webhook attribution units, one kick-api unsubscribe unit, two server contracts: unmatched-broadcaster drop and save-removal unsubscribe); `npm test` 192/192.
