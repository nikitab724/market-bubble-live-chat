# Wiki Log

Append-only timeline for ingests, queries, lint passes, and repo-changing runs. Use stable headings so `rg "^## \\[" docs/wiki/log.md` shows the history.

## [2026-06-06] docs | Add LLM Wiki structure

- Added persistent wiki navigation with `docs/wiki/index.md`.
- Added append-only maintenance history with `docs/wiki/log.md`.
- Added `docs/sources/` as the raw/source-like layer.
- Corrected the earlier docs from an `llms.txt`-only interpretation to the user-provided persistent LLM Wiki pattern.
- Verification: `git diff --check`; `node --test tests/*.test.mjs` (59 passed).
