# Admin Connection Status + Viewer Design Pass — Design

Date: 2026-06-10
Status: approved by operator in chat (decisions quoted below), implemented same day.

Amendment (same day): the operator asked that the countdown not cover the player ("can i bypass the timer thing overlayed over the stream? want to show vods"). Section C's takeover panel was replaced by: offline player shows the latest Twitch VOD (shared `GET /api/twitch-vod`) or the channel embed, and a compact countdown sits bottom-center in the footer. `docs/architecture.md` is the current reference.

## Goals

1. Make "am I connected?" obvious in `/admin/`: one status dot + plain-English line per platform source, updating live.
2. Make connecting a source one action: type the handle. No alternate paths, no cryptic ids.
3. Give `/` a real offline state with a beautiful countdown to the next show (Thursday 1PM PST), a rounded inset site shell, and element-level travel on the layout (fullscreen) toggle.

Operator decisions driving scope:
- "to connect twitch just type the handle, same for kick, and then for twitter just need to type the handle as well (plus maybe instruct on how to use the extension?)"
- "Remove all unnecessary shit keep only the minimum required"
- "dont need that much guidance but like only the minimum required stuff"
- Countdown + inset shell + element-level travel: "do this yes as well"

## Non-goals

- No new backend endpoints. Admin reuses public `/api/chat-events` (SSE) and `/api/live-state`.
- No `?` popovers or long help text. The only guidance is a single status line per row.
- No change to chat delivery, connectors, or the extension protocol.

## A. Admin editor: handle-only rows

Each platform row keeps exactly: enabled checkbox, handle input, "Show stream" checkbox, status line. Removed inputs: Display label, Conversation id, Broadcast id, Broadcaster user id.

- Hidden fields (`sourceLabel`, `conversationId`, `broadcastId`, `broadcasterUserId`, `sourceId`) are preserved from loaded server state through saves; they are no longer editable in the UI. Kick broadcaster ids resolve on save (existing), X broadcast ids arrive from the extension auto-capture (existing `/api/x-broadcast`).
- Handle inputs are paste-tolerant: a full `twitch.tv/...`, `kick.com/...`, or `x.com/...` URL (or `@name`) collapses to the handle on save.
- The X row's status line doubles as the only extension instruction when no broadcast id is known yet ("Open your X live stream in Chrome with the extension to connect chat").

## B. Admin live status

`admin/admin.mjs` opens the same `/api/chat-events` EventSource the viewer uses and polls `/api/live-state` (15s, plus immediately after load and save).

State tracked per `sourceId`: last chat timestamp (from event payload timestamps, so replayed history does not look fresh), connector status (`chat-status` events: twitch + x), live-state entry (isLive, viewerCount), provider status (twitch/kick `not_configured` / `error`).

Status precedence per row (pure function in `admin/status-model.mjs`):
1. unsaved edits → "Save to connect" (amber)
2. no handle → "Not connected" (muted)
3. disabled → "Off" (muted)
4. provider not configured → "Needs Twitch/Kick credentials" (warn)
5. live → "Live · 4,321 watching" (green, pulsing)
6. chat seen in last 2 min → "Chat active" (green)
7. connector connected → "Chat connected, waiting for messages…" (green)
8. connector connecting/disconnected → "Connecting…" / "Reconnecting…" (amber/warn)
9. X without broadcast id → extension hint (muted)
10. otherwise → "Offline" (muted)

Status rendering only touches status nodes — it never rebuilds rows, so typing is never clobbered.

## C. Viewer offline state + countdown

- New `src/broadcast-schedule.mjs`: `getNextBroadcastTime(now)` returns the next Thursday 13:00 America/Los_Angeles (DST-safe), `getCountdownParts(target, now)` returns days/hours/minutes/seconds.
- `src/viewer-stream.mjs` gains `updateStreamPresence({document, window, sources})`: when the selected stream source is a twitch/kick source that live-state has definitively reported offline (`isLive === false` after a real provider response), the player area swaps to an offline panel — eyebrow "Offline", serif "Back Thursday · 1PM PST", large tabular-numeral countdown ticking every second. When the source reports live again, the embed remounts. Unknown liveness (X, room, provider errors) keeps the embed.
- `src/app.mjs` calls `updateStreamPresence` after every live-state refresh.

## D. Site shell + element-level travel

- `ViewerApp.jsx` wraps header/main/footer in one `.site-shell` div. On the viewer surface the shell is a rounded, bordered, inset panel (page background visible around it, marketbubble.com-style). `/chat/` keeps a pass-through transparent shell for OBS.
- Height plumbing moves from `100vh`-math to shell-relative: `.site-shell` is a grid (topbar row + content row); `.app-shell`/`.chat-shell` fill the remaining row.
- Element-level travel: `view-transition-name` on `.brand-mark`, `.viewer-counter`, `.source-breakdown`, and `.layout-toggle` so they travel independently between full and mini layouts instead of crossfading inside the panel morphs.

## Testing

- `tests/admin-profile-model.test.mjs`: handle URL/@ extraction, sourceId + hidden-field preservation.
- `tests/admin-status-model.test.mjs` (new): status precedence table.
- `tests/broadcast-schedule.test.mjs` (new): next-Thursday math incl. DST and Thursday-afternoon rollover.
- `tests/chat-interaction-contract.test.mjs`: shell geometry assertions updated for the inset shell; new assertions for element-level view-transition names.
- Manual: `npm run build && node server.mjs`, walk `/`, `/chat/`, `/admin/`.
