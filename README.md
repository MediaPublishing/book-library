<p align="center">
  <img src="assets/brand/logo.svg" alt="Book Library for Obsidian" width="200">
</p>

<p align="center">
  <strong>Lokale Bücher und Audiobooks als vernetzte Obsidian-Bibliothek.</strong><br>
  <strong>Turn local books and audiobooks into a connected Obsidian library.</strong>
</p>

<p align="center">
  <a href="#deutsch">Deutsch</a> · <a href="#english">English</a> · <a href="https://obsidian-book-library.pages.dev/">Landingpage</a> · <a href="https://github.com/MediaPublishing/book-library/releases">Releases</a>
</p>

## Screenshots

### Bücher / Books

![Book Library Bücheransicht mit Covers, Filtern und Kategorien](site/assets/library-books.png)

### Audiobooks

![Book Library Audiobook-Ansicht mit Covers, Filtern und Ablageinformationen](site/assets/library-audiobooks.png)

---

## Deutsch

Book Library verwandelt lokale EPUB-, PDF- und Audiobook-Ordner in eine durchsuchbare Obsidian-Bibliothek. Das Plugin erstellt lesbare Katalognotizen mit Covers, Synopsen, Quellenlinks, verwandten Büchern und Themen. Deine Mediendateien bleiben an ihrem ursprünglichen Speicherort.

### Funktionen

- Inkrementeller Scan für EPUB- und PDF-Dateien.
- Lokaler Audiobook-Index für M4A, M4B, MP3, FLAC, OGG, Opus, WAV und AAC.
- Einheitliche Detailansicht für Bücher und Audiobooks mit Cover, Beschreibung, Ratings und belegten Rezensionen.
- Lokale hybride semantische Suche über Titel, Autor, Kategorien, Themen, Tags, Beschreibungen und Synopsen.
- Automatische Audiobook-Anreicherung über öffentliche Buchquellen; vorhandene lokale Daten haben Vorrang.
- Lesbare Katalognotizen statt Hash-Dateinamen.
- Covers aus eingebetteten Dateien, Open Library oder Google Books.
- EPUB-zu-Markdown-Konvertierung.
- Erklärbare verwandte Bücher aus Autor, Kategorie, Thema und kontrollierter semantischer Relevanz.
- Optionale AI-Workflows für Themen-Wikis und Cover-Generierung.
- Lokale Pfade, Web-URLs, Cloud-Ordner und private Ablage-Links.
- Keine Telemetrie. Externe Dienste sind optional und müssen bewusst aktiviert werden.

### Installation

