# workflows AGENTS.md

This directory owns GitHub Actions workflow definitions.

Rules:
- Keep deploy steps explicit and auditable.
- Do not inline secrets; reference GitHub Secrets.
- If the Firecrawl deploy command, branch trigger, or SSH assumptions change, update `docs/deployment.md`.
- Prefer one workflow per operational purpose.
