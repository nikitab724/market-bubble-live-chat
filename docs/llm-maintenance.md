# LLM Maintenance

## Principles

This repo uses an `llms.txt`-style documentation pattern:

- A short root `llms.txt` points to important Markdown files.
- `docs/README.md` is the human and agent entry point.
- Topic docs explain behavior, setup, and operational contracts.
- Directory `AGENTS.md` files explain local ownership and cleanup rules.

The goal is not to dump every line of code into docs. The goal is to preserve the decisions and setup details that are easy to lose between agent runs.

Reference: https://llmstxt.org/

## When To Update Docs

Update docs in the same run when changing:

- public routes or API payloads
- source config shape
- admin behavior
- stream selection behavior
- Twitch, Kick, X, or native chat connectors
- deployment paths, env vars, or tunnel URLs
- tests or verification workflow
- directory ownership or file layout

## Writing Style

- Use concise Markdown.
- Link to source files or sibling docs instead of repeating large code blocks.
- Prefer stable headings that agents can search with `rg`.
- Keep examples small and executable when possible.
- Record current behavior and known gaps separately.
- Never include secrets.

## If Docs And Code Disagree

Trust the code first. Then update the docs to match, and mention the mismatch in the work summary.