1. Lade [Book Library 0.7.8](https://obsidian-book-library.pages.dev/download/book-library-0.7.8.zip) herunter.
2. Entpacke das ZIP.
3. Kopiere `main.js`, `manifest.json` und `styles.css` nach:

   ```text
   <Vault>/.obsidian/plugins/book-library/
   ```

4. Aktiviere **Book Library** unter **Einstellungen → Community-Plugins** in Obsidian.

### Schnellstart

1. Starte **Bibliothek einrichten** oder öffne **Setup** in der Bibliotheksansicht.
2. Wähle deinen Buchordner und optional einen Audiobook-Ordner.
3. Prüfe Sprache und Detailanzeige.
4. Starte die Indexierung und kontrolliere die Zusammenfassung.
5. Lade fehlende Covers zuerst über die kostenlosen Quellen nach.
6. Aktiviere AI-Workflows nur für die gewünschten Bücher und mit einem festgelegten Budget.

Wenn Titel, Autoren oder Beschreibungen fehlerhafte Zeichen wie `&amp;`, `ï»¿` oder HTML-Fragmente enthalten, führe **Metadaten-Textkodierung reparieren** über die Obsidian-Befehlspalette aus. Ersetzte Katalogdateien werden archiviert und nicht gelöscht.

### AI und Datenschutz

Die lokale Indexierung funktioniert ohne AI-Dienst. Metadaten und Covers können über öffentliche Buch-APIs ergänzt werden. AI-Wikis und AI-Covers sind optional und erfordern eine eigene Provider-Konfiguration. Bei einem AI-Wiki werden der ausgewählte Buchabschnitt sowie höchstens sechs lokal geprüfte Katalogziele mit ihren Begründungen an den konfigurierten Provider gesendet. Weitere Details stehen in [PRIVACY.md](PRIVACY.md).

### Wie Suche und Wiki-Verlinkung funktionieren

Die Suche läuft vollständig lokal und ohne externen Embedding-Dienst. Sie normalisiert deutsche und englische Suchbegriffe, gewichtet Titel und Autor besonders stark und bezieht Kategorien, Themen, Tags, Beschreibungen und Synopsen in das Relevanz-Ranking ein. Das ist eine nachvollziehbare hybride semantische Suche auf Basis der vorhandenen Metadaten, kein neuronaler Vektorindex.

Für Wiki-Links bildet Book Library zuerst eine Kandidatenliste aus bereits vorhandenen Katalogeinträgen. Ein Buch braucht mindestens ein starkes Signal: gleicher Autor, gemeinsame Kategorie, gemeinsames Thema oder eine begriffliche Überschneidung innerhalb von Kategorie oder Thema. Beschreibungen und Titel dürfen die Reihenfolge verbessern, erzeugen aber allein keinen Link. Maximal sechs geprüfte Ziele werden mit Begründung an den optionalen AI-Workflow übergeben; alle erkannten Abschnitte „Verwandte Bücher“ werden danach entfernt und durch genau eine kontrollierte Whitelist ersetzt. In diesem Buch-Querverweisabschnitt kann die AI daher keine nicht vorhandenen Katalogziele erfinden; normale Konzeptlinks in anderen Abschnitten bleiben bewusst erhalten.

---

## English

Book Library turns local EPUB, PDF and audiobook folders into a searchable Obsidian library. The plugin creates readable catalog notes with covers, synopses, source links, related books and topics. Your media files stay in their original storage location.

### Features

- Incremental scanning for EPUB and PDF files.
- Local audiobook index for M4A, M4B, MP3, FLAC, OGG, Opus, WAV and AAC.
- One consistent detail view for books and audiobooks, including cover, description, ratings and sourced reviews.
- Local hybrid semantic search across title, author, categories, themes, tags, descriptions and synopses.
- Automatic audiobook enrichment through public book sources; existing local data takes precedence.
- Readable catalog notes instead of hash filenames.
- Covers from embedded files, Open Library or Google Books.
- EPUB-to-Markdown conversion.
- Explainable related books from author, category, theme and controlled semantic relevance.
- Optional AI workflows for topic wikis and cover generation.
- Local paths, web URLs, cloud folders and private storage links.
- No telemetry. External services are optional and must be enabled deliberately.

### Installation

1. Download [Book Library 0.7.8](https://obsidian-book-library.pages.dev/download/book-library-0.7.8.zip).
2. Unzip the archive.
3. Copy `main.js`, `manifest.json` and `styles.css` to:

   ```text
   <Vault>/.obsidian/plugins/book-library/
   ```

4. Enable **Book Library** under **Settings → Community plugins** in Obsidian.

### Quick start

1. Run **Set up library** or open **Setup** in the library view.
2. Choose your book folder and, optionally, an audiobook folder.
3. Review the language and detail-display settings.
4. Start indexing and check the completion summary.
5. Fetch missing covers from the free sources first.
6. Enable AI workflows only for the books you choose and with a defined budget.

If titles, authors or descriptions contain broken entities such as `&amp;`, `ï»¿` or HTML fragments, run **Repair metadata text encoding** from the Obsidian command palette. Superseded catalog files are archived rather than deleted.

### AI and privacy

Local indexing works without an AI service. Metadata and covers can be enriched through public book APIs. AI wikis and AI covers are optional and require your own provider configuration. For an AI wiki, the selected book section and up to six locally approved catalog targets with their reasons are sent to the configured provider. See [PRIVACY.md](PRIVACY.md) for details.

### How search and wiki linking work

Search runs entirely locally without an external embedding service. It normalizes German and English terms, gives title and author the strongest weights, and includes categories, themes, tags, descriptions and synopses in the relevance ranking. This is explainable hybrid semantic search over the available metadata, not a neural vector index.

For wiki links, Book Library first builds a candidate list from catalog entries that already exist. A book needs at least one strong signal: the same author, a shared category, a shared theme, or a conceptual term overlap inside a category or theme. Descriptions and titles may improve ranking but can never create a link by themselves. Up to six approved targets and their reasons are passed to the optional AI workflow; every recognized “Related books” section is then removed and replaced by one controlled whitelist. The AI therefore cannot invent missing catalog targets inside that book cross-reference section; ordinary concept links elsewhere remain intact by design.

---

## Entwicklung / Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

Die CI führt dieselben Prüfungen bei jedem Push und Pull Request aus. Ein `v*`-Tag startet die Release-Pipeline und veröffentlicht das passende ZIP mit Prüfsummen.

CI runs the same checks on every push and pull request. A `v*` tag starts the release pipeline and publishes the matching ZIP with checksums.

Aktuelle Version / Current release: **0.7.8**<br>
Lizenz / License: **MIT**
