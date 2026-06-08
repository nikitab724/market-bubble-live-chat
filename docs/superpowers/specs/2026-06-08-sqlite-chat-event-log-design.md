# SQLite Chat Event Log Design

## Goal

Make backend chat delivery survive server restarts and short browser disconnects without adding a separate database service or operator-heavy setup.

## Chosen Approach

Use an embedded SQLite database file in the existing persistent `data/` directory. The default path is `data/chat-events.sqlite`, with an optional `CHAT_DB_PATH` override for advanced deployments.

This matches the current Firecrawl deploy shape: the Docker container already mounts `/opt/market-bubble-live/data` to `/app/data`, so the chat log survives image rebuilds and container recreation without adding Postgres, credentials, Docker Compose, or a cloud DB.

## Data Flow

1. Provider chat/status events enter the backend through Twitch fan-in, Kick webhooks, or X extension ingest.
2. The chat event hub appends the event to SQLite before broadcasting it.
3. The SQLite row id becomes the SSE event id.
4. New browser connections receive the recent stored window.
5. Browser reconnects with `Last-Event-ID` receive stored events after that id.

## Storage

The database stores:

- numeric `id`
- event name, such as `chat` or `chat-status`
- JSON payload
- `created_at` timestamp in milliseconds

Retention defaults:

- `CHAT_RETENTION_HOURS=2`
- `CHAT_REPLAY_LIMIT=1000`

Retention cleanup runs when the store opens, after writes, and before replay queries, removing old rows. `CHAT_RETENTION_DAYS` remains a compatibility fallback when `CHAT_RETENTION_HOURS` is unset. Replay queries still cap by `CHAT_REPLAY_LIMIT` so a browser does not receive unlimited history on connection.

## Tradeoffs

SQLite keeps setup simple and non-janky for a single-container app. It is not a multi-node queue. If the app later runs multiple Node containers, the chat event log should move to Postgres or another shared database.

The DB records messages after they reach this server. It cannot recover provider events that Twitch/Kick/X never deliver.

## Testing

Add focused `node --test` coverage for:

- schema creation and append/replay ordering
- reconnect replay after a stored id
- startup replay from stored events after a hub restart
- retention cleanup
- server wiring with injected stores
