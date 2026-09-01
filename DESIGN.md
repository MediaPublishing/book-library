# DESIGN.md — Book Library

## Produktprinzip

Book Library ist ein Katalog-first-Plugin. Die erste Sicht muss sofort
zeigen, was der Nutzer bekommt: Bücher mit Covers, Suche und Filter. AI-Wiki,
Reviews und Konvertierung sind sekundäre Modi, nie die Startfläche.

## View-Struktur

- Toolbar: lokale semantische Suche, Format-Toggle (ALL/EPUB/PDF), Scan, Bibliothek öffnen,
  Statistik.
- Tag-Chips: häufige Tags mit Anzahl, einzeln filterbar.
- Cover-Grid: Karten mit Cover, Titel, Autor, Format, Größe, Tags.
  Klick öffnet die Katalog-Notiz.
- Empty State: „Keine Bücher gefunden“ mit klarer nächster Aktion.

## Zustände

- Kein Pfad gesetzt: Notice und Hinweis in den Einstellungen.
- Pfad ungültig: Notice, kein Fehler-Reststate.
- Scan läuft: Fortschritts-Notice alle 100 Dateien und am Ende.
- Konvertierung/Wiki: Notice pro Buch mit Erfolg/Fehler.
- Stripe fehlt: expliziter Notice mit Verweis auf `stripe-runbook.md`.

## Token-Effizienz

- Metadata-first: Basis-Katalog braucht keine AI.
- Hash-/mtime-Cache: keine Datei wird doppelt gelesen.
- Chapter-Chunking mit Absatzgrenzen und Token-Schätzung.
- Ergebnis-Cache je (Buch, Provider, Modell, Sprache, Prompt-Version, geprüfte Querverweise).
- Kontrollierte Wiki-Querverweise: genau ein Abschnitt auf der Wiki-Hauptseite mit höchstens sechs bestehenden Katalogzielen aus der lokalen, erklärbaren Kandidatenliste.
- Queue mit `maxBooksPerRun` (Default 10), pausierbar über Neustart.
- Budget-Cap in Cent, lokale Harnesses zuerst.

## Design-Regeln

- Kleine, stabile Karten mit `aspect-ratio: 2/3` für Covers, keine
  Layout-Shifts bei fehlenden Covers.
- Abstände 8/10/12 px, Radius 8 px, Obsidian-Theme-Variablen statt fester
  Farben.
- Keine Marketing-Kopie im UI, keine Erklärtexte über offensichtliche
  Funktionen.
- Mobile ist in v1 außerhalb des Scopes (Desktop-Plugin).

## Visual Identity

Entschieden: bewusstes Wordmark `Book Library` mit Buch-Symbol, keine
separate Grafik-Marke. Quell-Assets unter `assets/brand/`:

- `logo.svg` (Wordmark-Variante)
- `logo-symbol.svg` (quadratisches Brand-Visual, Basis für das Favicon-Set)
- `favicon.svg`, `favicon-32.png`, `favicon-192.png`, `favicon-512.png`,
  `apple-touch-icon.png`, `webmanifest.json`

Die View nutzt weiterhin das Obsidian-Icon `book-open`; das Brand-Visual
wird für Repo, Marketplace und Product Hunt verwendet.
