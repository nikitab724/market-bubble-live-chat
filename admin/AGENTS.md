# admin AGENTS.md

This directory owns the browser admin source/profile editor.

Rules:
- Keep admin state compatible with `src/source-config.mjs`.
- Profiles group platform sources; sources remain the saved server data.
- Preserve expand/collapse behavior and the one-selected-stream rule.
- Do not add editable viewer-count controls. Viewer counts come from live providers.
- Update `tests/admin-profile-model.test.mjs` when profile/source behavior changes.
- Update `docs/architecture.md` or `docs/connectors.md` when admin config fields change.
