# Changelog

## 0.7.6 - 2026-08-30

### Changed

- Match audiobook cards, generated notes and detail views to the ebook information hierarchy.
- Reuse strongly matched book ratings, categories, descriptions and author profiles in audiobook details.
- Keep related books and related topics as compact sibling sections with source-aware listening guidance.

### Fixed

- Show the complete audiobook detail view without vertical or horizontal scrollbars at the reproduced 578 × 701 px viewport.
- Keep rating stars on one line and technical details collapsed without hiding the action row.
- Prevent audiobook covers and related-book cards from stretching or clipping their content.

## 0.7.5 - 2026-08-29 (local pilot)

### Added

- Fuse strongly matched Open Library and Google Books metadata while keeping source-specific descriptions, ratings and external identities.
- Generate typed author profiles with stable authority IDs, local works, topics and source provenance.
- Add an explicit Michael Hudson enrichment pilot for two books with a confirmed Amazon edition link for *J Is for Junk Economics*.

### Changed

- Keep cover, reader-facing content and collapsed technical details as independent sibling sections in generated catalog notes.
- Show compact covers, source-specific ratings and sourced descriptions in the detail modal.
- Route Amazon searches to the book language and preserve the marketplace of confirmed product identities.

### Fixed

- Generate missing catalog and author notes before opening them.
- Collapse generated-note properties once per session without overriding a reader's later manual expansion.
- Reject malformed external provenance fields during index normalization.

## 0.7.4 - 2026-08-27

### Fixed

- Keep long detail titles and the related-books carousel within the modal width, eliminating the dialog-level horizontal scrollbar.
- Prevent catalog filenames from starting with dots, which Obsidian treats as hidden files.
- Recover existing hidden catalog notes non-destructively when they are opened and show a bilingual error notice if navigation fails.

## 0.7.3 - 2026-08-27

### Added

- Create a local, source-bound wiki for books with catalog metadata but no converted Markdown; this fallback neither calls an AI provider nor spends budget.
- Split converted Markdown by chapters before paragraph chunking and add a linked contents section to generated wikis.

### Changed

- Keep source categories readable in detail views and catalog records.
- Restrict related-book matches to verified author, category or theme overlap; generic titles, folder tags and placeholder authors are no longer sufficient.
- Present related books as a horizontally scrollable strip after reader-facing detail sections.

### Fixed

- Preserve a converted document's introduction while splitting by Markdown chapters.
- Keep books queued rather than marking them failed when a configured wiki budget is reached.

## 0.7.2 - 2026-08-27

### Added

- Persist enriched synopses, ratings, categories, themes and locally stored public-review excerpts in catalog notes.
- Add product/minimal detail-display and local-review visibility settings.

### Fixed

- Keep restored catalog records complete after the in-memory index is unavailable.
- Synchronize the landing-page audiobook preview's visual and accessible selected states.
- Localize the German landing-page prompt-library CTA.

## 0.7.1 - 2026-08-26

### Fixed

- Audiobook detail links to related topics now open the topic note instead of reopening the audiobook note.
- The related-books section no longer renders an empty header when all stored references resolve to nothing.

### Changed

- Hover enlargement of related covers is disabled when the system prefers reduced motion.

## 0.7.0 - 2026-08-26

### Added

- Keep search focus and caret position while result counts, filters and the grid refresh.
- Return keyboard focus to the first newly loaded card after incremental loading.
- Localize audiobook technical detail labels in English and German.
- Extract reusable manual-entry validation with dedicated tests.

### Fixed

- Live search now refreshes statistics and filter controls instead of only replacing cards.
- Pending search timers are cleared when the library view closes.
- Manual form errors clear as the user edits relevant fields and are announced through `role=alert`.

## 0.6.9 - 2026-08-26

### Added

- Remember library mode, sort order, format filter, selected tag/category and filter visibility between Obsidian sessions.
- Add a bilingual reset action for active search, format, tag and category filters.

### Changed

- Validate restored view state so corrupted settings cannot break the library.
- Empty book and audiobook views now offer direct setup, scan and manual-entry actions.

### Fixed

- Setup completion counts legacy audiobook source links that were stored in provider-specific fields.
- Manual audiobook entries validate source URLs before saving and disable repeated submissions.

