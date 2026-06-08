# Deployment

## Current Hosting Shape

The repo deploys to the Firecrawl server through GitHub Actions on pushes to `main`.

Key files:

- `.github/workflows/deploy-firecrawl.yml`: SSHes into the Firecrawl server and runs the deploy script.
- `scripts/deploy-firecrawl.sh`: builds the Docker image, recreates the container, and mounts persistent data.
- `Dockerfile`: installs npm dependencies, builds the Vite frontend into `dist/client`, then runs the Node server.

## Firecrawl Paths

The deploy script defaults to:

- app checkout: `/opt/market-bubble-live/app`
- persistent data: `/opt/market-bubble-live/data`
- env file: `/opt/market-bubble-live/.env`
- image: `market-bubble-live:latest`
- container: `market-bubble-live`
- host port: `127.0.0.1:4178`

`data/sources.json` is mounted from the persistent data directory. Admin changes on production live there, not only in the git checkout.

## Public URL

The public URL is currently served through a tunnel/proxy to the backend on port `4178`. The extension currently posts to:

```text
https://marketbubble.192-210-192-116.sslip.io
```

If the tunnel hostname changes, update the extension URLs and reload the unpacked Chrome extension.

## Secrets

Do not commit secrets. Provider credentials and admin password hash belong in environment variables on the server.

Common env vars:

- `PORT`
- `ADMIN_PASSWORD_HASH`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`
- `KICK_REDIRECT_URI`
- `CHAT_DB_PATH` (optional, defaults to `/app/data/chat-events.sqlite` in Docker)
- `CHAT_RETENTION_HOURS` (optional, defaults to `2`)
- `CHAT_RETENTION_DAYS` (optional compatibility fallback when `CHAT_RETENTION_HOURS` is unset)
- `CHAT_REPLAY_LIMIT` (optional, defaults to `1000`)

## Build Step

The frontend is a Vite/React/Tailwind build. Docker runs:

```bash
npm ci
npm run build
```

The Node server serves `dist/client` for `/`, `/chat/`, `/admin/`, and `/assets/*` before falling back to source files used by tests.

## Persistent Chat Event Log

Chat events are stored in SQLite before they are sent over `/api/chat-events`. The default Docker path is:

```text
/app/data/chat-events.sqlite
```

The deploy script already mounts `/opt/market-bubble-live/data` to `/app/data`, so the chat event log survives container rebuilds and restarts without a separate DB service. Keep that data mount in place for reliable reconnect replay.

By default, chat event rows older than 2 hours are deleted when the store opens, before replay, and after new writes. This keeps the persistent SQLite file bounded while still covering browser refreshes, reconnects, and short server restarts.

SQLite sidecar files such as `chat-events.sqlite-wal` and `chat-events.sqlite-shm` are expected.

## Manual Deploy Smoke Check

After deploy:

1. Open `/api/public-config` and confirm enabled sources are present.
2. Open `/api/live-state` and check Twitch/Kick provider status.
3. Open `/` and verify the selected stream source loads.
4. Open `/chat/` and verify chat renders at the bottom.
5. Send a local-only dev Kick chat only in non-production.
6. For X, keep a watched X live page open and confirm `[x-chat]` logs arrive.
