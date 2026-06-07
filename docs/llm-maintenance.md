# LLM Wiki Maintenance

## Principles

This repo uses an LLM Wiki pattern: the agent incrementally maintains a persistent, interlinked Markdown knowledge base instead of rediscovering project context from scratch each run.

Layers:

- Raw sources: `docs/sources/` holds immutable or source-like notes that the wiki was built from.
- Wiki: durable Markdown pages in `docs/`, cataloged by `docs/wiki/index.md`.
- Schema: root and directory `AGENTS.md` files define how agents should maintain the wiki.

`llms.txt` still exists, but only as a curated entry map. It is not the wiki by itself.

The goal is not to dump every line of code into docs. The goal is to preserve decisions, setup details, contradictions, and useful synthesis that are easy to lose between agent runs.

## Operations

### Ingest

When a user provides source material, place source-like notes under `docs/sources/` when useful, then update the relevant wiki pages. Add or revise cross-links, update `docs/wiki/index.md`, and append `docs/wiki/log.md`.

### Query

When answering project questions, read `docs/wiki/index.md` first, then the relevant source/docs pages. If the answer produces durable knowledge, file it back into the wiki and append the log.

### Lint

Periodically health-check the wiki for stale claims, missing links, orphan pages, contradictions, and setup gaps. Fix small issues directly and append a log entry.

## When To Update The Wiki

Update wiki/docs in the same run when changing:

- public routes or API payloads
- source config shape
- admin behavior
- stream selection behavior
- Twitch, Kick, X, or native chat connectors
- deployment paths, env vars, or tunnel URLs
- tests or verification workflow
- directory ownership or file layout

For repo-changing runs, append a short chronological entry to `docs/wiki/log.md`.

## Index And Log

- `docs/wiki/index.md` is content-oriented. It lists durable pages with one-line summaries so agents can decide what to read.
- `docs/wiki/log.md` is chronological and append-only. Use headings like `## [2026-06-06] docs | Add LLM Wiki structure` so simple tools can search the timeline.

## Writing Style

- Use concise Markdown.
- Link to source files or sibling docs instead of repeating large code blocks.
- Prefer stable headings that agents can search with `rg`.
- Keep examples small and executable when possible.
- Record current behavior and known gaps separately.
- Never include secrets.

## If Docs And Code Disagree

Trust the code first. Then update the docs to match, and mention the mismatch in the work summary.

## References

- Local source summary: `docs/sources/llm-wiki-pattern.md`
- Complementary entry-map pattern: https://llmstxt.org/
