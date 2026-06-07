# Architecture

## Runtime Surfaces

- `/` serves `index.html` and the browser runtime rooted at `src/app.mjs`. It is the hosted viewer page with one selected stream embed, combined viewer count, platform/source breakdown, and combined chat.
- `/chat/` serves `chat/index.html` with the same browser runtime in chat-only mode for OBS/browser-source embedding.
- `/admin/` serves the source editor. It manages profile rows and platform accounts, and chooses exactly one source for the stream view.
- `extension/` is a Chrome extension for X Live chat capture. It is loaded manually as an unpacked extension.

## Server

`server.mjs` owns the HTTP server. It serves static assets from an explicit allowlist and provides these API routes:

- `GET /api/public-config`: enabled source config for browsers and the X extension popup.
- `GET /api/live-state`: Twitch and Kick live state/viewer count aggregation.
- `GET /api/twitch-emotes?channel=...`: Twitch third-party emote cache.
- `GET /api/chat-events`: server-sent events stream for backend-originated messages.
- `POST /api/x-chat`: X extension chat ingest.
- `POST /api/webhooks/kick`: Kick webhook chat ingest with signature verification.
- `POST /api/dev/kick-chat`: local development injector outside production.
- `/api/admin/*`: admin login/logout and source config reads/writes.

## Source Config

`src/source-config.mjs` normalizes source data. Supported platforms are `twitch`, `kick`, `x`, and `room`.

Important fields:

- `profileId` and `profileName`: optional grouping fields used by admin profiles.
- `platform`: provider key.
- `sourceName`, `sourceLabel`, `sourceHandle`, `sourceUrl`: display and provider identity.
- `conversationId`: X post/broadcast/conversation id used for X embed and future API rules.
- `enabled`: controls whether a source appears in public config.
- `showStream`: marks the one source used by the hosted stream player.

The server strips editable `viewerCount` values from admin writes. Viewer counts are live provider data when available.

## Chat Flow

Twitch chat connects from the browser through `src/twitch-connector.mjs`. Kick and X chat arrive at the backend and are broadcast to browsers through `/api/chat-events`.

Every chat message is normalized into the shared chat shape before rendering:

- platform/source identity
- author display name
- normalized handle
- message body
- timestamp
- profile URL/source URL

The browser keeps all received messages in memory for correctness, but only renders the latest message window to the DOM for performance. Chat scrolling follows the common live-chat threshold pattern: within 120px of the bottom, incoming messages keep the view pinned to live; farther away, the message DOM freezes so the viewer can read older messages without jitter. Hover/profile inspection only freezes rendering while the viewer is away from live; hovering the newest rows still allows append-only rendering and bottom follow. Profile hover cards are fixed overlays so they cannot increase chat feed scroll height when shown near the newest message, and they reserve space above a visible jump-to-live button. The chat feed does not use native vertical wheel/touch scrolling; wheel and touch gestures are canceled, then `scrollTop` is manually clamped between the first and last message so the feed cannot rubber-band past the newest row. The jump-to-live action clears profile inspection, renders the pending message window once, and scrolls back to the newest row.

## Browser Runtime Modules

`src/app.mjs` is the browser orchestrator. Focused modules own the heavy pieces:

- `src/client-sources.mjs`: static fallback source config for offline/dev loading.
- `src/viewer-stream.mjs`: Twitch, Kick, X, and placeholder stream rendering.
- `src/chat-runtime.mjs`: public config loading, Twitch chat startup, backend SSE, Twitch emote fetches, and live-state refresh.
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
