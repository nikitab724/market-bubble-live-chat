# Architecture

## Runtime Surfaces

- `/` serves the Vite/React shell rooted at `src/ui/main.jsx`. It renders one selected stream embed, combined viewer count, platform/source breakdown, and combined chat, then mounts the existing live runtime through `src/app.mjs`.
- `/chat/` serves the same React shell in chat-only mode for OBS/browser-source embedding.
- `/admin/` serves the source editor. It manages profile rows and platform accounts, and chooses exactly one source for the stream view.
- `extension/` is a Chrome extension for X Live chat capture. It is loaded manually as an unpacked extension.

## Server

`server.mjs` owns the HTTP server. It serves Vite-built static assets from `dist/client` first, falls back to the explicit source allowlist for tests/local inspection, and provides these API routes:

- `GET /api/public-config`: enabled source config for browsers and the X extension popup.
- `GET /api/live-state`: Twitch and Kick live state/viewer count aggregation.
- `GET /api/twitch-emotes?channel=...`: Twitch third-party emote cache.
- `GET /api/twitch-badges?channel=...`: Twitch global/channel chat badge image cache.
- `GET /api/chat-events`: database-backed replaying server-sent events stream for normalized chat and connector status events.
- `POST /api/x-chat`: X extension chat ingest.
- `POST /api/webhooks/kick`: Kick webhook chat ingest with signature verification.
- `POST /api/dev/kick-chat`: local development injector outside production.
- `/api/admin/*`: admin login/logout and source config reads/writes.

API request bodies are capped at 1 MB, and X chat ingest truncates author/handle to 120 characters and message bodies to 2000 characters before broadcast.

## Source Config

`src/source-config.mjs` normalizes source data. Supported platforms are `twitch`, `kick`, `x`, and `room`.

Important fields:

- `profileId` and `profileName`: optional grouping fields used by admin profiles.
- `platform`: provider key.
- `sourceName`, `sourceLabel`, `sourceHandle`, `sourceUrl`: display and provider identity.
- `broadcasterUserId`: Kick broadcaster id resolved from the Kick handle during admin save, used for event subscription setup.
- `conversationId`: X post/broadcast/conversation id used for X embed and future API rules.
- `enabled`: controls whether a source appears in public config.
- `showStream`: marks the one source used by the hosted stream player.

The server strips editable `viewerCount` values from admin writes. Viewer counts are live provider data when available. The viewer renders combined and per-source count changes with lightweight exponential catch-up after the initial paint, moving quickly across large gaps and easing into the target with plain tabular text; reduced-motion clients snap directly to the latest value. Source chips show a profile-aware status dot: if any source in the same profile is live the profile's Twitch/Kick chips show green; otherwise checked-but-offline provider sources show orange.

## Chat Flow

Twitch, Kick, and X chat arrive at the backend and are broadcast to browsers through `/api/chat-events`. Twitch uses the server-managed connector pool in `src/twitch-chat-service.mjs`, which starts one IRC-over-WebSocket connection per enabled Twitch source. Kick and X continue to arrive through webhook/extension ingest routes.

The SSE hub writes each broadcast to the SQLite chat event log before sending it to browsers. The SQLite row id becomes the SSE event id, so event ids and replay survive server restarts. New browser connections receive the current stored replay window, and reconnects with `Last-Event-ID` receive only events after that id. The stream also sends heartbeat comments so intermediaries are less likely to close an idle chat connection.

The default database path is `data/chat-events.sqlite`, which is inside the production persistent data mount. Operators can override it with `CHAT_DB_PATH`. Chat event retention defaults to 2 hours through `CHAT_RETENTION_HOURS`, with `CHAT_RETENTION_DAYS` kept as a compatibility fallback. Replay responses are capped by `CHAT_REPLAY_LIMIT`, which defaults to 1000 events.

Every chat message is normalized into the shared chat shape before rendering:

- platform/source identity
- author display name
- normalized handle
- author color
- chat badges when the provider sends them
- message body
- timestamp
- profile URL/source URL

