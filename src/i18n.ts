export type Language = "en" | "de";
export type LanguageSetting = "auto" | Language;

export type TranslationKey =
  | "view.searchPlaceholder"
  | "view.title"
  | "view.loadMore"
  | "view.sortLabel"
  | "view.sortTitle"
  | "view.sortAuthor"
  | "view.sortYear"
  | "view.sortSize"
  | "view.sortNewest"
  | "view.sortGenre"
  | "view.badgeWiki"
  | "view.badgeMarkdown"
  | "view.badgeAudiobook"
  | "view.details"
  | "view.detailsClose"
  | "view.detailsOpenFile"
  | "view.detailsRevealInFinder"
  | "view.detailsOpenNote"
  | "view.detailsRelated"
  | "view.detailsNoRelated"
  | "view.detailsFormat"
  | "view.detailsYear"
  | "view.detailsLanguage"
  | "view.detailsPublisher"
  | "view.detailsPages"
  | "view.detailsSize"
  | "view.detailsSource"
  | "view.books"
  | "view.audiobooks"
  | "view.openAudiobook"
  | "view.noAudiobooks"
  | "view.noAudiobooksConfigured"
  | "view.loadMoreAudiobooks"
  | "view.detailsTags"
  | "view.detailsFilePath"
  | "view.detailsRatingValue"
  | "view.detailsRatingAria"
  | "view.detailsRatingUnavailable"
  | "view.detailsReviews"
  | "view.atAGlance"
  | "view.whyRead"
  | "view.whyReadFromDescription"
  | "view.whyReadUnavailable"
  | "view.whyListen"
  | "view.whyListenFromSynopsis"
  | "view.whyListenUnavailable"
  | "view.scan"
  | "view.scanning"
  | "view.setup"
  | "view.addAudiobook"
  | "view.setupAction"
  | "view.scanAction"
  | "view.addAudiobookAction"
  | "view.showFilters"
  | "view.hideFilters"
  | "view.resetFilters"
  | "view.openLibrary"
  | "view.unknownAuthor"
  | "view.empty"
  | "view.stats"
  | "view.statsBooksName"
  | "command.openLibrary"
  | "command.scan"
  | "command.scanAudiobooks"
  | "command.setup"
  | "command.addAudiobook"
  | "command.repairMetadata"
  | "manual.title"
  | "manual.titleField"
  | "manual.author"
  | "manual.storagePath"
  | "manual.sourceLink"
  | "manual.categories"
  | "manual.synopsis"
  | "manual.save"
  | "manual.cancel"
  | "manual.saved"
  | "manual.needsTitle"
  | "manual.needsValidLink"
  | "manual.saving"
  | "setup.title"
  | "setup.welcome"
  | "setup.folders"
  | "setup.options"
  | "setup.review"
  | "setup.next"
  | "setup.back"
  | "setup.finish"
  | "setup.close"
  | "setup.booksFolder"
  | "setup.audiobooksFolder"
  | "setup.chooseFolder"
  | "setup.selected"
  | "setup.notSelected"
  | "setup.privacy"
  | "setup.language"
  | "setup.detailsExpanded"
  | "setup.technicalDetailsExpanded"
  | "setup.run"
  | "setup.indexingBooks"
  | "setup.indexingAudiobooks"
  | "setup.booksIndexed"
  | "setup.audiobooksIndexed"
  | "setup.coversComplete"
  | "setup.sourceLinks"
  | "setup.relatedTopics"
  | "setup.needsBookFolder"
  | "setup.invalidBooksFolder"
  | "setup.invalidAudiobooksFolder"
  | "setup.scanSuccess"
  | "setup.scanPartial"
  | "setup.scanAmbiguous"
  | "setup.scanFailed"
  | "setup.scanSkipped"
  | "setup.scanRetry"
  | "command.convert"
  | "command.wiki"
  | "command.fetchCovers"
  | "command.aiCovers"
  | "command.wikiIndex"
  | "command.rerenderCatalog"
  | "command.openPluginFolder"
  | "command.pro"
  | "notice.noLeaf"
  | "notice.noCatalog"
  | "notice.noPath"
  | "notice.desktopOnly"
  | "notice.openFileDesktopOnly"
  | "notice.openFileMissing"
  | "notice.openFileFailed"
  | "notice.openNoteFailed"
  | "notice.openFolderDesktopOnly"
  | "notice.openFolderMissing"
  | "notice.openFolderFailed"
  | "notice.scanProgress"
  | "notice.scanDone"
  | "notice.scanDoneUnmatched"
  | "notice.convertDesktopOnly"
  | "notice.noEpubToConvert"
  | "notice.converted"
  | "notice.convertFailed"
  | "notice.wikiPro"
  | "notice.wikiDesktopOnly"
  | "notice.noWikiCandidates"
  | "notice.wikiDone"
  | "notice.wikiFailed"
  | "notice.coverBackfillStart"
  | "notice.coverBackfillProgress"
  | "notice.coverBackfillDone"
  | "notice.coverBackfillNoMissing"
  | "notice.aiCoversNeedKey"
  | "notice.aiCoversStart"
  | "notice.aiCoversDone"
  | "notice.aiCoversFailed"
  | "notice.wikiIndexDone"
  | "notice.rerenderDone"
  | "notice.repairMetadataDone"
  | "notice.repairMetadataNoIssues"
  | "notice.repairMetadataFailed"
  | "notice.proActive"
  | "notice.checkoutUnreachable"
  | "notice.checkoutEndpointUnreachable"
  | "notice.checkoutMissing"
  | "settings.mainSection"
  | "settings.language"
  | "settings.languageDesc"
  | "settings.languageAuto"
  | "settings.languageEnglish"
  | "settings.languageGerman"
  | "settings.libraryPath"
  | "settings.libraryPathDesc"
  | "settings.audiobookLibraryPath"
  | "settings.audiobookLibraryPathDesc"
  | "settings.catalogDir"
  | "settings.catalogDirDesc"
  | "settings.coversDir"
  | "settings.coversDirDesc"
  | "settings.markdownDir"
  | "settings.markdownDirDesc"
  | "settings.wikiDir"
  | "settings.wikiDirDesc"
  | "settings.formats"
  | "settings.formatsDesc"
  | "settings.tagsFromFolders"
  | "settings.tagsFromFoldersDesc"
  | "settings.fetchMetadata"
  | "settings.fetchMetadataDesc"
  | "settings.displaySection"
  | "settings.detailsExpanded"
  | "settings.detailsExpandedDesc"
  | "settings.technicalDetailsExpanded"
  | "settings.detailMode"
  | "settings.detailModeDesc"
  | "settings.detailModeProduct"
  | "settings.detailModeMinimal"
  | "settings.reviewsEnabled"
  | "settings.reviewsEnabledDesc"
  | "settings.technicalDetailsExpandedDesc"
  | "settings.aiSection"
  | "settings.provider"
  | "settings.providerDesc"
  | "settings.providerOff"
  | "settings.providerLocalModel"
  | "settings.model"
  | "settings.modelDesc"
  | "settings.openrouterKey"
  | "settings.openrouterKeyDesc"
  | "settings.aiCoverSection"
  | "settings.aiCoverProvider"
  | "settings.aiCoverProviderDesc"
  | "settings.aiCoverProviderOff"
  | "settings.aiCoverProviderOpenai"
  | "settings.openaiKey"
  | "settings.openaiKeyDesc"
  | "settings.aiCoverModel"
  | "settings.aiCoverModelDesc"
  | "settings.aiCoverSize"
  | "settings.aiCoverSizeDesc"
  | "settings.aiCoverBatch"
  | "settings.aiCoverBatchDesc"
  | "settings.budget"
  | "settings.budgetDesc"
  | "settings.maxBooks"
  | "settings.maxBooksDesc"
  | "settings.maxTokens"
  | "settings.maxTokensDesc"
  | "settings.proSection"
  | "settings.proKey"
  | "settings.proKeyDesc"
  | "settings.paymentLink"
  | "settings.paymentLinkDesc"
  | "settings.checkoutEndpoint"
  | "settings.checkoutEndpointDesc"
  | "catalog.author"
  | "catalog.summary"
  | "catalog.synopsis"
  | "catalog.description"
  | "catalog.aiSummary"
  | "catalog.metaAuthor"
  | "catalog.metaYear"
  | "catalog.metaFormat"
  | "catalog.metaPages"
  | "catalog.contents"
  | "catalog.wiki"
  | "catalog.crossReferences"
  | "catalog.relatedBooks"
  | "catalog.relatedTopics"
  | "catalog.storage"
  | "catalog.openStorage"
  | "catalog.technicalDetails"
  | "catalog.narrator"
  | "catalog.audioFormats"
  | "catalog.audioFiles"
  | "catalog.modified"
  | "catalog.categories"
  | "catalog.metadataStatus"
  | "catalog.matchStatus"
  | "catalog.synopsisSource"
  | "catalog.isbn"
  | "catalog.wikiPath"
  | "catalog.noContents"
  | "catalog.links"
  | "catalog.amazon"
  | "catalog.goodreads"
  | "catalog.related"
  | "ai.createWikiNote"
  | "ai.formatAnswer"
  | "ai.coreClaim"
  | "ai.concepts"
  | "ai.people"
  | "ai.quotes"
  | "ai.crossReferences"
  | "ai.stayFactual";

