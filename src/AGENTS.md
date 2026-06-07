# src AGENTS.md

This directory owns shared application modules used by the server and browser.

Rules:
- Keep provider-specific API logic in provider-specific modules.
- Keep source config normalization in `source-config.mjs`.
- Keep chat normalization/model behavior in chat modules.
- Do not put secrets in browser modules.
- Add focused tests in `tests/` when changing contracts, parsing, normalization, or provider behavior.
- Update `docs/architecture.md` and `docs/connectors.md` when public behavior or data shape changes.
