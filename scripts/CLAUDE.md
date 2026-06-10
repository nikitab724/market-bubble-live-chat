# scripts AGENTS.md

This directory owns operational scripts.

Rules:
- Keep scripts idempotent and readable.
- Use env vars for paths and names when the deploy target needs overrides.
- Do not bake secrets into scripts.
- Be careful with destructive commands. If cleanup is necessary, scope it tightly.
- If deployment behavior changes, update `docs/deployment.md`.
