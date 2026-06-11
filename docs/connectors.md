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
- Admin setup: when `/api/admin/sources` saves Kick rows, the backend resolves each Kick handle through the Kick Channels API, persists `broadcasterUserId`, and ensures a `chat.message.sent` webhook subscription exists for each Kick broadcaster. Existing configs with saved broadcaster IDs are also checked once when the public app loads config or live state. A save that drops a Kick source also deletes that broadcaster's chat webhook subscription — only the broadcasters the save removes, so a save never tears down subscriptions it did not manage.

Required env vars for live state:

- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

The Kick app must have webhooks enabled with a public URL pointed at `/api/webhooks/kick`; localhost cannot receive real Kick webhooks without a tunnel. The same app credentials must be allowed to manage event subscriptions so admin saves can create and delete chat subscriptions.

Incoming chat webhooks are matched to a configured Kick source by resolved `broadcasterUserId` first, then channel slug. The slug can differ from the operator-typed handle (kick.com/fazebanks saved as `banks`), and the app can hold stale subscriptions for channels that are no longer configured — an event that matches no source is acknowledged with 204 and dropped, never attributed to another source.

Kick chat username colors come from `sender.identity.username_color` when Kick includes identity data. Kick chat badges come from `sender.identity.badges` and render as compact text chips because the webhook payload includes badge type/text/count, not image URLs. Missing or invalid colors fall back to the shared deterministic chat palette.

Kick native emotes arrive inline as `[emote:id:name]` tokens. `src/kick-webhook.mjs` keeps the emote name in the body and records positioned emote entries pointing at the Kick emote CDN (`files.kick.com/emotes/<id>/fullsize`), so they render as images exactly like Twitch native emotes. Kick rows also get 7TV/BetterTTV/FrankerFaceZ token emotes through the shared `GET /api/twitch-emotes` cache: the browser loads a Kick source's map from its profile-mate Twitch channel when the profile has one (same streamer, same emote culture) and otherwise from the source's own handle, which effectively resolves to the global sets.

Operators type only the Kick handle in admin. The resolved broadcaster user id is kept server-side state — the admin editor no longer shows it; the row's status line reports the connection instead.

Kick source chips use `/api/live-state` `isLive` data for their live/offline status dot when the provider check succeeds. The dot is profile-aware: it is green when any source in the same profile is live, and gray when no profile source is live but Kick is connected and the Kick channel is offline.

## X

X has two chat paths. The preferred path is a server-side connector; the Chrome extension bridge remains as a fallback.

### Server-side broadcast chat (preferred)

`src/x-chat-service.mjs` manages one connection per enabled X source that resolves to a broadcast id, mirroring the Twitch chat service and fanning normalized messages and `connecting`/`connected`/`disconnected` status into the same `/api/chat-events` stream. `src/x-api.mjs` does the access handshake.

The connector is also the X live-state provider: occupancy control frames on the chat socket (`{room, occupancy, total_participants}`) are tracked in memory and merged into `GET /api/live-state` for each X source, so the admin status line shows "Live · N watching" and viewer counts include X — no extra HTTP polling and no writes to the chat event log. Liveness is gated by the broadcast state from the handshake: a running broadcast reports `isLive: true` with the occupancy as `viewerCount`, while an ended broadcast id reports `isLive: false` with zero viewers and the connector never joins its replay chat room (replay rooms keep occupancy, which would dress an ended show up as live). A broadcast that ends mid-connection corrects itself on the next reconnect's fresh handshake. Periscope frames mix epoch scales (seconds/ms/µs/ns) per field, so chat timestamps are normalized by magnitude to wall-clock milliseconds; without that, admin chat freshness ("Chat active") and viewer ordering break.

X Live chat is **not** tweet replies; it runs on the legacy Periscope chat service. The connector reaches it through the same guest-token handshake the public web player uses — no login and no paid X API:

