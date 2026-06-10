# extension AGENTS.md

This directory owns the Chrome extension used to bridge X Live chat into the backend.

Rules:
- Keep extension code free of secrets. Backend URLs are public endpoints only.
- X DOM selectors are fragile. If chat capture breaks, inspect a live chat row and update `extractMessage()` in `content.js`.
- The popup source list should come from `/api/public-config` when possible.
- If the public backend URL changes, update both `content.js` and `popup.js`, then update `docs/x-live-setup.md`.
- Update `docs/x-live-setup.md` whenever X setup, source selection, or debugging steps change.
