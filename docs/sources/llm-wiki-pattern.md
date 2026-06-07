# LLM Wiki Pattern

Source type: user-provided idea file.

## Summary

The user meant an LLM Wiki, not only an `llms.txt` documentation index.

Core idea:

- The agent incrementally builds and maintains a persistent Markdown wiki.
- Raw sources remain separate and mostly immutable.
- The wiki is the compiled knowledge layer: summaries, entity pages, concept pages, contradictions, cross-references, and synthesis.
- Schema/instructions such as `AGENTS.md` tell the agent how to maintain the wiki.
- Useful answers should be filed back into the wiki when they create durable knowledge.

Operations:

- Ingest: read a new source, extract key points, update relevant wiki pages, update the index, and append the log.
- Query: answer from the wiki first, then file durable synthesis back into the wiki when useful.
- Lint: periodically check for contradictions, stale claims, orphan pages, missing cross-references, and data gaps.

Special files:

- `index.md`: content-oriented catalog of wiki pages with one-line summaries.
- `log.md`: chronological append-only record of ingests, queries, lint passes, and meaningful changes.

How this repo applies it:

- `docs/wiki/index.md` is the content catalog.
- `docs/wiki/log.md` is the chronological log.
- `docs/sources/` is the raw/source-like layer.
- Existing docs such as architecture, connectors, deployment, testing, and X setup are durable wiki pages.
- `llms.txt` stays as a useful entry map, but it is not the whole wiki.
