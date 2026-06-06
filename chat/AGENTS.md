# chat AGENTS.md

This directory owns the chat-only surface used for OBS/browser-source embedding.

Rules:
- Keep this surface focused on combined chat only.
- Do not add admin controls, marketing sections, or stream-player controls here.
- Preserve bottom-anchored chat behavior and manual scroll-up pause.
- Shared chat behavior usually lives in `src/app.mjs` and `src/chat-model.mjs`.
- Update `docs/architecture.md` and chat tests when overlay behavior changes.
