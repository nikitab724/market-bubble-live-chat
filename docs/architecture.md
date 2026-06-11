# Architecture

## Runtime Surfaces

- `/` serves the Vite/React shell rooted at `src/ui/main.jsx`. It renders one selected stream embed, combined viewer count, platform/source breakdown, and combined chat, then mounts the existing live runtime through `src/app.mjs`. A centered social pill (X, Instagram, TikTok, YouTube, and Spotify podcast links for the Market Bubble accounts) floats over the top edge of the stream player on the viewer surface only. The viewer surface wraps everything in a rounded, bordered `.site-shell` panel inset 12px from the viewport (marketbubble.com-style); `/chat/` keeps a transparent pass-through shell.
- `/chat/` serves the same React shell in chat-only mode for OBS/browser-source embedding.
- `/admin/` serves the source editor. It manages profile rows and platform accounts, and chooses exactly one source for the stream view. Each platform row is lean — enabled checkbox, handle, an optional chat label (the display name shown on chat rows and source chips), Show stream — plus a live status line: a dot and plain-English text such as "Live · 4,321 watching", "Save to connect", "Connected, waiting for chat…", or "Needs Twitch credentials on the server". The page reuses the public `/api/chat-events` SSE stream and polls `/api/live-state` (15s, plus immediately after load/save); status precedence lives in `admin/status-model.mjs`, and a provider that definitively reports the stream offline outranks chat activity and connector chatter — the row reads "Offline" even while an offline channel's chat stays busy. Typing a handle into an empty row auto-checks Enabled, and handle inputs accept pasted profile URLs or `@names` (collapsed to the handle on save).
- `extension/` is a Chrome extension for X Live chat capture. It is loaded manually as an unpacked extension.

## Server

`server.mjs` owns the HTTP server. It serves Vite-built static assets from `dist/client` first, falls back to the explicit source allowlist for tests/local inspection, and provides these API routes:

- `GET /api/public-config`: enabled source config for browsers and the X extension popup, plus `configVersion` for live config refresh.
- `GET /api/live-state`: live state/viewer count aggregation — Twitch and Kick via their HTTP APIs, X via the chat connector's in-memory occupancy gated by the broadcast's live state (an ended broadcast reports `isLive: false` with zero viewers; no extra polling).
- `GET /api/twitch-vod?channel=...`: latest Twitch VOD lookup (used by the offline player states).
- `GET /api/twitch-emotes?channel=...`: Twitch third-party emote cache.
- `GET /api/twitch-badges?channel=...`: Twitch global/channel chat badge image cache.
- `GET /api/x-profile?handle=...`: guest-token X profile lookup (display name, verified mark, bio, follower count, avatar) cached server-side for 15 minutes; failures return `{ profile: null }`.
- `GET /api/admin/x-ingest-token`: returns the X bridge ingest token; requires a valid admin session.
- `GET /api/chat-events`: database-backed replaying server-sent events stream for normalized chat and connector status events.
- `POST /api/x-chat`: X extension chat ingest, ignored for any X source that has a `broadcastId` (owned by the server-side connector) so messages are not delivered twice. A named `sourceHandle` must match a configured X source (404 otherwise); an empty handle falls back to the first X source. Requires the bridge ingest token (`Authorization: Bearer` or `X-MB-Ingest-Token`) when `ADMIN_PASSWORD_HASH` is set.
- `POST /api/x-broadcast`: X extension reports the current live broadcast id, which the server writes to the matching enabled X source so the server-side X chat connector attaches without a manual paste. Requires the bridge ingest token when `ADMIN_PASSWORD_HASH` is set.
- `POST /api/webhooks/kick`: Kick webhook chat ingest with signature verification; events are matched to a Kick source by `broadcasterUserId` then slug, and events for unconfigured broadcasters (stale app subscriptions) are acknowledged and dropped.
- `POST /api/dev/kick-chat`: local development injector outside production.
- `POST /api/admin/password`: changes the admin password (requires a valid session plus the current password; sets the initial password when none is configured). The new hash is persisted to `admin-password.json` next to `sources.json`, all other sessions are invalidated, and the caller gets a fresh session cookie.
- `DELETE /api/admin/chat-events`: empties the stored chat event log so the replay window starts fresh (admin session required when a password is set). Event ids stay monotonic across a clear, so reconnecting browsers with a pre-clear `Last-Event-ID` miss nothing sent afterwards. Triggered from the admin page's "Clear chat history" panel.
- `/api/admin/*`: admin login/logout and source config reads/writes.

