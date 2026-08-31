import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const library = path.join(root, "fixtures", "library");
fs.rmSync(library, { recursive: true, force: true });

const coverJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64"
);

async function makeEpub(title, author, lang, withCover) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  const coverItem = withCover
    ? '<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    : "";
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:identifier id="uid">fixture</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>${lang}</dc:language><dc:description>Fixture-Buch fuer den Client-Smoke.</dc:description></metadata><manifest>${coverItem}<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`
  );
  zip.file(
    "OEBPS/c.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Inhalt</title></head><body><h1>Kapitel Eins</h1><p>Wichtiger Inhalt des Buches.</p></body></html>'
  );
  if (withCover) zip.file("OEBPS/cover.jpg", coverJpeg);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

const miniPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 72 720 Td (Fixture Guide) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF"
);

fs.mkdirSync(path.join(library, "EPUB"), { recursive: true });
fs.mkdirSync(path.join(library, "PDF"), { recursive: true });
fs.writeFileSync(path.join(library, "EPUB", "Test Book A.epub"), await makeEpub("Test Book A", "Autorin A", "de", true));
fs.writeFileSync(path.join(library, "EPUB", "Test Book B.epub"), await makeEpub("Test Book B", "Autor B", "en", false));
fs.writeFileSync(path.join(library, "PDF", "Fixture Guide.pdf"), miniPdf);

console.log("Fixtures created in", library);
