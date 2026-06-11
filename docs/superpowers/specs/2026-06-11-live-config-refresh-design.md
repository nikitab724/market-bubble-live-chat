# Live Config Refresh Design

Date: 2026-06-11
Status: approved (chat), implementing same run

## Problem

The main viewer page (`/`, React shell mounting `src/app.mjs`) fetches `/api/public-config` once at page load and never again. Admin saves — removing a connection, changing a handle/label, or moving "Show stream" to a different source — are invisible to every open viewer page until a manual refresh. The stream player additionally only re-renders when the selected source flips live↔offline (`updateStreamPresence` mode check), never when the *selected source itself* changes.

The admin page is not part of the problem: it already adopts the server's canonical sources from the save response, re-renders, and re-polls live state.

## Design

Push config changes to open pages over the existing SSE stream (`/api/chat-events`), versioned so replays and races are harmless.

### Server (`server.mjs`)

- Maintain a `configVersion`: a short content hash of `JSON.stringify(toPublicConfig(sources))`. Computing it from the public projection means admin-invisible fields (`broadcastId`, `broadcasterUserId`) do not bump it.
- `GET /api/public-config` includes `configVersion` in the response body.
- After a successful `PUT /api/admin/sources` (sources written, connectors synced), broadcast `config` `{ version }` on the chat hub. The hub persists and replays it like any event; version dedupe on the client makes replays no-ops. Saves are manual and rare, so the event-log volume is negligible.

### Viewer (`src/app.mjs`, `src/chat-runtime.mjs`, `src/viewer-stream.mjs`)

- `loadPublicConfig` also captures `configVersion` (additive change; return shape must stay compatible with all callers).
- `startBackendChatEvents` gains a `config` listener (additive optional callback).
- On a `config` event with a version different from the last applied one, the app re-fetches `/api/public-config` and applies it in place (`applySources`):
  - Replace `connectedSources`/`sourceById`; rebuild `state.sources`, preserving nothing stale — live overlay fields re-merge via the existing `refreshLiveState` immediately after.
  - Prune per-source state for removed sourceIds (`twitchStatuses`, `twitchBadges`, `twitchEmotes`); initialize `twitchStatuses` and kick off badge/emote/X-profile loads for added sources.
  - Re-render chat (chips, filters, viewer summary rebuild from `state.sources`).
  - Player: re-render only when the *selected stream* changed — compare `getSelectedStreamSource(prev)` vs `next` on identity fields (`sourceId`, `platform`, `sourceHandle`, `conversationId`, `showStream` selection). Unrelated edits never reload a healthy embed; a selection change re-inits the embed and the follow-up presence update restores offline mode if the new pick is offline.
- Removed sources: chip disappears; old messages stay (backend messages carry their own labels; the throwing `getSource` is demo-chat-only); new messages already stop server-side because saves tear down connectors today. Stale `disabledChatSourceIds` entries for removed ids are inert.

### Out of scope

- Admin page changes (already self-updating), v2 surface (off-limits), `/chat` page (no config-dependent UI beyond what chat messages carry).

## Testing

- Server contract: a save bumps `configVersion` in `/api/public-config` and broadcasts one `config` event with the new version; a no-op save (same content) keeps the version stable.
- Pure unit: selected-stream change detection (same selection → false; showStream moved/handle changed → true).
- Chat-runtime: `config` events invoke the new callback.
- Manual lab E2E (isolated server + Playwright): open `/`, flip Show stream in `/admin/`, player switches without refresh; remove a source, its chip disappears.

## Implementation plan

1. Failing server-contract test for version + config event on save → implement hash + broadcast → green.
2. Failing unit for stream-selection comparison in `viewer-stream.mjs` → implement → green.
3. Additive `chat-runtime.mjs` config listener + version capture, `app.mjs` `applySources` wiring.
4. `npm test`, `npm run build`, lab E2E, docs (`architecture.md`, wiki log), commit.