API request bodies are capped at 1 MB, and X chat ingest truncates author/handle to 120 characters and message bodies to 2000 characters before broadcast.

## Admin Auth & X Bridge Ingest

`src/admin-auth.mjs` owns the auth primitives. Passwords are hashed with PBKDF2-HMAC-SHA256 (600,000 iterations, per-hash random salt, iteration count embedded in the stored string so older hashes keep verifying) and verified in constant time. Sessions are random 256-bit tokens in a `__Host-`-prefixed (or `mb_admin` on localhost), `HttpOnly`, `SameSite=Strict`, `Secure` cookie with a sliding 12-hour TTL, held server-side in memory. Login is rate-limited per client by `createLoginThrottle` (default 8 failed attempts → 15-minute lockout; the gate is checked before the PBKDF2 verification, so lockout also blocks correct passwords during the window). A successful login clears the client's failure count.

The active password hash is resolved at startup as: `admin-password.json` (written by the admin UI's Change password panel, stored next to `sources.json`) → `ADMIN_PASSWORD_HASH` env → unset (open admin). The file outranks the env seed so a password changed at runtime survives restarts and redeploys — in production the data directory is the persistent Docker mount. `POST /api/admin/password` reuses the login throttle, requires the current password while one is set (a stolen session cookie alone cannot rotate the password), enforces a 12-character minimum, and rotates the derived X bridge ingest token as a side effect.

The X bridge cannot send the admin cookie (the extension runs cross-origin), so `/api/x-chat` and `/api/x-broadcast` authenticate with a bearer **ingest token** instead. The token is derived as `HMAC-SHA256(ADMIN_PASSWORD_HASH, "mb-x-ingest-v1")`: stable across restarts, rotating whenever the password changes, never stored separately, and only obtainable by someone who can already log in. The admin editor fetches it from `GET /api/admin/x-ingest-token` (session-gated) and shows it in a reveal/copy panel; the operator pastes it into the extension popup, which stores it in `chrome.storage` (never in code) and sends it as `Authorization: Bearer`. When `ADMIN_PASSWORD_HASH` is unset (local dev), both the admin routes and the ingest routes stay open so the bridge works without setup.

## Source Config

`src/source-config.mjs` normalizes source data. Supported platforms are `twitch`, `kick`, `x`, and `room`.

Important fields:

- `profileId` and `profileName`: optional grouping fields used by admin profiles.
- `platform`: provider key.
- `sourceName`, `sourceLabel`, `sourceHandle`, `sourceUrl`: display and provider identity.
- `broadcasterUserId`: Kick broadcaster id resolved from the Kick handle during admin save, used for event subscription setup.
- `broadcastId`: X (Periscope) live broadcast id used by the server-side X chat connector; accepts a bare id or `/i/broadcasts/<id>` URL and is kept server-side only.
- `conversationId`: X post/conversation id used for the X stream embed widgets.

The admin editor exposes none of these id fields. They ride along from the last loaded server state through saves (`admin/admin.mjs` merges them back in `collectSocialSource`), so saving the form never wipes a resolved broadcaster id, captured broadcast id, or conversation id. The chat label is editable per row and saves as `sourceLabel`/`sourceName`; a blank label falls back to the profile name.
- `enabled`: controls whether a source appears in public config.
- `showStream`: marks the one source used by the hosted stream player.

The server strips editable `viewerCount` values from admin writes. Viewer counts are live provider data when available. The viewer renders combined and per-source count changes with lightweight exponential catch-up after the initial paint, moving quickly across large gaps and easing into the target with plain tabular text; reduced-motion clients snap directly to the latest value. Source chips show a profile-aware status dot: if any source in the same profile is live the profile's Twitch/Kick chips show green; otherwise checked-but-offline provider sources show gray. Hovering a chip opens the profile popover; when the profile has a connected X account, the popover leads with a live X identity card — avatar, display name with verified mark, @handle, bio, compact follower count, and a Follow pill — fetched once per page load from `GET /api/x-profile` and linking to the X profile. At narrow viewports the full layout keeps the chips on a single row inside the fixed-height topbar (shrinking to fit under 860px, scrolling sideways at readable width under 500px): the topbar paints above the stream panel, so stacked chip rows would spill over it and block the floating social pill's clicks.

## Chat Flow

Twitch, Kick, and X chat arrive at the backend and are broadcast to browsers through `/api/chat-events`. Twitch uses the server-managed connector pool in `src/twitch-chat-service.mjs`, which starts one IRC-over-WebSocket connection per enabled Twitch source. X uses the parallel server-managed pool in `src/x-chat-service.mjs`, which opens one Periscope broadcast-chat websocket per enabled X source that has a broadcast id (handshake in `src/x-api.mjs`); X sources without a broadcast id continue to arrive through the Chrome extension ingest route. Kick continues to arrive through the webhook ingest route.

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

Chat rows show the platform as a centered colored logo, with the specific stream/source label directly beneath that logo. The written platform badge is intentionally omitted from each row to keep the username line compact while still showing source identity. Provider chat badges render inline before the author: Twitch badges use cached Helix badge images when available, and Kick badges fall back to compact text chips from webhook identity metadata. Emotes render on both Twitch and Kick rows: Twitch native IRC emotes by position, Kick native `[emote:id:name]` tokens as Kick CDN images, and 7TV/BetterTTV/FrankerFaceZ emotes by token — a Kick source reuses its profile-mate Twitch channel's third-party emote map when the profile has one and otherwise falls back to the global sets. Each message renders Twitch-style as `author: message`, using provider username colors when available and a deterministic fallback color otherwise. Message timestamps are kept out of the visible row. Individual chat rows are borderless with subdued alternating backgrounds so the feed reads less like stacked boxes. Chat source filters sit behind a compact `Sources n/n` button above the feed: it opens a popover with one ON/OFF row per enabled source, and toggling a source hides or restores that source's rows in the visible chat window without dropping messages from memory or disconnecting provider ingest. The hidden-source set persists in `localStorage` and can be preset with a `?hide=<sourceId,sourceId>` URL parameter, which takes precedence and is how OBS/browser-source embeds of `/chat/` choose sources without a pointer.

The browser keeps all received messages in memory for correctness, but only renders the latest message window to the DOM for performance. Rendered rows additionally use `content-visibility: auto` so offscreen rows in that window skip style/layout/paint work; a row lifts containment while it is hovered or shows a pinned profile card so the fixed-position card and badge tooltips are not clipped. Panel entrance animations must not retain a fill transform, because a retained transform would turn the stream/chat panels into containing blocks that push the fixed profile cards off screen. They are also load-only: the surface sets `data-entered` after the intro (or on the first layout toggle), which disables the entrance animations so mini/full layout toggles travel through the view transition without re-fading the panels. Beyond the three panel groups (`mb-topbar`, `mb-stream`, `mb-chat`), the brand mark, viewer counter, source breakdown, and layout toggle carry their own `view-transition-name`s (`mb-brand`, `mb-count`, `mb-sources`, `mb-toggle`) so they travel element-by-element between full and mini layouts instead of crossfading inside the panel morphs. Chat scrolling follows the common live-chat threshold pattern: within 120px of the bottom, incoming messages keep the view pinned to live; farther away, the message DOM freezes so the viewer can read older messages without jitter. Hover/profile inspection only freezes rendering while the viewer is away from live; hovering the newest rows still allows append-only rendering and bottom follow, so a cursor already resting over the feed at page load cannot block the initial replay from rendering. Clicking a chat message pins that profile card until an outside click or jump-to-live clears it, and pinned profiles pause live following so the row does not move while inspected. While a profile is pinned, ordinary hover cards are suppressed so only the pinned profile card can be visible. Profile hover cards are fixed overlays so they cannot increase chat feed scroll height when shown near the newest message, and they reserve space above a visible jump-to-live button. The chat feed does not use native vertical wheel/touch scrolling; wheel and touch gestures are canceled, then `scrollTop` is manually clamped between the first and last message so the feed cannot rubber-band past the newest row. The jump-to-live action clears profile inspection, renders the pending message window once, and scrolls back to the newest row.

## Browser Runtime Modules

`src/ui/main.jsx` is the React entry for the viewer/chat shell. It renders stable DOM ids consumed by the live runtime: `streamPlayer`, `chatFilters`, `chatFeed`, `jumpToLive`, `viewerCount`, and `sourceBreakdown`.

Reusable shadcn-style React primitives live under `components/ui/`, with shared helpers in `lib/`. The Vite and TypeScript configs both map `@/` to the repository root so registry components can import paths such as `@/components/ui/count-animation`, `@/components/ui/theme-toggle`, and `@/lib/utils`. Tailwind v4 enters through `src/ui/tailwind.css`, which imports the app stylesheet.

`src/app.mjs` exports `mountLiveApp()` and remains the browser runtime orchestrator after React has mounted. Focused modules own the heavy pieces:

- `src/client-sources.mjs`: static fallback source config for offline/dev loading.
- `src/viewer-stream.mjs`: Twitch, Kick, X, and placeholder stream rendering, plus stream presence — `updateStreamPresence` keeps the player on live/VOD content and toggles the bottom-center footer countdown when the selected source is offline.
- `src/broadcast-schedule.mjs`: next Thursday 13:00 America/Los_Angeles target (DST-safe) and countdown part math for the offline panel.
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

Provider embed errors are viewer-side, not app or config bugs (all verified 2026-06-11 against a live channel). Kick's "This embed seems to be misconfigured" is the player's generic error screen — any playback bootstrap failure lands there:

- **Cloudflare bot/load protection on Kick's API — intermittent for everyone.** `player.kick.com` fetches `kick.com/api/v2/channels/<slug>/playback-url`; a blocked client gets the response without `Access-Control-Allow-Origin` (curl gets 403 "Request blocked by security policy"), the fetch dies as a CORS error ("Playback URL not found"), and the error screen shows. Measured 2026-06-11 against the live `eslcs` channel: 3 of 6 brand-new clean browser sessions got the error while the others played, so refresh-roulette ("works after a couple refreshes, breaks again later") is Kick-side scoring, not the viewer or this app. Mid-session breaks happen when the player renews its signed playback URL and that renewal gets blocked. Risk factors that worsen the odds: spoofed UAs (DevTools device presets claim Android over a desktop fingerprint), referrer-stripping, rapid reloads. Operator mitigations: flip Show stream to the Twitch source when Kick flaps (the page switches live), test mobile layout with Responsive dimensions (no device preset), clear kick.com cookies / load kick.com once if a specific session seems stuck.
- **Both providers need the `Referer` header.** A browser that strips referrers (privacy extensions, aggressive shields) gets Kick's error / Twitch's "Whoops! This embed is misconfigured." on every stream; the identical URL plays with a normal referrer.
- **Kick also needs the `allow="autoplay; fullscreen"` delegation** the app sets on its iframe; wrapping the whole site in a plain iframe/webview that does not delegate those permissions reproduces the same Kick error.

## Live Config Refresh

Open viewer pages follow admin saves without a reload. `GET /api/public-config` carries a `configVersion` (a short hash of the public projection, so server-only fields like broadcast ids never bump it), and a successful `PUT /api/admin/sources` broadcasts a `config {version}` event on `/api/chat-events`. `src/app.mjs` listens for it, re-fetches the public config when the version is new, and applies it in place: source chips and filters rebuild, per-source caches prune (removed sources) or warm (new or re-pointed handles/profiles), live-state overlay fields survive the merge, and the player re-renders only when the *selected stream identity* changed (`getStreamSelectionKey` in `src/viewer-stream.mjs`) — label edits never reload a healthy embed. Config events persist and replay like chat, and the version check makes replays no-ops, so reconnecting tabs cannot miss a change. Removed sources keep their already-rendered messages (messages carry their own labels); their connections are torn down server-side by the save itself.

## Offline State

After every `/api/live-state` refresh, `src/app.mjs` calls `updateStreamPresence`. When the selected stream source is a Twitch/Kick source that the provider definitively reports offline (`isLive === false`), the player keeps showing content instead of a takeover panel: for Twitch it fetches `GET /api/twitch-vod?channel=...` (the shared latest-VOD endpoint) and embeds that VOD with `autoplay=false`, falling back to the normal channel embed when there is no VOD or the lookup fails; Kick keeps its channel embed. At the same time a compact countdown appears bottom-center in the `.surface-corners` footer slot (`#offlineCountdown`): a pulsing amber-dot "Offline · Back Thursday 1PM PST" label over a large tabular clock (`2d 18:35:01`, days hidden under 24h) targeting the next Thursday 13:00 Pacific. Each clock digit is its own span that rolls in (`countdown-digit-roll`) when it changes, and the colons breathe. In the full layout, `.live-layout-full .site-shell:has(.corner-countdown:not([hidden])) .app-shell` widens the bottom padding to 104px so the visible countdown sits in its own strip and never overlays the stream/VOD panel. When the provider reports live again, the live embed remounts and the countdown slot hides. The swap only happens on mode changes, so polling never reloads a healthy iframe, and unknown liveness (X, room, provider errors, missing credentials) keeps the embed with no countdown.
