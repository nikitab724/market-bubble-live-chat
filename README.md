# Market Bubble Live

A server-backed prototype for the Market Bubble hosted stream and shared chat.

It simulates two surfaces powered by the same Twitch, Kick, X, and MarketBubble.com feed:

- `/` is the hosted viewer page with a stream view, combined viewer count, source breakdown, and combined chat.
- `/chat/` is the chat-only surface for OBS/browser-source overlay or embedding.
- `/admin/` is a password-protected source editor for stream/chat sources.

The demo treats each stream source separately, including Market Bubble on Twitch/Kick, Banks on X, Z on X, and the native MarketBubble.com chat.

## Run

Start the app:

```bash
TWITCH_CLIENT_ID='your-twitch-client-id' \
TWITCH_CLIENT_SECRET='your-twitch-client-secret' \
KICK_CLIENT_ID='your-kick-client-id' \
KICK_CLIENT_SECRET='your-kick-client-secret' \
node server.mjs
```

Then open:

```text
http://localhost:4178/
http://localhost:4178/chat/
http://localhost:4178/admin/
```

The admin route uses a server-side session cookie. In production, run behind HTTPS so the cookie can use the `Secure` attribute.
For now, admin is open when `ADMIN_PASSWORD_HASH` is unset. To turn password protection back on, generate a hash with `node server.mjs --hash-password "replace-this-password"` and start the server with `ADMIN_PASSWORD_HASH='pbkdf2$sha256$...'`.

## Connectors

- Twitch video is embedded through Twitch's player iframe.
- Twitch chat connects read-only through Twitch IRC over WebSocket.
- Twitch stream status and viewer count are loaded server-side through Helix when `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set. Secrets must stay in environment variables and out of git.
- Twitch native IRC emotes render from Twitch's emote tags. Third-party Twitch emotes are cached through `GET /api/twitch-emotes?channel=...` from 7TV, BetterTTV, and FrankerFaceZ.
- Kick stream status and viewer count are loaded server-side through Kick's public API when `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` are set. Keep `KICK_REDIRECT_URI` set to the app callback URL for later OAuth/webhook setup.
- Viewer counts are not edited in admin. They come from live provider APIs when those connectors are configured.
- Kick chat is received at `POST /api/webhooks/kick`, verified with Kick's webhook signature, normalized into the shared chat shape, then broadcast to open browsers through `GET /api/chat-events`.
- X comments should be connected server-side through X API filtered stream or recent search using `conversation_id` rules. This needs X API credentials.
- MarketBubble.com native chat is represented as a source boundary for a future first-party chat endpoint.

## Kick Chat Webhook

In the Kick developer dashboard, enable webhooks and set the webhook URL to the public backend URL:

```text
https://marketbubble.com/api/webhooks/kick
```

For local testing, expose the app with ngrok or Cloudflare Tunnel and use that public URL instead of `localhost`.

The app also exposes a local-only dev injector outside production:

```bash
curl -s -X POST http://localhost:4178/api/dev/kick-chat \
  -H 'content-type: application/json' \
  -d '{"author":"Local Tester","handle":"localtester","body":"local kick inject","sourceHandle":"marketbubble"}'
```

That should immediately add a Kick message to `/` and `/chat/` through the same server-sent events path used by real webhooks.

## Test

```bash
node --test tests/*.test.mjs
```