## 0.6.8 - 2026-08-25

### Changed

- Audiobooks now support every library sort mode, including author, year, size, newest and category.
- Incremental loading appends the next batch without rebuilding cards that are already visible.
- Cover images load lazily and book/audiobook cards can be opened with keyboard controls.

## 0.6.7 - 2026-08-25

### Added

- Added `versions.json` entries for 0.6.5, 0.6.6 and 0.6.7.
- Added filename-safe fallback targets for readable related-book links generated from a technical ID.

### Changed

- Hardened release packaging so existing published archives are preserved unless a rebuild is explicitly forced.

## 0.6.6 - 2026-08-25

### Fixed

- Archived superseded catalog notes so completed libraries have no active links to hash-named records.
- Render readable related-book targets even when an older caller supplies only a technical hash.
- Completed the source-backed audiobook synopsis set: all 105 entries now pass the completion audit.

## 0.6.5 - 2026-08-24

### Changed

- Updated plugin attribution to Appsyl and `https://appsyl.com`.
- Streamed release assets through the public landing page.
- Expanded the prompt library with assisted and manual plugin installation guidance.

## 0.6.4 - 2026-08-23

### Added

- Collapsible tag/category filters with a bilingual toggle to the left of the Books/Audiobooks switch.
- An active filter remains visible when the list is collapsed.

## 0.6.3 - 2026-08-23

### Changed

- Detail modal now keeps the header and primary actions visible while only the synopsis, metadata, technical fields and related books scroll.
- Related books use a calm row layout instead of repeated cards; technical tags wrap cleanly instead of forcing long text rows.
- Internal scrolling no longer shows a browser scrollbar.

## 0.6.2 - 2026-08-23

### Changed

- Related books now require meaningful evidence: matching author, a shared specific tag, or rare title concepts.
- Generic words such as “book”, “guide”, “life”, “year” and common connectives no longer create false matches.
- Existing libraries rebuild related-book links when **Repair metadata text encoding** runs.

### Fixed

- Repaired reference-library links so unrelated entries no longer appear as related books; the example entry now links only to Michael Hudson’s directly related finance/debt books.

## 0.6.1 - 2026-08-23

### Fixed

- “Open catalog folder” now opens the catalog directory in the system file manager instead of opening the first catalog note, which could be any book such as Alex Hormozi’s entry.

## 0.6.0 - 2026-08-23

### Added

- Generate tag-based “Related topics” maps for every book library.
- Link book catalog notes to their topic maps and rename cross-references to “Related books”.
- Add an **Open plugin folder** command for direct access to release assets.

### Fixed

- Repair legacy catalog filenames containing encoded ampersands, numeric entities and UTF-8/BOM artifacts.
- Rebuild missing catalog notes during repair instead of silently skipping them.
- Preserve timestamped index backups and archive replaced notes in a reversible backup folder.

## 0.5.1 - 2026-08-23

### Fixed

- Decode XML/HTML entities, numeric character references and double-encoded text in book metadata.
- Repair Latin-1-decoded UTF-8 artifacts such as `ï»¿` during EPUB/PDF parsing and display.
- Strip markup and control characters from synopses.
- Add a bilingual “Repair metadata text encoding” command for existing libraries.
- Preserve optional settings when an older `data.json` contains null values.

## 0.5.0 - 2026-08-23

### Added

- Manual audiobook entry form for any storage path or source link.
- Stable manual-entry IDs and automatic related-topic links.

## 0.4.0 - 2026-08-23

### Added

- Three-step setup wizard with native folder pickers for books and audiobooks.
- Indexing summary showing book, audiobook, cover, source-link and related-topic counts.
- Local audiobook folder scanning.
- Bilingual landing page with installation, privacy and reusable AI prompts.

### Changed

- Audiobook storage is provider-neutral while preserving legacy private-source links.
- Detail views show synopsis directly under the cover and collapse technical fields by default.
- Public language uses “related topics” instead of an internal workflow name.

## 0.3.0 - 2026-08-23

### Added

- Generic source-link fields and legacy index normalization.
- Privacy documentation.

### Fixed

- External URL validation, scan limits and index-path containment.
