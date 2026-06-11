# X Live Setup

## What Works Now

There are two X chat paths. The preferred path is the **server-side connector** (`src/x-chat-service.mjs`), which connects to the X/Periscope broadcast chat directly once a source has a broadcast id. The Chrome extension in `extension/` remains as a fallback chat bridge and, more usefully, as the way the broadcast id is captured automatically.

### Server-side connector + automatic broadcast id (preferred)

The server-side connector needs a broadcast id per X source. The extension fills it in automatically:

1. Configure X sources in `/admin/`, setting `sourceHandle` to the broadcaster handle (such as `banks`).
2. Load `extension/` as an unpacked Chrome extension.
3. Open the broadcaster's own X live page (`x.com/i/broadcasts/<id>`) in Chrome.
4. Click the Market Bubble extension popup and select the matching X source.
5. The content script reads the broadcast id from the URL and POSTs it to `POST /api/x-broadcast`. The server writes it to the matching X source and the server-side connector attaches to that broadcast's chat.

X mints a new broadcast id each time the account goes live, so the extension re-reports it whenever the URL changes — no manual paste per stream. The admin editor has no broadcast id field: the X row's status line reads "Go live, then open your X live page in Chrome with the extension" until the id is captured, then flips to the connector's status. A captured `broadcastId` survives admin saves untouched.

### Extension DOM bridge (fallback)

If a source has no broadcast id (or the server-side handshake is unavailable), keep the X live page open with the source selected. The content script watches chat DOM changes and posts messages to `POST /api/x-chat`.

Current backend target in the extension:

```text
https://marketbubble.192-210-192-116.sslip.io
```

The extension popup includes a Backend URL field. Change it there when the deployed backend URL changes, then click Apply. The value is stored in Chrome extension storage and used for both `/api/public-config` and `/api/x-chat`.

## How Chat Is Captured

`extension/content.js` watches `document.body` with a `MutationObserver`. It tries to identify X live chat rows by the `UserAvatar-Container-*` test id, extracts author/handle/body, dedupes recent fingerprints, and posts:

```json
{
  "author": "Display Name",
  "handle": "handle",
  "body": "message text",
  "timestamp": "2026-06-05T00:00:00.000Z",
  "sourceHandle": "banks"
}
```

`server.mjs` maps `sourceHandle` to the configured X source, normalizes the message, logs `[x-chat] ...`, then sends it to browsers over `/api/chat-events`.

## How Stream Viewing Works

When an X source has `showStream: true` and a `conversationId`, `src/app.mjs` renders an X widget blockquote linking to:

```text
https://x.com/{sourceHandle}/status/{conversationId}
```

If X widgets cannot embed the live surface, or if `conversationId` is empty, the app shows a clean placeholder with an open-stream link.

## Debug Checklist

- Confirm the X source exists and is enabled in `/admin/`.
- Confirm the extension popup Backend URL points at the backend that serves `/api/public-config`.
- Confirm the extension popup source matches the X live page being watched.
- For automatic broadcast id capture: open the broadcaster's `x.com/i/broadcasts/<id>` page, select the source in the popup, and check the X tab console for `[MB X Bridge] reported broadcast <id> for @handle`, then check server stdout for `[x-broadcast] <sourceId> -> <id>`.
- Confirm chat is enabled on the broadcast (X has a per-broadcast chat permission setting); a restricted broadcast yields a connected websocket with no messages.
- For the DOM fallback: check the X tab console for `[MB X Bridge] Watching document.body...` and server stdout for `[x-chat] Source | Author: body`.
- Open `/` or `/chat/` and confirm the message arrives through SSE.
- If DOM-fallback messages stop after X UI changes, inspect a live chat row, copy its outerHTML, and update `extractMessage()` in `extension/content.js`.

## Future Official X API Path

The official backend approach is to track replies/comments by `conversation_id`, if the X Live comments being targeted are exposed as Posts/replies through the API. This may not replace the extension for every X Live chat UI.

X docs say all replies in a conversation share the original post's `conversation_id`, and that `conversation_id:<id>` can be used with recent search or filtered stream rules. A backend connector would:

1. Store X API credentials in env only.
2. Keep source `conversationId` values in source config.
3. Add filtered stream rules like `conversation_id:2062574325970973093`.
4. Connect to the filtered stream endpoint.
5. Normalize matching posts into the same chat message shape.
6. Reconnect and re-apply rules on deploy/restart.

Do not replace the extension bridge with this until credentials, access tier, rate limits, and event coverage are confirmed against a real X Live broadcast.

## References

- X conversation id docs: https://docs.x.com/x-api/fundamentals/conversation-id
- X filtered stream rule docs: https://docs.x.com/x-api/posts/filtered-stream/integrate/build-a-rule
- X search operator docs: https://docs.x.com/x-api/posts/search/integrate/operators
