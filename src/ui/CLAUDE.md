# src/ui AGENTS.md

This directory owns the Vite/React browser shell.

Rules:
- Keep provider connections, chat normalization, and source config outside React.
- React may render layout and admin/viewer chrome; high-volume chat behavior stays in `src/app.mjs` and `src/chat-renderer.mjs`.
- Keep `/chat/` focused on chat-only embedding.
- Update `tests/chat-interaction-contract.test.mjs` when changing DOM ids/classes consumed by the live runtime.
