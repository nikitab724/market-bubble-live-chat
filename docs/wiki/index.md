# Wiki Index

This is the content-oriented catalog for the Market Bubble Live LLM Wiki. Read this first, then open only the pages relevant to the task.

## Project Overview

- [Docs README](../README.md): Start page for the wiki, current product shape, and update rule.
- [Architecture](../architecture.md): Runtime surfaces, server routes, source config, chat flow, and stream selection.
- [Connectors](../connectors.md): Twitch, Kick, X, native room, and viewer-count responsibilities.
- [Deployment](../deployment.md): Firecrawl deploy flow, Docker container, env vars, persistent data, and public URL assumptions.
- [Testing](../testing.md): Main test command, local smoke checks, and area-specific test files.
- [LLM Wiki maintenance](../llm-maintenance.md): How agents should ingest, query, lint, index, and log durable knowledge.

## Provider Setup

- [X Live setup](../x-live-setup.md): Current Chrome extension bridge, X stream embed behavior, debug checklist, and future official X API option.

## Source-Like Notes

- [LLM Wiki pattern](../sources/llm-wiki-pattern.md): Summary of the user-provided LLM Wiki idea file.

## Historical Planning

- [Dashboard design spec](../superpowers/specs/2026-06-05-market-bubble-dashboard-design.md): Original dashboard design direction.
- [SQLite chat event log design](../superpowers/specs/2026-06-08-sqlite-chat-event-log-design.md): Current design for persistent chat replay through an embedded SQLite file.
- [Admin status + offline countdown design](../superpowers/specs/2026-06-10-admin-status-and-offline-countdown-design.md): Handle-only admin rows with live status lines, the offline countdown player state, the inset site shell, and element-level layout travel.
- [Admin config backend plan](../superpowers/plans/2026-06-05-admin-config-backend.md): Historical implementation plan for admin config/backend work.
- [React Tailwind refresh plan](../superpowers/plans/2026-06-06-react-tailwind-refresh.md): Implementation plan for the React/Vite/Tailwind visual refresh.
- [Durable chat ingest plan](../superpowers/plans/2026-06-08-durable-chat-ingest.md): Implementation plan for replaying SSE chat delivery and server-side Twitch chat fan-in.
- [SQLite chat event log plan](../superpowers/plans/2026-06-08-sqlite-chat-event-log.md): Implementation plan for persisting chat events in SQLite while keeping setup simple.

## Maintenance Notes

- Add a short summary here when creating durable docs.
- Keep old historical specs/plans linked but do not rewrite them unless asked.
- Use `docs/wiki/log.md` for chronological entries.