Chat rows show the platform as a centered colored logo, with the specific stream/source label directly beneath that logo. The written platform badge is intentionally omitted from each row to keep the username line compact while still showing source identity. Provider chat badges render inline before the author: Twitch badges use cached Helix badge images when available, and Kick badges fall back to compact text chips from webhook identity metadata. Each message renders Twitch-style as `author: message`, using provider username colors when available and a deterministic fallback color otherwise. Message timestamps are kept out of the visible row. Individual chat rows are borderless with subdued alternating backgrounds so the feed reads less like stacked boxes. The chat panel renders one ON/OFF filter button per enabled source; toggling a source hides or restores that source's rows in the visible chat window without dropping messages from memory or disconnecting provider ingest.

The browser keeps all received messages in memory for correctness, but only renders the latest message window to the DOM for performance. Rendered rows additionally use `content-visibility: auto` so offscreen rows in that window skip style/layout/paint work; a row lifts containment while it is hovered or shows a pinned profile card so the fixed-position card and badge tooltips are not clipped. Panel entrance animations must not retain a fill transform, because a retained transform would turn the stream/chat panels into containing blocks that push the fixed profile cards off screen. Chat scrolling follows the common live-chat threshold pattern: within 120px of the bottom, incoming messages keep the view pinned to live; farther away, the message DOM freezes so the viewer can read older messages without jitter. Hover/profile inspection only freezes rendering while the viewer is away from live; hovering the newest rows still allows append-only rendering and bottom follow. Clicking a chat message pins that profile card until an outside click or jump-to-live clears it, and pinned profiles pause live following so the row does not move while inspected. While a profile is pinned, ordinary hover cards are suppressed so only the pinned profile card can be visible. Profile hover cards are fixed overlays so they cannot increase chat feed scroll height when shown near the newest message, and they reserve space above a visible jump-to-live button. The chat feed does not use native vertical wheel/touch scrolling; wheel and touch gestures are canceled, then `scrollTop` is manually clamped between the first and last message so the feed cannot rubber-band past the newest row. The jump-to-live action clears profile inspection, renders the pending message window once, and scrolls back to the newest row.

## Browser Runtime Modules

`src/ui/main.jsx` is the React entry for the viewer/chat shell. It renders stable DOM ids consumed by the live runtime: `streamPlayer`, `chatFilters`, `chatFeed`, `jumpToLive`, `viewerCount`, and `sourceBreakdown`.

Reusable shadcn-style React primitives live under `components/ui/`, with shared helpers in `lib/`. The Vite and TypeScript configs both map `@/` to the repository root so registry components can import paths such as `@/components/ui/count-animation`, `@/components/ui/theme-toggle`, and `@/lib/utils`. Tailwind v4 enters through `src/ui/tailwind.css`, which imports the app stylesheet.

`src/app.mjs` exports `mountLiveApp()` and remains the browser runtime orchestrator after React has mounted. Focused modules own the heavy pieces:

- `src/client-sources.mjs`: static fallback source config for offline/dev loading.
- `src/viewer-stream.mjs`: Twitch, Kick, X, and placeholder stream rendering.
- `src/chat-runtime.mjs`: public config loading, backend SSE chat/status ingest, Twitch emote/badge fetches, and live-state refresh.
- `src/chat-event-store.mjs`: SQLite and in-memory chat event stores used by the SSE hub.
- `src/twitch-chat-service.mjs`: server-side Twitch chat connector lifecycle and fan-in to the shared SSE hub.
- `src/chat-renderer.mjs`: viewer counts, source chips, chat DOM windowing, autoscroll, and profile hover cards.
- `src/demo-chat.mjs`: optional seeded/demo messages.
- `src/platforms.mjs`: platform labels, ordering, profile URLs, and shared escaping.

Demo chat is opt-in with `?demoChat=1` or `?demoChat=true`; production/default loads no fake chat messages.

## Stream Selection

The admin editor allows one `showStream` source. The viewer resolves the stream source in this order:

1. selected enabled `showStream` source
2. first Twitch source
3. first Kick source
4. first configured source

Twitch and Kick use iframe embeds. X uses the X widgets script when `conversationId` exists; otherwise the page shows an open-stream placeholder link.
