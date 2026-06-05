# Market Bubble Live Design

## Scope

Build a first-pass Market Bubble hosted live page for one creator/event plus a chat-only embed surface. Both surfaces consume the same Twitch, Kick, X, and native MarketBubble.com message feed.

## Experience

- `/` viewer page: stream view plus combined chat.
- `/chat/` embed page: combined chat only for OBS/browser-source use.
- Combined chat feed with platform labels, stream-source labels, timestamps, and user avatars on both surfaces.
- Combined viewer total with a per-source breakdown for Market Bubble on Twitch/Kick, Banks on X, Z on X, and native MarketBubble.com chat.
- Hover profile card with full handle, platform, stream source, profile URL, recent message count, and last seen time.
- No dashboard panels, stats, moderation tools, or secondary controls in the first visible prototype.

## Data Model

Messages are normalized into one shape:

- `id`
- `platform`
- `author`
- `handle`
- `body`
- `timestamp`
- `sourceUrl`
- `sourceId`
- `sourceName`
- `sourceHandle`
- `sourceLabel`
- `avatar`
- `sentiment`

Viewer sources are normalized separately with viewer counts, platform, source ID, source label, and source URL. The UI consumes normalized messages and viewer sources only. Real Twitch, Kick, X, and native MarketBubble.com connectors can replace the simulated source later without changing the chat rendering used by either page.

## Prototype Strategy

Use a static browser app with simulated live data. Keep the connector boundary explicit so the demo can later accept real API streams.

## Verification

Use Node's built-in test runner for the message normalization and aggregation logic. Verify the static app loads in a browser-compatible structure.
