# Fixture-Vault

Die Tests erzeugen ein temporäres Fixture-Vault mit echten Mini-EPUBs und
scannen es über `LibraryIndexer`. Beispieldatei für das Frontmatter-Format:

```markdown
---
hash: 608905221b881775f2e800c72029a67c25e4128e086eaae838f786df05c25203
file: 02 Sachbuch/Geschichte/A history of smoking -- Corti, Egon Caesar.pdf
format: pdf
size: 18574800
cover: 608905221b881775f2e800c72029a67c25e4128e086eaae838f786df05c25203.jpg
title: "A history of smoking"
author: "Egon Caesar Corti"
tags: ["02-sachbuch", "geschichte"]
---
```

Receipts: `npx vitest run tests/indexer.test.ts tests/ai-pipeline.test.ts
tests/checkout-worker.test.ts` (2026-08-11, alle grün).
