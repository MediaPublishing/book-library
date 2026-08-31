# Architektur

## Module

| Modul | Aufgabe |
|---|---|
| `src/main.ts` | Plugin-Lebenszyklus, Commands, Scan-/Konvertierungs-/Wiki-Orchestrierung |
| `src/indexer.ts` | Inkrementeller Scan, Hash-/mtime-Cache, Frontmatter-Katalog |
| `src/epub.ts` | EPUB-Metadaten (OPF) und Cover-Extraktion über JSZip |
| `src/pdf.ts` | PDF-Info-Metadaten aus dem Dateikopf |
| `src/metadata.ts` | Open Library + Google Books Provider, Cover-Download |
| `src/related.ts` | Related Books über Tag-/Autor-/Titel-Scores |
| `src/conversion.ts` | EPUB→Markdown über Pandoc/Calibre/epub2md |
| `src/ai.ts` | AI-Adapter, Chunking, Budget, Wiki-Cache |
| `src/library-view.ts` | Obsidian ItemView: Suche, Filter, Grid |
| `src/settings.ts` | Settings-Tab |
| `src/i18n.ts` | Übersetzungen EN/DE, Auto-Erkennung aus der Systemsprache |
| `cloudflare-worker/checkout-worker.js` | Stripe Checkout Session Endpoint |

## Datenfluss

1. `scanLibrary` liest die externe Bibliothek über Node-fs (Desktop).
2. `LibraryIndexer` berechnet SHA-256, prüft den Cache, liest lokale
   Metadaten und reichert über freie APIs an.
3. Katalogdateien `_catalog/<hash>.md` und `.book-library-index.json`
   werden geschrieben.
4. Die View liest den Index und filtert clientseitig.
5. `convertNextBooks` nutzt lokale CLI-Tools; `generateNextWikis` nutzt
   den AI-Adapter mit Budget und Cache.

## Token-Effizienz-Invarianten

- Ohne geänderte Datei kein Re-Read (mtime + size + hash).
- Kein AI-Aufruf für Katalog-Daten.
- Kein Chunk über `maxTokensPerBook`.
- Kein Provider-Aufruf über `budgetCents` hinaus.
- Ergebnis-Cache verhindert doppelte Kosten bei identischem Buch/Modell.

## Sprache

- `settings.language`: `auto` (Default), `en` oder `de`.
- `auto` ruft `navigator.language` ab; `de*` führt zu Deutsch, alles andere
  zu Englisch.
- View, Einstellungen, Notices, Commands, Katalogdatei und AI-Prompt nutzen
  denselben Übersetzungskatalog.
- Test-Hook: Liegt `auto-open` im Plugin-Ordner, öffnet das Plugin die View
  nach `onLayoutReady` automatisch. Nur für Client-Tests gedacht.

## Stripe

- Plugin öffnet entweder einen statischen Payment Link oder POST auf den
  Worker-Endpoint, der eine Checkout Session erzeugt.
- Entitlement in v1: lokal eingetragener Pro-Lizenzschlüssel. Bei echten
  Verkäufen folgt ein Webhook-basiertes License-System; die erste echte
  Live-Transaktion bleibt Human-Gate.
- Worker antwortet bei fehlenden Secrets mit 503 und explizitem
  Config-Blocker.
