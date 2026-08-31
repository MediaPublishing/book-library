import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractEpubCover, parseEpub } from "../src/epub";

async function makeEpub(opts: { withCover?: boolean } = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>Test Book: History</dc:title>
    <dc:creator>Max Mustermann</dc:creator>
    <dc:language>de</dc:language>
    <dc:publisher>Testverlag</dc:publisher>
    <dc:identifier>urn:isbn:9783161484100</dc:identifier>
  </metadata>
  <manifest>
    <item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="chap1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chap1"/></spine>
</package>`
  );
  zip.file("OEBPS/chap1.xhtml", "<html><body><p>Hallo</p></body></html>");
  if (opts.withCover) {
    zip.file("OEBPS/cover.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("epub", () => {
  it("liest Titel, Autor, Sprache, Verlag und ISBN", async () => {
    const meta = await parseEpub(await makeEpub());
    expect(meta.title).toBe("Test Book: History");
    expect(meta.author).toBe("Max Mustermann");
    expect(meta.language).toBe("de");
    expect(meta.publisher).toBe("Testverlag");
    expect(meta.isbn).toBe("9783161484100");
  });

  it("extrahiert das Cover aus dem Manifest", async () => {
    const buffer = await makeEpub({ withCover: true });
    const meta = await parseEpub(buffer);
    const cover = await extractEpubCover(buffer, meta.coverPath);
    expect(cover).not.toBeNull();
    expect(cover![0]).toBe(0xff);
  });

  it("leitet die Seitenzahl aus den itemref-Einträgen ab", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    zip.file(
      "META-INF/container.xml",
      `<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata><dc:title>Mehrteilig</dc:title></metadata>
  <manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`
    );
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const meta = await parseEpub(buffer);
    expect(meta.pages).toBe("3");
  });
});
