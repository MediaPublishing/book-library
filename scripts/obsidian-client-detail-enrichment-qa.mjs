import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] || "19475");
const outputDir = process.argv[3] || ".gstack/qa-reports/screenshots";
if (!Number.isInteger(port) || port <= 0) throw new Error("Ungültiger Debug-Port.");
fs.mkdirSync(outputDir, { recursive: true });

const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page" && candidate.url === "app://obsidian.md/index.html");
if (!page?.webSocketDebuggerUrl) throw new Error("Keine Obsidian-Clientseite gefunden.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
let nextId = 1;
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || "Unknown exception");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    consoleErrors.push(message.params.entry.text || "Unknown log error");
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Obsidian-Auswertung fehlgeschlagen.");
  }
  return result.result.value;
}

async function screenshot(name) {
  const target = path.join(outputDir, name);
  const capture = await command("Page.captureScreenshot", { format: "jpeg", quality: 92, captureBeyondViewport: false });
  fs.writeFileSync(target, Buffer.from(capture.data, "base64"));
  return target;
}

await command("Runtime.enable");
await command("Log.enable");

const pilot = await evaluate(`(async () => {
  await app.plugins.setEnable(true);
  if (app.plugins.plugins['book-library']) await app.plugins.unloadPlugin('book-library');
  await app.plugins.loadPlugin('book-library');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const plugin = app.plugins.plugins['book-library'];
  if (!plugin) return { diagnostic: {
    manifest: app.plugins.manifests['book-library'] || null,
    enabled: Array.from(app.plugins.enabledPlugins || []),
    restrictedMode: app.plugins.restrictedMode,
    ownKeys: Object.keys(app.plugins),
    prototypeMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(app.plugins)),
    loadError: app.plugins.loadErrors?.get?.('book-library') || app.plugins.loadErrors?.['book-library'] || '',
  }};
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const indexing = Array.from(document.querySelectorAll('.notice')).some((item) => /Indexing vault/i.test(item.textContent || ''));
    if (app.metadataCache.initialized && !indexing) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const markdownLeaves = app.workspace.getLeavesOfType('markdown');
  for (const leaf of markdownLeaves.slice(1)) leaf.detach();
  await plugin.enrichMichaelHudsonPilot();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const books = plugin.getBooks().filter((book) => /michael hudson/i.test(book.author) && /junk economics|forgive them their debts/i.test(book.title));
  return {
    version: app.plugins.manifests['book-library']?.version || '',
    books: books.map((book) => ({
      title: book.title,
      authorIdentity: book.authorIdentity?.id || '',
      ratings: book.sourceRatings?.length || 0,
      descriptions: book.sourceDescriptions?.length || 0,
      amazonEdition: book.externalIdentities?.find((identity) => identity.source === 'amazon')?.editionId || '',
    })),
  };
})()`);

if (pilot.diagnostic) {
  socket.close();
  console.log(JSON.stringify(pilot, null, 2));
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(2);
}

const desktop = await evaluate(`(async () => {
  const plugin = app.plugins.plugins['book-library'];
  await plugin.activateView();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const input = document.querySelector('.book-library-search');
  if (!input) throw new Error('Book Library search is not visible');
  input.value = 'J Is for Junk Economics';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const card = Array.from(document.querySelectorAll('.book-library-card')).find((item) => /J Is for Junk Economics/i.test(item.textContent || ''));
  if (!card) throw new Error('Pilot book card not found');
  const details = card.querySelector('.book-library-details');
  if (!details) throw new Error('Pilot book details action not found');
  details.click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  const modal = document.querySelector('.book-library-modal');
  const title = modal?.querySelector('.book-library-modal-title');
  const cover = modal?.querySelector('.book-library-modal-cover');
  const author = modal?.querySelector('.book-library-modal-author');
  if (!modal || !title || !author) throw new Error('Detail modal did not open');
  const labels = Array.from(modal.querySelectorAll('h3, .book-library-modal-rating-item, .book-library-modal-description-source'))
    .map((item) => item.textContent?.trim() || '').filter(Boolean);
  return {
    modalClientWidth: modal.clientWidth,
    modalScrollWidth: modal.scrollWidth,
    titleClientWidth: title.clientWidth,
    titleScrollWidth: title.scrollWidth,
    coverWidth: cover?.getBoundingClientRect().width || 0,
    authorTag: author.tagName,
    authorTabIndex: author.tabIndex,
    labels,
    actionLabels: Array.from(modal.querySelectorAll('button')).map((button) => button.textContent?.trim() || '').filter(Boolean),
  };
})()`);
const desktopScreenshot = await screenshot("book-detail-enrichment-desktop-2026-08-29.jpg");

