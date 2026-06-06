# tests AGENTS.md

This directory owns Node test coverage.

Rules:
- Use `node --test` style tests.
- Keep tests deterministic and avoid real provider network calls.
- Prefer narrow contract tests for source config, admin model, provider parsing, server routes, and chat behavior.
- When behavior changes, update or add the smallest test that proves the new contract.
- If the verification command changes, update `docs/testing.md`.
