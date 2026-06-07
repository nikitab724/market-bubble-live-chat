# .github AGENTS.md

This directory owns GitHub automation.

Rules:
- Keep workflows small and explicit.
- Do not add secret values to workflow files; reference GitHub Secrets only.
- Firecrawl deploy behavior belongs in `deploy-firecrawl.yml` and `scripts/deploy-firecrawl.sh`.
- If deploy triggers, paths, ports, or secrets change, update `docs/deployment.md`.
- Avoid broad workflow permissions unless a task requires them.