const author = await evaluate(`(async () => {
  const plugin = app.plugins.plugins['book-library'];
  const originalOpenAuthorProfile = plugin.openAuthorProfile.bind(plugin);
  let calls = 0;
  let settled = false;
  let error = '';
  plugin.openAuthorProfile = async (...args) => {
    calls += 1;
    try {
      return await originalOpenAuthorProfile(...args);
    } catch (cause) {
      error = String(cause);
      throw cause;
    } finally {
      settled = true;
    }
  };
  const button = document.querySelector('.book-library-modal-author');
  button?.click();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((app.workspace.getActiveFile()?.path || '').includes('/authors/') || settled) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  plugin.openAuthorProfile = originalOpenAuthorProfile;
  const activeFile = app.workspace.getActiveFile()?.path || '';
  const activeContent = activeFile ? await app.vault.adapter.read(activeFile) : '';
  return {
    calls,
    settled,
    error,
    activeFile,
    ownedProfile: activeContent.includes('book-library-generated: true'),
    openFiles: app.workspace.getLeavesOfType('markdown').map((leaf) => leaf.getViewState().state?.file || '').filter(Boolean),
    notices: Array.from(document.querySelectorAll('.notice')).map((item) => item.textContent?.trim() || '').filter(Boolean),
    headings: Array.from(document.querySelectorAll('.markdown-preview-view h1, .markdown-preview-view h2')).map((item) => item.textContent?.trim() || '').filter(Boolean),
  };
})()`);

await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const narrow = await evaluate(`(async () => {
  const plugin = app.plugins.plugins['book-library'];
  await plugin.activateView();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const input = document.querySelector('.book-library-search');
  input.value = 'J Is for Junk Economics';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const card = document.querySelector('.book-library-card');
  card?.querySelector('.book-library-details')?.click();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const modal = document.querySelector('.book-library-modal');
  const title = modal?.querySelector('.book-library-modal-title');
  const cover = modal?.querySelector('.book-library-modal-cover');
  const related = modal?.querySelector('.book-library-related-list');
  const rect = modal?.getBoundingClientRect();
  return {
    viewportWidth: window.innerWidth,
    modalClientWidth: modal?.clientWidth || 0,
    modalScrollWidth: modal?.scrollWidth || 0,
    modalLeft: rect?.left || 0,
    modalRight: rect?.right || 0,
    titleClientWidth: title?.clientWidth || 0,
    titleScrollWidth: title?.scrollWidth || 0,
    coverWidth: cover?.getBoundingClientRect().width || 0,
    relatedClientWidth: related?.clientWidth || 0,
    relatedScrollWidth: related?.scrollWidth || 0,
    documentScrollWidth: document.documentElement.scrollWidth,
  };
})()`);
const narrowScreenshot = await screenshot("book-detail-enrichment-narrow-2026-08-29.jpg");
await command("Emulation.setDeviceMetricsOverride", { width: 1180, height: 860, deviceScaleFactor: 1, mobile: false });

