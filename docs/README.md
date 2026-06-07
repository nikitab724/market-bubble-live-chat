# Market Bubble Live Docs

This directory is the repo's LLM-maintained wiki. Use it before making non-trivial changes, then update it when the code or setup changes.

## Start Here

- [Architecture](architecture.md): App surfaces, server routes, shared state, and data flow.
- [Wiki index](wiki/index.md): Content catalog for durable project knowledge.
- [Wiki log](wiki/log.md): Append-only timeline of ingests, queries, lint passes, and repo-changing runs.
- [Connectors](connectors.md): Twitch, Kick, X, and native chat boundaries.
- [X Live setup](x-live-setup.md): How the current Twitter/X stream and chat bridge works.
- [Deployment](deployment.md): Firecrawl deploy flow, Docker container, persistent data, and tunnel assumptions.
- [Testing](testing.md): Commands and focused smoke checks.
- [LLM maintenance](llm-maintenance.md): Documentation rules based on `llms.txt`/LLM wiki concepts.

## Current Product Shape

Market Bubble Live has three user-facing surfaces:

- `/` hosts the stream player, combined viewer count, source breakdown, and combined chat.
- `/chat/` is the chat-only surface for OBS/browser-source overlay use.
- `/admin/` edits profiles, platform sources, enabled state, and the single selected stream source.

The server also exposes provider endpoints for config, live state, Twitch emotes, SSE chat delivery, Kick webhook chat, and X chat bridge ingest.

## Update Rule

If a change affects behavior, setup, routes, connectors, deployment, tests, or data shape, update the matching doc in the same commit. For repo-changing runs, append a short entry to [wiki/log.md](wiki/log.md). Keep docs concise and avoid secrets.
