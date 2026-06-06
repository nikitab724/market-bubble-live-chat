# Architecture

## Runtime Surfaces

- `/` serves `index.html` and `src/app.mjs`. It is the hosted viewer page with one selected stream embed, combined viewer count, platform/source breakdown, and combined chat.
- `/chat/` serves `chat/index.html` with the same app runtime in chat-only mode for OBS/browser-source embedding.
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

The browser keeps all received messages in memory for correctness, but only renders the latest message window to the DOM for performance. When the viewer scrolls up, new rendering pauses until they jump back to live.

## Stream Selection

The admin editor allows one `showStream` source. The viewer resolves the stream source in this order:

1. selected enabled `showStream` source
2. first Twitch source
3. first Kick source
4. first configured source

Twitch and Kick use iframe embeds. X uses the X widgets script when `conversationId` exists; otherwise the page shows an open-stream placeholder link.
