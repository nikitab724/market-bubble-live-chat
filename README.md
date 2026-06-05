# Market Bubble Live

A server-backed prototype for the Market Bubble hosted stream and shared chat.

It simulates two surfaces powered by the same Twitch, Kick, X, and MarketBubble.com feed:

- `/` is the hosted viewer page with a stream view, combined viewer count, source breakdown, and combined chat.
- `/chat/` is the chat-only surface for OBS/browser-source overlay or embedding.
- `/admin/` is a password-protected source editor for stream/chat sources.

The demo treats each stream source separately, including Market Bubble on Twitch/Kick, Banks on X, Z on X, and the native MarketBubble.com chat.

## Run

Generate an admin password hash:

```bash
node server.mjs --hash-password "replace-this-password"
```

Start the app with that hash:

```bash
ADMIN_PASSWORD_HASH='pbkdf2$sha256$...' node server.mjs
```

Then open:

```text
http://localhost:4178/
http://localhost:4178/chat/
http://localhost:4178/admin/
```

The admin route uses a server-side session cookie. In production, run behind HTTPS so the cookie can use the `Secure` attribute.

## Connectors

- Twitch video is embedded through Twitch's player iframe.
- Twitch chat connects read-only through Twitch IRC over WebSocket.
- Kick chat should be connected through Kick's `chat.message.sent` webhook event, which needs a public webhook URL and Kick signature verification.
- X comments should be connected server-side through X API filtered stream or recent search using `conversation_id` rules. This needs X API credentials.
- MarketBubble.com native chat is represented as a source boundary for a future first-party chat endpoint.

## Test

```bash
node --test tests/*.test.mjs
```