type Translation = Record<Language, string>;

export const translations: Record<TranslationKey, Translation> = {
  "view.searchPlaceholder": {
    en: "Semantically search title, author or topic ...",
    de: "Titel, Autor oder Thema semantisch suchen ...",
  },
  "view.title": { en: "Book Library", de: "Book Library" },
  "view.loadMore": { en: "Show {count} more", de: "{count} weitere anzeigen" },
  "view.sortLabel": { en: "Sort", de: "Sortieren" },
  "view.sortTitle": { en: "Title", de: "Titel" },
  "view.sortAuthor": { en: "Author", de: "Autor" },
  "view.sortYear": { en: "Year", de: "Jahr" },
  "view.sortSize": { en: "Size", de: "Größe" },
  "view.sortNewest": { en: "Newest", de: "Neueste" },
  "view.sortGenre": { en: "Genre", de: "Genre" },
  "view.badgeWiki": { en: "Wiki", de: "Wiki" },
  "view.badgeMarkdown": { en: "Markdown", de: "Markdown" },
  "view.badgeAudiobook": { en: "Audiobook", de: "Audiobook" },
  "view.details": { en: "Details", de: "Details" },
  "view.detailsClose": { en: "Close", de: "Schließen" },
  "view.detailsOpenFile": { en: "Open original file", de: "Originaldatei öffnen" },
  "view.detailsRevealInFinder": { en: "Show in Finder", de: "Im Finder zeigen" },
  "view.detailsOpenNote": { en: "Open catalog note", de: "Katalognotiz öffnen" },
  "view.detailsRelated": { en: "Related books", de: "Ähnliche Bücher" },
  "view.detailsNoRelated": {
    en: "No related books found yet.",
    de: "Noch keine ähnlichen Bücher gefunden.",
  },
  "view.detailsFormat": { en: "Format", de: "Format" },
  "view.detailsYear": { en: "Year", de: "Jahr" },
  "view.detailsLanguage": { en: "Language", de: "Sprache" },
  "view.detailsPublisher": { en: "Publisher", de: "Verlag" },
  "view.detailsPages": { en: "Pages", de: "Seiten" },
  "view.detailsSize": { en: "Size", de: "Größe" },
  "view.detailsSource": { en: "Source", de: "Quelle" },
  "view.detailsTags": { en: "Tags", de: "Tags" },
  "view.detailsFilePath": { en: "File", de: "Datei" },
  "view.detailsRatingValue": {
    en: "{rating} · {count} ratings",
    de: "{rating} · {count} Bewertungen",
  },
  "view.detailsRatingAria": {
    en: "Rated {rating} out of 5 from {count} ratings",
    de: "Bewertet mit {rating} von 5 aus {count} Bewertungen",
  },
  "view.detailsRatingUnavailable": {
    en: "Rating unavailable",
    de: "Bewertung nicht verfügbar",
  },
  "view.detailsReviews": { en: "Reviews", de: "Rezensionen" },
  "view.atAGlance": { en: "At a glance", de: "Auf einen Blick" },
  "view.whyRead": { en: "Why read this", de: "Warum lesen" },
  "view.whyReadFromDescription": {
    en: "Use the sourced description to decide whether this book matches your current question.",
    de: "Nutze die belegte Beschreibung, um zu entscheiden, ob dieses Buch zu deiner aktuellen Frage passt.",
  },
  "view.whyReadUnavailable": {
    en: "No source-backed reading reason is available yet.",
    de: "Noch kein quellenbasierter Lesegrund verfügbar.",
  },
  "view.whyListen": { en: "Why listen", de: "Warum hören" },
  "view.whyListenFromSynopsis": {
    en: "Use the sourced synopsis to decide whether this audiobook fits what you want to explore next.",
    de: "Nutze die belegte Synopsis, um zu entscheiden, ob dieses Audiobook zu deinem nächsten Thema passt.",
  },
  "view.whyListenUnavailable": {
    en: "No source-backed listening reason is available yet.",
    de: "Noch kein quellenbasierter Hörgrund verfügbar.",
  },
  "view.scan": { en: "Scan", de: "Scan" },
  "view.scanning": { en: "Scanning ...", de: "Scanne ..." },
  "view.setup": { en: "Setup", de: "Einrichten" },
  "view.addAudiobook": { en: "Add audiobook", de: "Audiobook hinzufügen" },
  "view.showFilters": { en: "Filters", de: "Filter" },
  "view.hideFilters": { en: "Hide filters", de: "Filter ausblenden" },
  "view.resetFilters": { en: "Reset filters", de: "Filter zurücksetzen" },
  "view.openLibrary": { en: "Open catalog folder", de: "Katalogordner öffnen" },
  "view.unknownAuthor": { en: "Unknown author", de: "Unbekannter Autor" },
  "view.empty": {
    en: "No books found. Set the path in settings and start a scan.",
    de: "Keine Bücher gefunden. Pfad in den Einstellungen setzen und Scan starten.",
  },
  "view.setupAction": { en: "Open setup", de: "Einrichtung öffnen" },
  "view.scanAction": { en: "Scan now", de: "Jetzt scannen" },
  "view.addAudiobookAction": { en: "Add audiobook", de: "Audiobook hinzufügen" },
  "view.stats": { en: "{count} of {total}", de: "{count} von {total}" },
  "view.statsBooksName": { en: "books", de: "Bücher" },
  "view.books": { en: "Books", de: "Bücher" },
  "view.audiobooks": { en: "Audiobooks", de: "Audiobooks" },
  "view.openAudiobook": { en: "Open audiobook", de: "Audiobook öffnen" },
  "view.noAudiobooks": { en: "No audiobooks match this filter.", de: "Keine Audiobooks entsprechen dem aktuellen Filter." },
  "view.noAudiobooksConfigured": {
    en: "No audiobooks indexed yet. Scan a folder or add one manually.",
    de: "Noch keine Audiobooks indexiert. Scanne einen Ordner oder lege einen manuell an.",
  },
  "view.loadMoreAudiobooks": { en: "Load more audiobooks", de: "Weitere Audiobooks laden" },
  "command.openLibrary": { en: "Open Book Library", de: "Book Library öffnen" },
  "command.scan": { en: "Scan library", de: "Bibliothek scannen" },
  "command.scanAudiobooks": { en: "Scan audiobook folder", de: "Audiobook-Ordner scannen" },
  "command.setup": { en: "Set up library", de: "Bibliothek einrichten" },
  "command.addAudiobook": {
    en: "Add audiobook manually",
    de: "Audiobook manuell hinzufügen",
  },
  "command.repairMetadata": {
    en: "Repair metadata text encoding",
    de: "Metadaten-Textkodierung reparieren",
  },
  "manual.title": { en: "Add audiobook", de: "Audiobook hinzufügen" },
  "manual.titleField": { en: "Title", de: "Titel" },
  "manual.author": { en: "Author", de: "Autor" },
  "manual.storagePath": { en: "Storage path or folder", de: "Ablagepfad oder Ordner" },
  "manual.sourceLink": { en: "Source link (optional)", de: "Ablage-Link (optional)" },
  "manual.categories": {
    en: "Categories (comma-separated)",
    de: "Kategorien (kommagetrennt)",
  },
  "manual.synopsis": { en: "Synopsis", de: "Synopsis" },
  "manual.save": { en: "Save", de: "Speichern" },
  "manual.cancel": { en: "Cancel", de: "Abbrechen" },
  "manual.saved": { en: "Audiobook saved: {title}", de: "Audiobook gespeichert: {title}" },
  "manual.needsTitle": { en: "Title is required.", de: "Titel ist erforderlich." },
  "manual.needsValidLink": {
    en: "Source link must start with https:// or http://",
    de: "Der Ablage-Link muss mit https:// oder http:// beginnen.",
  },
  "manual.saving": { en: "Saving ...", de: "Speichert ..." },
  "setup.title": { en: "Set up Book Library", de: "Book Library einrichten" },
  "setup.welcome": {
    en: "Connect your existing folders, review indexing options, and create a local Obsidian catalog. Your media files stay where they are.",
    de: "Verbinde bestehende Ordner, prüfe die Indexierungsoptionen und erstelle einen lokalen Obsidian-Katalog. Deine Mediendateien bleiben an ihrem Ort.",
  },
  "setup.folders": { en: "1. Choose folders", de: "1. Ordner wählen" },
  "setup.options": { en: "2. Review options", de: "2. Optionen prüfen" },
  "setup.review": { en: "3. Index and verify", de: "3. Indexieren und prüfen" },
  "setup.next": { en: "Next", de: "Weiter" },
  "setup.back": { en: "Back", de: "Zurück" },
  "setup.finish": { en: "Finish", de: "Fertig" },
  "setup.close": { en: "Close", de: "Schließen" },
  "setup.booksFolder": { en: "Books folder", de: "Bücher-Ordner" },
  "setup.audiobooksFolder": { en: "Audiobooks folder (optional)", de: "Audiobook-Ordner (optional)" },
  "setup.chooseFolder": { en: "Choose folder", de: "Ordner wählen" },
  "setup.selected": { en: "Selected", de: "Ausgewählt" },
  "setup.notSelected": { en: "Not selected", de: "Nicht ausgewählt" },
  "setup.privacy": {
    en: "Local-first: scanning reads file metadata only. Public metadata and AI are separate opt-in actions.",
    de: "Local-first: Das Scannen liest nur Dateimetadaten. Öffentliche Metadaten und AI sind separate Opt-in-Aktionen.",
  },
  "setup.language": { en: "Language", de: "Sprache" },
  "setup.detailsExpanded": { en: "Open details by default", de: "Details standardmäßig öffnen" },
  "setup.technicalDetailsExpanded": {
    en: "Show technical fields expanded",
    de: "Technische Felder ausgeklappt zeigen",
  },
  "setup.run": { en: "Start indexing", de: "Indexierung starten" },
  "setup.indexingBooks": { en: "Indexing books ...", de: "Indexiere Bücher ..." },
  "setup.indexingAudiobooks": { en: "Indexing audiobooks ...", de: "Indexiere Audiobooks ..." },
  "setup.booksIndexed": { en: "Books indexed: {count}", de: "Bücher indexiert: {count}" },
  "setup.audiobooksIndexed": { en: "Audiobooks indexed: {count}", de: "Audiobooks indexiert: {count}" },
  "setup.coversComplete": { en: "Covers complete: {covered}/{total}", de: "Covers vollständig: {covered}/{total}" },
  "setup.sourceLinks": { en: "Source links: {count}", de: "Ablage-Links: {count}" },
  "setup.relatedTopics": { en: "Entries with related topics: {count}", de: "Einträge mit verwandten Themen: {count}" },
  "setup.needsBookFolder": {
    en: "Choose a books folder before indexing.",
    de: "Wähle vor der Indexierung einen Bücher-Ordner.",
  },
  "setup.invalidBooksFolder": {
    en: "The books path must be a readable folder.",
    de: "Der Bücher-Pfad muss auf einen lesbaren Ordner zeigen.",
  },
  "setup.invalidAudiobooksFolder": {
    en: "The audiobooks path must be a readable folder, or be left empty.",
    de: "Der Audiobook-Pfad muss auf einen lesbaren Ordner zeigen oder leer bleiben.",
  },
  "setup.scanSuccess": { en: "Books and audiobooks indexed successfully.", de: "Bücher und Audiobooks erfolgreich indexiert." },
  "setup.scanPartial": { en: "Indexing finished partially. Review the results and retry when needed.", de: "Indexierung teilweise abgeschlossen. Prüfe die Ergebnisse und wiederhole sie bei Bedarf." },
  "setup.scanAmbiguous": { en: "Some entries need review before the setup can be considered complete.", de: "Einige Einträge müssen geprüft werden, bevor die Einrichtung abgeschlossen ist." },
  "setup.scanFailed": { en: "Indexing failed. No success is reported; retry after fixing the issue.", de: "Indexierung fehlgeschlagen. Es wird kein Erfolg gemeldet. Behebe das Problem und wiederhole den Vorgang." },
  "setup.scanSkipped": { en: "Indexing was skipped. Check the path and retry.", de: "Indexierung wurde übersprungen. Prüfe den Pfad und wiederhole den Vorgang." },
  "setup.scanRetry": { en: "Retry indexing after fixing the reported issue.", de: "Wiederhole die Indexierung nach Behebung des gemeldeten Problems." },
  "command.convert": {
    en: "EPUB to Markdown (next books)",
    de: "EPUB→Markdown (nächste Bücher)",
  },
  "command.wiki": {
    en: "Generate related-topic wiki (next books)",
    de: "Verwandte-Themen-Wiki generieren (nächste Bücher)",
  },
  "command.fetchCovers": {
    en: "Fetch missing covers (free metadata)",
    de: "Fehlende Covers abrufen (freie Metadaten)",
  },
  "command.aiCovers": {
    en: "Generate missing covers with AI (batch)",
    de: "Fehlende Covers mit AI generieren (Batch)",
  },
  "command.wikiIndex": {
    en: "Build wiki index",
    de: "Wiki-Index erstellen",
  },
  "command.rerenderCatalog": {
    en: "Re-render catalog notes",
    de: "Katalognotizen neu rendern",
  },
  "command.openPluginFolder": {
    en: "Open plugin folder",
    de: "Plugin-Ordner öffnen",
  },
  "command.pro": { en: "Buy Pro / enter license", de: "Pro kaufen / Lizenz eintragen" },
  "notice.noLeaf": { en: "No workspace leaf available.", de: "Kein Workspace-Blatt verfügbar." },
  "notice.noCatalog": {
    en: "Catalog does not exist yet. Run a scan first.",
    de: "Katalog existiert noch nicht. Scan zuerst ausführen.",
  },
  "notice.noPath": {
    en: "Book folder path is missing or does not exist.",
    de: "Buchordner-Pfad fehlt oder existiert nicht.",
  },
  "notice.desktopOnly": {
    en: "This action works only in the Obsidian desktop app.",
    de: "Diese Aktion funktioniert nur in der Obsidian-Desktop-App.",
  },
  "notice.openFileDesktopOnly": {
    en: "Opening EPUB/PDF files is only available in the desktop app.",
    de: "EPUB- und PDF-Dateien lassen sich nur in der Desktop-App öffnen.",
  },
  "notice.openFileMissing": {
    en: "Original file not found: {title}",
    de: "Originaldatei nicht gefunden: {title}",
  },
  "notice.openFileFailed": {
    en: "Could not open original file: {title}",
    de: "Originaldatei konnte nicht geöffnet werden: {title}",
  },
  "notice.openNoteFailed": {
    en: "Could not open catalog note: {title}",
    de: "Katalognotiz konnte nicht geöffnet werden: {title}",
  },
  "notice.openFolderDesktopOnly": {
    en: "Opening the containing folder is only available in the desktop app.",
    de: "Der enthaltende Ordner lässt sich nur in der Desktop-App öffnen.",
  },
  "notice.openFolderMissing": {
    en: "Containing folder not found: {title}",
    de: "Enthaltender Ordner nicht gefunden: {title}",
  },
  "notice.openFolderFailed": {
    en: "Could not open containing folder: {title}",
    de: "Enthaltender Ordner konnte nicht geöffnet werden: {title}",
  },
  "notice.scanProgress": { en: "Scan: {scanned}/{total}", de: "Scan: {scanned}/{total}" },
  "notice.scanDone": {
    en: "Library scanned: {added} new, {updated} updated.{unmatched}",
    de: "Bibliothek gescannt: {added} neu, {updated} aktualisiert.{unmatched}",
  },
  "notice.scanDoneUnmatched": {
    en: " {count} without local metadata (see catalog).",
    de: " {count} ohne lokale Metadaten (siehe Katalog).",
  },
  "notice.convertDesktopOnly": {
    en: "Conversion works only in the desktop app.",
    de: "Konvertierung nur in der Desktop-App.",
  },
  "notice.noEpubToConvert": {
    en: "No EPUB files without Markdown found.",
    de: "Keine EPUB-Dateien ohne Markdown gefunden.",
  },
  "notice.converted": { en: "Converted: {title}", de: "Konvertiert: {title}" },
  "notice.convertFailed": {
    en: "Conversion failed: {title}",
    de: "Konvertierung fehlgeschlagen: {title}",
  },
  "notice.wikiPro": {
    en: "The AI wiki is a Pro feature. Enter a Pro license in settings.",
    de: "Das AI-Wiki ist ein Pro-Feature. Trage eine Pro-Lizenz in den Einstellungen ein.",
  },
  "notice.wikiDesktopOnly": {
    en: "Wiki generation works only in the desktop app.",
    de: "Wiki nur in der Desktop-App.",
  },
  "notice.noWikiCandidates": {
    en: "No books with Markdown and without wiki found.",
    de: "Keine Bücher mit Markdown ohne Wiki gefunden.",
  },
  "notice.wikiDone": {
    en: "Wiki finished: {title} ({tokens} tokens, {cost} cents)",
    de: "Wiki fertig: {title} ({tokens} Tokens, {cost} Cent)",
  },
  "notice.wikiFailed": { en: "Wiki failed: {title}", de: "Wiki fehlgeschlagen: {title}" },
  "notice.coverBackfillStart": {
    en: "Fetching covers for {count} books ...",
    de: "Hole Covers für {count} Bücher ...",
  },
  "notice.coverBackfillProgress": {
    en: "Covers: {done}/{total}",
    de: "Covers: {done}/{total}",
  },
  "notice.coverBackfillDone": {
    en: "Cover backfill done: {added} added, {skipped} skipped.",
    de: "Cover-Backfill fertig: {added} ergänzt, {skipped} übersprungen.",
  },
  "notice.coverBackfillNoMissing": {
    en: "All books already have covers.",
    de: "Alle Bücher haben bereits ein Cover.",
  },
  "notice.aiCoversNeedKey": {
    en: "OpenAI API key missing. Add it in settings under AI Covers.",
    de: "OpenAI-API-Key fehlt. In den Einstellungen unter AI-Covers eintragen.",
  },
  "notice.aiCoversStart": {
    en: "Generating AI covers for {count} books ({batch} per sheet) ...",
    de: "Generiere AI-Covers für {count} Bücher ({batch} pro Sheet) ...",
  },
  "notice.aiCoversDone": {
    en: "AI covers done: {added} added, {failed} failed.",
    de: "AI-Covers fertig: {added} ergänzt, {failed} fehlgeschlagen.",
  },
  "notice.aiCoversFailed": {
    en: "AI cover generation failed: {message}",
    de: "AI-Cover-Generierung fehlgeschlagen: {message}",
  },
  "notice.wikiIndexDone": {
    en: "Wiki index updated.",
    de: "Wiki-Index aktualisiert.",
  },
  "notice.rerenderDone": {
    en: "Catalog notes re-rendered: {count}.",
    de: "Katalognotizen neu gerendert: {count}.",
  },
  "notice.repairMetadataDone": {
    en: "Metadata repaired: {count} entries updated.",
    de: "Metadaten repariert: {count} Einträge aktualisiert.",
  },
  "notice.repairMetadataNoIssues": {
    en: "No metadata encoding issues found.",
    de: "Keine Metadaten-Kodierungsprobleme gefunden.",
  },
  "notice.repairMetadataFailed": {
    en: "Metadata repair failed: {message}",
    de: "Metadaten-Reparatur fehlgeschlagen: {message}",
  },
  "notice.proActive": { en: "Pro license is active.", de: "Pro-Lizenz ist aktiv." },
  "notice.checkoutUnreachable": {
    en: "Checkout endpoint configured but unreachable. Check Stripe setup.",
    de: "Checkout-Endpoint konfiguriert, aber nicht erreichbar. Stripe-Setup prüfen.",
  },
  "notice.checkoutEndpointUnreachable": {
    en: "Checkout endpoint unreachable.",
    de: "Checkout-Endpoint nicht erreichbar.",
  },
  "notice.checkoutMissing": {
    en: "No Stripe Payment Link or checkout endpoint configured. See stripe-runbook.md.",
    de: "Kein Stripe Payment Link oder Checkout-Endpoint konfiguriert. Setup siehe stripe-runbook.md.",
  },
  "settings.mainSection": { en: "Book Library", de: "Book Library" },
  "settings.language": { en: "Language", de: "Sprache" },
  "settings.languageDesc": {
    en: "Auto uses the language of your Obsidian installation. English is the fallback.",
    de: "Auto nutzt die Sprache deiner Obsidian-Installation. Englisch ist der Fallback.",
  },
  "settings.languageAuto": { en: "Auto", de: "Auto" },
  "settings.languageEnglish": { en: "English", de: "Englisch" },
  "settings.languageGerman": { en: "German", de: "Deutsch" },
  "settings.libraryPath": { en: "Book folder (path)", de: "Buchordner (Pfad)" },
  "settings.libraryPathDesc": {
    en: "Absolute path to your local EPUB/PDF collection. It may lie outside the vault.",
    de: "Absoluter Pfad zu deiner lokalen EPUB-/PDF-Sammlung. Er darf außerhalb des Vaults liegen.",
  },
  "settings.audiobookLibraryPath": { en: "Audiobook folder (path)", de: "Audiobook-Ordner (Pfad)" },
  "settings.audiobookLibraryPathDesc": {
    en: "Optional absolute path to a local audiobook folder. Audio files stay where they are; only catalog data enters the vault.",
    de: "Optionaler absoluter Pfad zu einem lokalen Audiobook-Ordner. Audiodateien bleiben dort; nur Katalogdaten kommen in den Vault.",
  },
  "settings.catalogDir": { en: "Catalog folder", de: "Katalog-Ordner" },
  "settings.catalogDirDesc": {
    en: "Relative vault path for the Markdown catalog files.",
    de: "Relativer Vault-Pfad für die Markdown-Katalogdateien.",
  },
  "settings.coversDir": { en: "Cover folder", de: "Cover-Ordner" },
  "settings.coversDirDesc": {
    en: "Relative vault path for cover files.",
    de: "Relativer Vault-Pfad für Cover-Dateien.",
  },
  "settings.markdownDir": { en: "Markdown output folder", de: "Markdown-Zielordner" },
  "settings.markdownDirDesc": {
    en: "Relative vault path for EPUB-to-Markdown results.",
    de: "Relativer Vault-Pfad für EPUB→Markdown-Ergebnisse.",
  },
  "settings.wikiDir": { en: "Wiki folder", de: "Wiki-Ordner" },
  "settings.wikiDirDesc": {
    en: "Relative vault path for related-topic wiki pages.",
    de: "Relativer Vault-Pfad für Wiki-Seiten zu verwandten Themen.",
  },
  "settings.formats": { en: "File formats", de: "Dateiformate" },
  "settings.formatsDesc": {
    en: "Comma-separated extensions to scan.",
    de: "Kommagetrennte Erweiterungen, die gescannt werden.",
  },
  "settings.tagsFromFolders": { en: "Tags from folders", de: "Tags aus Ordnern" },
  "settings.tagsFromFoldersDesc": {
    en: "Use folder paths as tags, e.g. 02 Sachbuch/Geschichte.",
    de: "Ordnerpfade als Tags übernehmen, z. B. 02 Sachbuch/Geschichte.",
  },
  "settings.fetchMetadata": { en: "Fetch metadata and covers", de: "Metadaten und Covers abrufen" },
  "settings.fetchMetadataDesc": {
    en: "Open Library and Google Books as free sources. No API key needed.",
    de: "Open Library und Google Books als freie Quellen. Ohne API-Key.",
  },
  "settings.displaySection": { en: "Display", de: "Darstellung" },
  "settings.detailsExpanded": { en: "Open details by default", de: "Details standardmäßig öffnen" },
  "settings.detailsExpandedDesc": {
    en: "Controls whether the details popover starts open or collapsed.",
    de: "Steuert, ob das Detail-Popover geöffnet oder eingeklappt startet.",
  },
  "settings.technicalDetailsExpanded": {
    en: "Show technical fields expanded",
    de: "Technische Felder ausgeklappt zeigen",
  },
  "settings.technicalDetailsExpandedDesc": {
    en: "Shows rare metadata in an expanded technical section instead of collapsed.",
    de: "Zeigt seltene Metadaten in einem ausgeklappten technischen Bereich statt eingeklappt.",
  },
  "settings.detailMode": { en: "Detail view style", de: "Detailansicht" },
  "settings.detailModeDesc": {
    en: "Product puts synopsis and reviews first; Minimal shows a compact note view.",
    de: "Produkt stellt Synopsis und Rezensionen nach vorne; Minimal zeigt eine kompakte Notizansicht.",
  },
  "settings.detailModeProduct": { en: "Product (Amazon-style)", de: "Produkt (Amazon-Stil)" },
  "settings.detailModeMinimal": { en: "Minimal (note)", de: "Minimal (Notiz)" },
  "settings.reviewsEnabled": { en: "Enable public reviews", de: "Öffentliche Rezensionen aktivieren" },
  "settings.reviewsEnabledDesc": {
    en: "Shows public reviews already stored in your local catalog. This setting never downloads or sends data.",
    de: "Zeigt öffentliche Rezensionen, die bereits im lokalen Katalog gespeichert sind. Diese Einstellung lädt nichts herunter und sendet keine Daten.",
  },
  "settings.aiSection": { en: "AI Wiki", de: "AI-Wiki" },
  "settings.provider": { en: "Provider", de: "Provider" },
  "settings.providerDesc": {
    en: "Local harnesses first. OpenRouter only with your own key and budget.",
    de: "Lokale Harnesses zuerst. OpenRouter nur mit eigenem Key und Budget.",
  },
  "settings.providerOff": { en: "Off", de: "Aus" },
  "settings.providerLocalModel": {
    en: "Local model (custom command)",
    de: "Lokales Modell (eigener Befehl)",
  },
  "settings.model": { en: "Model", de: "Modell" },
  "settings.modelDesc": {
    en: "OpenRouter model or local model. Optional for CLIs.",
    de: "OpenRouter-Modell oder lokales Modell. Bei CLIs optional.",
  },
  "settings.openrouterKey": { en: "OpenRouter API key", de: "OpenRouter API-Key" },
  "settings.openrouterKeyDesc": {
    en: "Stored only in plugin data locally and sent to OpenRouter only on explicit start.",
    de: "Wird nur lokal in plugin data gespeichert und nur bei explizitem Start an OpenRouter gesendet.",
  },
  "settings.aiCoverSection": { en: "AI Covers", de: "AI-Covers" },
  "settings.aiCoverProvider": { en: "Cover provider", de: "Cover-Anbieter" },
  "settings.aiCoverProviderDesc": {
    en: "Generate covers in batches for books without local or free metadata covers.",
    de: "Generiert Covers in Batches für Bücher ohne lokales oder freies Cover.",
  },
  "settings.aiCoverProviderOff": { en: "Off", de: "Aus" },
  "settings.aiCoverProviderOpenai": { en: "OpenAI (GPT-Image)", de: "OpenAI (GPT-Image)" },
  "settings.openaiKey": { en: "OpenAI API key", de: "OpenAI-API-Key" },
  "settings.openaiKeyDesc": {
    en: "Stored only locally in plugin data. Sent to OpenAI only when you start AI cover generation.",
    de: "Wird nur lokal in plugin data gespeichert. Wird nur bei explizitem AI-Cover-Start an OpenAI gesendet.",
  },
  "settings.aiCoverModel": { en: "Image model", de: "Bildmodell" },
  "settings.aiCoverModelDesc": {
    en: "OpenAI image model, e.g. gpt-image-1.",
    de: "OpenAI-Bildmodell, z. B. gpt-image-1.",
  },
  "settings.aiCoverSize": { en: "Sheet size", de: "Sheet-Größe" },
  "settings.aiCoverSizeDesc": {
    en: "Square size for the batch sheet. Larger sheets cost more.",
    de: "Quadratische Größe für das Batch-Sheet. Größere Sheets kosten mehr.",
  },
  "settings.aiCoverBatch": { en: "Covers per sheet", de: "Covers pro Sheet" },
  "settings.aiCoverBatchDesc": {
    en: "Grid count, e.g. 4 means a 2x2 sheet that is sliced afterwards.",
    de: "Grid-Anzahl, z. B. 4 bedeutet ein 2x2-Sheet, das danach zerschnitten wird.",
  },
  "settings.budget": { en: "Budget (cents)", de: "Budget (Cent)" },
  "settings.budgetDesc": {
    en: "Hard limit per run. 0 does not disable the limit; minimum is 1.",
    de: "Harte Obergrenze pro Lauf. 0 deaktiviert das Limit nicht; Mindestwert 1.",
  },
  "settings.maxBooks": { en: "Max books per run", de: "Max. Bücher pro Lauf" },
  "settings.maxBooksDesc": {
    en: "Queue limit so a run stays pausable and token-efficient.",
    de: "Queue-Limit, damit ein Lauf pausierbar und token-effizient bleibt.",
  },
  "settings.maxTokens": { en: "Max tokens per book", de: "Max. Tokens pro Buch" },
  "settings.maxTokensDesc": {
    en: "Estimate for the chunking limit per book.",
    de: "Schätzwert für das Chunking-Limit pro Buch.",
  },
  "settings.proSection": { en: "Pro / Stripe", de: "Pro / Stripe" },
  "settings.proKey": { en: "Pro license key", de: "Pro-Lizenzschlüssel" },
  "settings.proKeyDesc": {
    en: "Manual local activation for v1. The key is not validated by a license server.",
    de: "Manuelle lokale Aktivierung in v1. Der Schlüssel wird nicht durch einen Lizenzserver validiert.",
  },
  "settings.paymentLink": { en: "Stripe Payment Link", de: "Stripe Payment Link" },
  "settings.paymentLinkDesc": {
    en: "Direct checkout link for Pro. Optional without a backend.",
    de: "Direkter Checkout-Link für Pro. Optional ohne Backend.",
  },
  "settings.checkoutEndpoint": { en: "Checkout endpoint", de: "Checkout-Endpoint" },
  "settings.checkoutEndpointDesc": {
    en: "Optional Cloudflare Worker endpoint that creates a Stripe Checkout Session.",
    de: "Optionaler Cloudflare-Worker-Endpoint, der eine Stripe Checkout Session erzeugt.",
  },
  "catalog.author": { en: "**Author:** {value}", de: "**Autor:** {value}" },
  "catalog.summary": { en: "## Summary", de: "## Zusammenfassung" },
  "catalog.synopsis": { en: "Synopsis", de: "Synopsis" },
  "catalog.description": { en: "Description", de: "Beschreibung" },
  "catalog.aiSummary": { en: "AI summary", de: "AI-Zusammenfassung" },
  "catalog.metaAuthor": { en: "Author", de: "Autor" },
  "catalog.metaYear": { en: "Year", de: "Jahr" },
  "catalog.metaFormat": { en: "Format", de: "Format" },
  "catalog.metaPages": { en: "Pages", de: "Seiten" },
  "catalog.contents": { en: "Contents", de: "Inhalt" },
  "catalog.wiki": { en: "Wiki", de: "Wiki" },
  "catalog.crossReferences": { en: "Cross-references", de: "Querverweise" },
  "catalog.relatedBooks": { en: "Related books", de: "Ähnliche Bücher" },
  "catalog.relatedTopics": { en: "Related topics", de: "Verwandte Themen" },
  "catalog.storage": { en: "Storage", de: "Ablageort" },
  "catalog.openStorage": { en: "Open location", de: "Ablageort öffnen" },
  "catalog.technicalDetails": { en: "Technical details", de: "Technische Details" },
  "catalog.narrator": { en: "Narrator", de: "Sprecher" },
  "catalog.audioFormats": { en: "Audio formats", de: "Audioformate" },
  "catalog.audioFiles": { en: "Files", de: "Dateien" },
  "catalog.modified": { en: "Modified", de: "Geändert" },
  "catalog.categories": { en: "Categories", de: "Kategorien" },
  "catalog.metadataStatus": { en: "Metadata status", de: "Metadaten-Status" },
  "catalog.matchStatus": { en: "Match status", de: "Zuordnungsstatus" },
  "catalog.synopsisSource": { en: "Synopsis source", de: "Synopsis-Quelle" },
  "catalog.isbn": { en: "ISBN", de: "ISBN" },
  "catalog.wikiPath": { en: "Wiki", de: "Wiki" },
  "catalog.noContents": {
    en: "No contents yet. Run EPUB to Markdown and wiki generation.",
    de: "Noch kein Inhalt erfasst. EPUB→Markdown und Wiki-Generierung ausführen.",
  },
  "catalog.links": { en: "Links", de: "Links" },
  "catalog.amazon": { en: "Amazon search", de: "Amazon-Suche" },
  "catalog.goodreads": { en: "Goodreads search", de: "Goodreads-Suche" },
  "catalog.related": { en: "## Related", de: "## Related" },
  "ai.createWikiNote": {
    en: "Create a compact wiki note about concepts and connections in this book section.",
    de: "Erstelle eine kompakte Wiki-Notiz über Konzepte und Zusammenhänge dieses Buchabschnitts.",
  },
  "ai.formatAnswer": {
    en: "Format the answer as Markdown with exactly these sections:",
    de: "Formatiere die Antwort als Markdown mit genau diesen Abschnitten:",
  },
  "ai.coreClaim": {
    en: "## Core claim (2-3 sentences)",
    de: "## Kernaussage (2-3 Sätze)",
  },
  "ai.concepts": {
    en: "## Concepts (bullet list, 1-2 sentences each)",
    de: "## Konzepte (Bullet-Liste mit je 1-2 Sätzen)",
  },
  "ai.people": {
    en: "## People (only if named, with role)",
    de: "## Personen (nur falls genannt, mit Rolle)",
  },
  "ai.quotes": {
    en: "## Quotes and key passages (with page/chapter hint if available)",
    de: "## Zitate und Schlüsselstellen (mit Seiten-/Kapitelhinweis, falls vorhanden)",
  },
  "ai.crossReferences": {
    en: "## Cross-references to other books (only if unambiguous)",
    de: "## Querverweise auf andere Bücher (nur falls eindeutig)",
  },
  "ai.stayFactual": {
    en: "Stay with the facts of the text. Do not invent anything. Answer only with the Markdown note.",
    de: "Bleib bei den Fakten des Textes. Erfinde nichts. Antwort nur mit der Markdown-Notiz.",
  },
};

export function resolveLanguage(
  setting: LanguageSetting,
  systemLanguage: string
): Language {
  if (setting === "en" || setting === "de") return setting;
  return systemLanguage.toLowerCase().startsWith("de") ? "de" : "en";
}

export function detectSystemLanguage(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en";
}

export function translate(
  language: Language,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const entry = translations[key];
  if (!entry) return key;
  let text = entry[language] ?? entry.en;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