1. `POST api.x.com/1.1/guest/activate.json` → guest token.
2. `GET x.com/i/api/1.1/broadcasts/show.json?ids=<broadcastId>` → `media_key`.
3. `GET x.com/i/api/1.1/live_video_stream/status/<media_key>` → `chatToken`.
4. `POST proxsee-cf.pscp.tv/api/v2/accessChatPublic` → chat websocket endpoint + access token.
5. Connect the `chatapi/v1/chatnow` websocket, authenticate (frame kind 3), join the room (frame kind 2), and receive chat frames (kind 1). The connector reconnects with a fresh handshake on disconnect.

Setup: the operator only types the X handle in `/admin/`. The broadcast id arrives automatically: when the Chrome extension is on the broadcaster's own `x.com/i/broadcasts/<id>` page and a source is selected, `extension/content.js` reads the id from the URL and POSTs it to `POST /api/x-broadcast`, which writes it to the matching enabled X source and re-syncs the connector. X mints a new id each time the account goes live, so this keeps the connector pointed at the current broadcast without a manual step. The endpoint only updates `broadcastId` on an existing enabled X source matched by handle. The admin X row's status line shows "Go live, then open your X live page in Chrome with the extension" until a broadcast id is known. (There is no manual broadcast id field anymore; a saved `broadcastId` survives admin saves untouched — unless the save changes that source's handle, in which case the id belongs to the previous account's broadcast, so the save drops it and the connector disconnects until the new handle's id is captured. `data/sources.json` can still be hand-edited in an emergency.)

The broadcast id is stored server-side only, like Kick's `broadcasterUserId`, and never appears in public config. A numeric post id in `conversationId` is an X post id, not a broadcast id, and is ignored for chat. No env vars or credentials are required. Confirm chat is enabled on the broadcast (X has a per-broadcast chat permission setting).

Once a source has a broadcast id it is owned by the server-side connector, so `POST /api/x-chat` ingest from the extension DOM bridge is ignored for that source. This keeps a source on exactly one chat path and prevents the same message arriving twice (once from the connector, once from the bridge).

The same guest-token path powers `GET /api/x-profile?handle=...`: a `UserByScreenName` GraphQL lookup (pinned query id + feature flags from the logged-out web client) that returns the display name, verified mark, bio, follower count, and avatar for the viewer's profile popover X identity card. Results are cached server-side for 15 minutes and any failure returns `{ profile: null }`, which simply hides the card.

Caveats: these are unofficial endpoints (the same ones x.com's web player calls), so they can change without notice, and read-only access is a ToS gray area. Every failure is treated as a soft `disconnected` status with reconnect, never a crash.

### Chrome extension bridge (fallback)

For X sources without a broadcast id (or when the handshake is unavailable):

- `extension/content.js` watches X live page DOM mutations.
- `extension/popup.js` lets the operator choose which configured X source the current tab belongs to.
- The extension popup stores the backend base URL used for public config and X chat ingest.
- The extension posts normalized messages to `POST /api/x-chat`.
- A post that names a `sourceHandle` must match a configured X source; otherwise it is rejected with 404, so a bridge still watching a previous account after an admin handle change cannot leak that stream's chat into another source. A post without a handle falls back to the first X source.
- The backend broadcasts those messages through the replaying `/api/chat-events` stream.

X stream viewing on `/` uses `conversationId` from source config to load X widgets. Without `conversationId`, it falls back to an open-stream link.

X chat messages do not currently include provider username colors, so the shared deterministic fallback palette is used.

## Native MarketBubble.com Room

The `room` platform is a source boundary for future first-party chat on `marketbubble.com`. It currently behaves as a configured chat/source identity, not a live external connector. It is not part of the admin profile editor: profiles only manage Twitch/Kick/X, so an admin save writes only those platforms and drops any stored room sources. `src/source-config.mjs` still normalizes the platform and the default seed includes a room source.

## Viewer Counts

Viewer counts are not an admin-editable product feature. They should come from live provider APIs when credentials and provider access are configured. If a provider is unavailable, the client keeps the existing configured/fallback value rather than overwriting with fake data.