const note = await evaluate(`(async () => {
  const button = Array.from(document.querySelectorAll('.book-library-modal-actions button'))
    .find((item) => /Open catalog note|Katalognotiz öffnen/i.test(item.textContent || ''));
  if (!button) throw new Error('Open catalog note action missing');
  const plugin = app.plugins.plugins['book-library'];
  const originalOpenBookNote = plugin.openBookNote.bind(plugin);
  let openBookNoteCalls = 0;
  plugin.openBookNote = async (...args) => {
    openBookNoteCalls += 1;
    return originalOpenBookNote(...args);
  };
  button.click();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((app.workspace.getActiveFile()?.path || '').includes('J Is for Junk Economics')) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const clickActiveFile = app.workspace.getActiveFile()?.path || '';
  const callsAfterClick = openBookNoteCalls;
  let directActiveFile = clickActiveFile;
  if (!clickActiveFile.includes('J Is for Junk Economics')) {
    const book = plugin.getBooks().find((candidate) => /J Is for Junk Economics/i.test(candidate.title));
    if (book) await plugin.openBookNote(book);
    await new Promise((resolve) => setTimeout(resolve, 500));
    directActiveFile = app.workspace.getActiveFile()?.path || '';
  }
  plugin.openBookNote = originalOpenBookNote;
  const noteLeaf = app.workspace.getLeavesOfType('markdown').find((leaf) => leaf.getViewState().state?.file === clickActiveFile);
  if (clickActiveFile.includes('J Is for Junk Economics') && noteLeaf) {
    await app.workspace.revealLeaf(noteLeaf);
    app.workspace.setActiveLeaf(noteLeaf, { focus: true });
    const state = noteLeaf.getViewState();
    await noteLeaf.setViewState({ ...state, state: { ...(state.state || {}), mode: 'preview' } });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const container = app.workspace.activeLeaf?.view?.containerEl || document;
  const metadata = container.querySelector('.metadata-container');
  const headings = Array.from(container.querySelectorAll('.markdown-preview-view h2')).map((item) => item.textContent?.trim() || '').filter(Boolean);
  const noteContent = clickActiveFile ? await app.vault.adapter.read(clickActiveFile) : '';
  return {
    activeFile: app.workspace.getActiveFile()?.path || '',
    clickActiveFile,
    directActiveFile,
    callsAfterClick,
    callsAfterDirect: openBookNoteCalls,
    openFiles: app.workspace.getLeavesOfType('markdown').map((leaf) => leaf.getViewState().state?.file || '').filter(Boolean),
    activeLeafType: app.workspace.activeLeaf?.view?.getViewType?.() || '',
    tabLabels: Array.from(document.querySelectorAll('.workspace-tab-header-inner-title')).map((item) => item.textContent?.trim() || '').filter(Boolean),
    notices: Array.from(document.querySelectorAll('.notice')).map((item) => item.textContent?.trim() || '').filter(Boolean),
    metadataClasses: metadata?.className || '',
    headings,
    sourceHasCoverHeading: /^## Cover$/m.test(noteContent) || /^## Umschlag$/m.test(noteContent),
    sourceHasCollapsedTechnical: /> \\[!info\\]- (Technical details|Technische Details)/.test(noteContent),
    technicalCollapsed: Boolean(Array.from(container.querySelectorAll('.callout')).find((item) => /Technical details|Technische Details/i.test(item.textContent || ''))?.classList.contains('is-collapsed')),
  };
})()`);
const noteScreenshot = await screenshot("book-catalog-note-2026-08-29.jpg");
await command("Emulation.clearDeviceMetricsOverride");
socket.close();

const result = {
  status: "candidate",
  pilot,
  desktop,
  author,
  narrow,
  note,
  consoleErrors,
  screenshots: [desktopScreenshot, narrowScreenshot, noteScreenshot],
};

fs.writeFileSync(path.join(outputDir, "..", "book-detail-enrichment-client-result.json"), JSON.stringify(result, null, 2));

if (pilot.version !== "0.7.5") throw new Error(`Expected plugin 0.7.5, got ${pilot.version}`);
if (pilot.books.length !== 2 || pilot.books.some((book) => !book.authorIdentity)) throw new Error("Pilot enrichment is incomplete.");
if (desktop.modalScrollWidth > desktop.modalClientWidth + 1 || desktop.titleScrollWidth > desktop.titleClientWidth + 1) throw new Error("Desktop detail overflows horizontally.");
if (desktop.coverWidth > 90) throw new Error(`Desktop cover is too wide: ${desktop.coverWidth}`);
if (desktop.authorTag !== "BUTTON" || desktop.authorTabIndex < 0) throw new Error("Author control is not keyboard accessible.");
if (!desktop.labels.some((label) => /Rating unavailable|Bewertung nicht verfügbar/i.test(label)) || !desktop.labels.some((label) => /AI summary|AI-Zusammenfassung/i.test(label))) throw new Error("Rating fallback or AI summary is missing.");
if (!/^_catalog\/authors\/open-library-ol7467564a(?: \(Book Library\)(?: \d+)?)?\.md$/.test(author.activeFile) || !author.ownedProfile) throw new Error(`Owned author profile did not open: ${author.activeFile}`);
if (narrow.titleScrollWidth > narrow.titleClientWidth + 1 || narrow.modalLeft < 0 || narrow.modalRight > narrow.viewportWidth + 1 || narrow.documentScrollWidth > narrow.viewportWidth + 1) throw new Error("Narrow detail or title overflows horizontally.");
if (narrow.coverWidth > 70) throw new Error(`Narrow cover is too wide: ${narrow.coverWidth}`);
if (!note.clickActiveFile.includes("J Is for Junk Economics") || !note.sourceHasCoverHeading) throw new Error("Catalog note did not open with the expected hierarchy.");
if (!note.sourceHasCollapsedTechnical) throw new Error("Technical details are not collapsed.");
if (consoleErrors.length) throw new Error(`Console errors found: ${consoleErrors.join(" | ")}`);

result.status = "passed";
fs.writeFileSync(path.join(outputDir, "..", "book-detail-enrichment-client-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
