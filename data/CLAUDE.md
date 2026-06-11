# data AGENTS.md

This directory contains default runtime data.

Rules:
- `sources.json` is the seed config for new/local installs.
- `admin-password.json` is the runtime-set admin password hash (written by the admin UI's Change password panel, gitignored). Never commit it.
- Production admin edits live in the mounted data directory, not necessarily in git.
- Do not commit secrets, tokens, private stream keys, or real hidden credentials here.
- Do not treat `viewerCount` as admin-owned product data; live providers should overwrite it when available.
- If the source schema changes, update `src/source-config.mjs`, tests, and `docs/architecture.md`.
