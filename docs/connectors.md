# Connectors

## Twitch

Twitch has three pieces:

- Video embed: browser iframe in `src/app.mjs`.
- Chat: browser-side IRC-over-WebSocket in `src/twitch-connector.mjs`.
- Live state/viewer count: server-side Helix calls in `src/twitch-api.mjs`.

Required env vars for live state:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

Twitch native IRC emotes, username colors, and per-message badge ids come from IRC tags. Third-party emotes are fetched through `GET /api/twitch-emotes?channel=...` and cached from 7TV, BetterTTV, and FrankerFaceZ. Badge images are fetched through `GET /api/twitch-badges?channel=...`, which combines Twitch global and channel badge sets from Helix.

## Kick

Kick has three pieces:

- Video embed: browser iframe in `src/app.mjs`.
- Live state/viewer count: server-side Kick API calls in `src/kick-api.mjs`.
- Chat: signed webhooks into `POST /api/webhooks/kick`, normalized by `src/kick-webhook.mjs`.
- Admin setup: when `/api/admin/sources` saves Kick rows, the backend resolves each Kick handle through the Kick Channels API and persists `broadcasterUserId` for webhook event subscription setup.

Required env vars for live state:

- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

The Kick webhook URL must be public and reachable by Kick. Localhost cannot receive real Kick webhooks without a tunnel.

Kick chat username colors come from `sender.identity.username_color` when Kick includes identity data. Kick chat badges come from `sender.identity.badges` and render as compact text chips because the webhook payload includes badge type/text/count, not image URLs. Missing or invalid colors fall back to the shared deterministic chat palette.

Operators should type only the Kick handle in admin. The read-only broadcaster user id field is filled after save when `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` can resolve the channel.

## X

The current working path is a Chrome extension bridge, not an official X API connector:

- `extension/content.js` watches X live page DOM mutations.
- `extension/popup.js` lets the operator choose which configured X source the current tab belongs to.
- The extension popup stores the backend base URL used for public config and X chat ingest.
- The extension posts normalized messages to `POST /api/x-chat`.
- The backend broadcasts those messages through `/api/chat-events`.

X stream viewing on `/` uses `conversationId` from source config to load X widgets. Without `conversationId`, it falls back to an open-stream link.

X chat messages do not currently include provider username colors in the bridge, so the shared deterministic fallback palette is used.

The future server-side path is X API filtered stream or recent search using a `conversation_id:<id>` rule, if the X Live comments being targeted are exposed as Posts/replies. That would need X API credentials, rate-limit handling, reconnect logic, and a new backend connector.

## Native MarketBubble.com Room

The `room` platform is a source boundary for future first-party chat on `marketbubble.com`. It currently behaves as a configured chat/source identity, not a live external connector.

## Viewer Counts

Viewer counts are not an admin-editable product feature. They should come from live provider APIs when credentials and provider access are configured. If a provider is unavailable, the client keeps the existing configured/fallback value rather than overwriting with fake data.
