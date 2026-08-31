import { describe, expect, it } from "vitest";
import { MetadataProvider } from "../src/metadata";

function jsonHttp(payload: unknown, status = 200) {
  return async () => ({ status, text: JSON.stringify(payload) });
}

describe("metadata provider", () => {
  it("fusioniert Open-Library-Identität mit Google-Books-Beschreibung und -Rating", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org/search")) {
        return {
          status: 200,
          text: JSON.stringify({
            docs: [{
              key: "/works/OL123W",
              title: "J Is for Junk Economics",
              author_name: ["Michael Hudson"],
              author_key: ["OL123A"],
              language: ["eng"],
              isbn: ["9783981826029"],
              cover_i: 42,
            }],
          }),
        };
      }
      return {
        status: 200,
        text: JSON.stringify({
          items: [{
            id: "google-volume-1",
            volumeInfo: {
              title: "J Is for Junk Economics",
              authors: ["Michael Hudson"],
              language: "en",
              description: "A guide to economic euphemisms and deception.",
              averageRating: 4.4,
              ratingsCount: 17,
              infoLink: "https://books.google.com/books?id=google-volume-1",
              industryIdentifiers: [{ type: "ISBN_13", identifier: "9783981826029" }],
            },
          }],
        }),
      };
    });

    const result = await provider.fetchByTitleAuthor("J Is for Junk Economics", "Michael Hudson");

    expect(result).toMatchObject({
      source: "open-library+google-books",
      description: "A guide to economic euphemisms and deception.",
      rating: 4.4,
      ratingsCount: 17,
      authorIdentity: { id: "open-library:OL123A" },
    });
    expect(result?.sourceRatings).toEqual([
      expect.objectContaining({ source: "google-books", status: "provider-reported", value: 4.4, count: 17 }),
    ]);
    expect(result?.sourceDescriptions).toEqual([
      expect.objectContaining({ source: "google-books", kind: "source" }),
    ]);
    expect(result?.externalIdentities).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "open-library", workId: "OL123W" }),
      expect.objectContaining({ source: "google-books", editionId: "google-volume-1" }),
    ]));
  });

  it("weist widersprüchliche Google-Books-Kandidaten als nicht akzeptiert zurück", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org")) {
        return { status: 200, text: JSON.stringify({ docs: [{ title: "The Right Book", author_name: ["A. Author"], language: ["eng"] }] }) };
      }
      return {
        status: 200,
        text: JSON.stringify({ items: [{ volumeInfo: { title: "A Different Book", authors: ["Someone Else"], averageRating: 5, ratingsCount: 99 } }] }),
      };
    });

    const result = await provider.fetchByTitleAuthor("The Right Book", "A. Author");

    expect(result?.source).toBe("open-library");
    expect(result?.rating).toBe(0);
    expect(result?.sourceRatings).toEqual([]);
  });

  it("mappt Open-Library-Ergebnisse", async () => {
    const provider = new MetadataProvider(
      jsonHttp({
        docs: [
          {
            title: "A history of smoking",
            author_name: ["Egon Caesar Corti"],
            first_publish_year: 1931,
            language: ["en"],
            publisher: ["Some Press"],
            isbn: ["123456789X"],
            number_of_pages_median: 300,
            cover_i: 42,
          },
        ],
      })
    );
    const result = await provider.fetchByTitleAuthor("A history of smoking", "Egon Caesar Corti");
    expect(result?.title).toBe("A history of smoking");
    expect(result?.author).toBe("Egon Caesar Corti");
    expect(result?.year).toBe("1931");
    expect(result?.coverUrl).toContain("42-M.jpg");
    expect(result?.source).toBe("open-library");
  });

  it("liefert null bei Nicht-200", async () => {
    const provider = new MetadataProvider(jsonHttp({}, 500));
    expect(await provider.fetchByTitleAuthor("x", "y")).toBeNull();
  });

  it("behält ein verwertbares Teilergebnis, wenn der zweite Provider abbricht", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("googleapis.com")) throw new Error("temporary Google Books outage");
      return {
        status: 200,
        text: JSON.stringify({ docs: [{
          key: "/works/OLPARTIALW",
          title: "Resilient Metadata",
          author_name: ["A. Reader"],
          language: ["eng"],
        }] }),
      };
    });

    const result = await provider.fetchByTitleAuthor("Resilient Metadata", "A. Reader");

    expect(result).toMatchObject({
      title: "Resilient Metadata",
      source: "open-library",
      enrichmentState: "partial",
      providerFailures: ["google-books"],
    });
  });

  it("prüft weitere Provider-Kandidaten statt nur des ersten Suchtreffers", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org")) {
        return {
          status: 200,
          text: JSON.stringify({ docs: [
            { key: "/works/OLWRONGW", title: "A Different Book", author_name: ["Someone Else"], language: ["eng"] },
            { key: "/works/OLRIGHTW", title: "The Right Book", author_name: ["A. Author"], language: ["eng"] },
          ] }),
        };
      }
      return { status: 200, text: JSON.stringify({ items: [] }) };
    });

    const result = await provider.fetchByTitleAuthor("The Right Book", "A. Author", "en");

    expect(result).toMatchObject({ title: "The Right Book", source: "open-library", enrichmentState: "success" });
    expect(result?.externalIdentities).toEqual(expect.arrayContaining([
      expect.objectContaining({ workId: "OLRIGHTW", editionId: undefined }),
    ]));
  });

  it("prüft auch weitere Google-Books-Kandidaten", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org")) return { status: 200, text: JSON.stringify({ docs: [] }) };
      return {
        status: 200,
        text: JSON.stringify({ items: [
          { id: "wrong", volumeInfo: { title: "Other Book", authors: ["Elsewhere"], language: "en" } },
          { id: "right", volumeInfo: { title: "Google Candidate", authors: ["A. Reader"], language: "en" } },
        ] }),
      };
    });

    expect(await provider.fetchByTitleAuthor("Google Candidate", "A. Reader", "eng")).toMatchObject({
      source: "google-books",
      title: "Google Candidate",
      enrichmentState: "success",
    });
  });

  it("markiert widersprüchliche Sprachversionen als mehrdeutig und lehnt eine bekannte falsche Sprache ab", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org")) {
        return {
          status: 200,
          text: JSON.stringify({ docs: [{
            key: "/works/OLLANGW", title: "Shared Title", author_name: ["A. Author"], language: ["eng"],
          }] }),
        };
      }
      return {
        status: 200,
        text: JSON.stringify({ items: [{ id: "de-edition", volumeInfo: {
          title: "Shared Title", authors: ["A. Author"], language: "de",
        } }] }),
      };
    });

    expect(await provider.fetchByTitleAuthor("Shared Title", "A. Author")).toMatchObject({
      enrichmentState: "ambiguous",
    });
    expect(await provider.fetchByTitleAuthor("Shared Title", "A. Author", "fr")).toBeNull();
  });

  it("ordnet Open-Library-Werk- und Ausgaben-IDs getrennt zu", async () => {
    const workProvider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org/search")) {
        return {
          status: 200,
          text: JSON.stringify({ docs: [{
            key: "/works/OLWORKW", title: "Work Mapping", author_name: ["A. Author"], language: ["eng"],
          }] }),
        };
      }
      return { status: 200, text: JSON.stringify({ items: [] }) };
    });
    const work = await workProvider.fetchByTitleAuthor("Work Mapping", "A. Author");
    expect(work?.externalIdentities[0]).toMatchObject({ workId: "OLWORKW", editionId: undefined });

    const editionProvider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org/api/books")) {
        return {
          status: 200,
          text: JSON.stringify({ "ISBN:9780307481665": {
            url: "https://openlibrary.org/books/OLEDITIONM/Edition_mapping",
            title: "Edition Mapping",
            authors: [{ name: "A. Author", key: "/authors/OLA1" }],
          } }),
        };
      }
      return { status: 200, text: JSON.stringify({ items: [] }) };
    });
    const edition = await editionProvider.fetchByIsbn("9780307481665");
    expect(edition?.externalIdentities[0]).toMatchObject({ workId: undefined, editionId: "OLEDITIONM" });
  });

  it("bestätigt eine externe Autoren-ID nur mit starker Ausgaben-Evidenz", async () => {
    const provider = new MetadataProvider(async (url) => {
      if (url.includes("openlibrary.org/api/books")) {
        return {
          status: 200,
          text: JSON.stringify({ "ISBN:9780307481665": {
            title: "Identity Evidence",
            authors: [{ name: "A. Author", key: "/authors/OLA1" }],
          } }),
        };
      }
      if (url.includes("openlibrary.org/search")) {
        return {
          status: 200,
          text: JSON.stringify({ docs: [{
            key: "/works/OLIDENTITYW", title: "Identity Evidence", author_name: ["A. Author"], author_key: ["OLA1"], language: ["eng"],
          }] }),
        };
      }
      return { status: 200, text: JSON.stringify({ items: [] }) };
    });

    expect((await provider.fetchByTitleAuthor("Identity Evidence", "A. Author"))?.authorIdentity?.status).toBe("ambiguous");
    expect((await provider.fetchByIsbn("9780307481665"))?.authorIdentity?.status).toBe("matched");
  });

  it("lädt Cover-Bytes über die HTTP-Quelle", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer;
    const provider = new MetadataProvider(async () => ({
      status: 200,
      text: "",
      arrayBuffer: bytes,
    }));
    const cover = await provider.downloadCover("https://covers.openlibrary.org/b/id/42-M.jpg");
    expect(cover).not.toBeNull();
    expect(cover![0]).toBe(0xff);
  });

  it("lehnt Fehlerseiten ab, die nur als Bilddatei benannt sind", async () => {
    const provider = new MetadataProvider(async () => ({
      status: 200,
      text: "<Error><Code>AccessDenied</Code></Error>",
      arrayBuffer: Buffer.from("<Error><Code>AccessDenied</Code></Error>").buffer,
    }));
    expect(await provider.downloadCover("https://covers.example.invalid/not-a-cover.jpg")).toBeNull();
  });

  it("liest Covers aus dem cover-Objekt der Open-Library-ISBN-Antwort", async () => {
    const provider = new MetadataProvider(
      jsonHttp({
        "ISBN:9780307481665": {
          title: "The Art of Travel",
          authors: [{ name: "Alain De Botton" }],
          cover: {
            small: "https://covers.openlibrary.org/b/id/123-S.jpg",
            medium: "https://covers.openlibrary.org/b/id/123-M.jpg",
            large: "https://covers.openlibrary.org/b/id/123-L.jpg",
          },
        },
      })
    );
    const meta = await provider.fetchByIsbn("9780307481665");
    expect(meta?.title).toBe("The Art of Travel");
    expect(meta?.coverUrl).toBe("https://covers.openlibrary.org/b/id/123-M.jpg");
  });
});
