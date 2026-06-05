# Market Bubble Live

A static prototype for the Market Bubble hosted stream and shared chat.

It simulates two surfaces powered by the same Twitch, Kick, X, and MarketBubble.com feed:

- `/` is the hosted viewer page with a stream view, combined viewer count, source breakdown, and combined chat.
- `/chat/` is the chat-only surface for OBS/browser-source overlay or embedding.

The demo treats each stream source separately, including Market Bubble on Twitch/Kick, Banks on X, Z on X, and the native MarketBubble.com chat.

## Run

```bash
python3 -m http.server 4178
```

Then open:

```text
http://localhost:4178/
http://localhost:4178/chat/
```

## Test

```bash
node --test tests/*.test.mjs
```
