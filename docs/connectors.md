# Connectors

## Twitch

Twitch has three pieces:

- Video embed: browser iframe in `src/app.mjs`.
- Chat: server-side IRC-over-WebSocket managed by `src/twitch-chat-service.mjs`, using `src/twitch-connector.mjs` as the low-level connector.
- Live state/viewer count: server-side Helix calls in `src/twitch-api.mjs`.

Required env vars for live state:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

Twitch native IRC emotes, username colors, and per-message badge ids come from IRC tags. Third-party emotes are fetched through `GET /api/twitch-emotes?channel=...` and cached from 7TV, BetterTTV, and FrankerFaceZ. Badge images are fetched through `GET /api/twitch-badges?channel=...`, which combines Twitch global and channel badge sets from Helix.

The server starts or stops one Twitch chat connection per enabled Twitch source when source config is loaded or saved. Normalized Twitch messages, Twitch chat connection status, Kick chat, and X chat all write to the SQLite chat event log, then fan out through `/api/chat-events`. The stored log gives new browser connections and reconnects a bounded replay window that survives server restarts.

## Kick

Kick has three pieces:

- Video embed: browser iframe in `src/app.mjs`.
- Live state/viewer count: server-side Kick API calls in `src/kick-api.mjs`.
- Chat: signed webhooks into `POST /api/webhooks/kick`, normalized by `src/kick-webhook.mjs`.
- Admin setup: when `/api/admin/sources` saves Kick rows, the backend resolves each Kick handle through the Kick Channels API, persists `broadcasterUserId`, and ensures a `chat.message.sent` webhook subscription exists for each Kick broadcaster. Existing configs with saved broadcaster IDs are also checked once when the public app loads config or live state.

Required env vars for live state:

- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

The Kick app must have webhooks enabled with a public URL pointed at `/api/webhooks/kick`; localhost cannot receive real Kick webhooks without a tunnel. The same app credentials must be allowed to manage event subscriptions so admin saves can create missing chat subscriptions.

Kick chat username colors come from `sender.identity.username_color` when Kick includes identity data. Kick chat badges come from `sender.identity.badges` and render as compact text chips because the webhook payload includes badge type/text/count, not image URLs. Missing or invalid colors fall back to the shared deterministic chat palette.

Operators should type only the Kick handle in admin. The read-only broadcaster user id field is filled after save when `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` can resolve the channel.

Kick source chips use `/api/live-state` `isLive` data for their live/offline status dot when the provider check succeeds. The dot is profile-aware: it is green when any source in the same profile is live, and orange when no profile source is live but Kick is connected and the Kick channel is offline.

## X

The current working path is a Chrome extension bridge, not an official X API connector:

- `extension/content.js` watches X live page DOM mutations.
- `extension/popup.js` lets the operator choose which configured X source the current tab belongs to.
- The extension popup stores the backend base URL used for public config and X chat ingest.
- The extension posts normalized messages to `POST /api/x-chat`.
- The backend broadcasts those messages through the replaying `/api/chat-events` stream.

X stream viewing on `/` uses `conversationId` from source config to load X widgets. Without `conversationId`, it falls back to an open-stream link.

X chat messages do not currently include provider username colors in the bridge, so the shared deterministic fallback palette is used.

The future server-side path is X API filtered stream or recent search using a `conversation_id:<id>` rule, if the X Live comments being targeted are exposed as Posts/replies. That would need X API credentials, rate-limit handling, reconnect logic, and a new backend connector.

## Native MarketBubble.com Room

The `room` platform is a source boundary for future first-party chat on `marketbubble.com`. It currently behaves as a configured chat/source identity, not a live external connector.

## Viewer Counts

Viewer counts are not an admin-editable product feature. They should come from live provider APIs when credentials and provider access are configured. If a provider is unavailable, the client keeps the existing configured/fallback value rather than overwriting with fake data.
