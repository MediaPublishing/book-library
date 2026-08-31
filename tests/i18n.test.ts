import { describe, expect, it } from "vitest";
import {
  detectSystemLanguage,
  resolveLanguage,
  translate,
  translations,
  type TranslationKey,
} from "../src/i18n";

describe("i18n", () => {
  it("leitet die Sprache aus der Systemsprache ab", () => {
    expect(resolveLanguage("auto", "de-DE")).toBe("de");
    expect(resolveLanguage("auto", "en-US")).toBe("en");
    expect(resolveLanguage("auto", "fr-FR")).toBe("en");
    expect(resolveLanguage("de", "en-US")).toBe("de");
    expect(resolveLanguage("en", "de-DE")).toBe("en");
  });

  it("liefert für jeden Schlüssel Deutsch und Englisch", () => {
    for (const key of Object.keys(translations) as TranslationKey[]) {
      expect(translations[key].en.length).toBeGreaterThan(0);
      expect(translations[key].de.length).toBeGreaterThan(0);
    }
  });

  it("ersetzt Platzhalter", () => {
    expect(translate("de", "view.stats", { count: 3, total: 10 }) + " " + translate("de", "view.statsBooksName")).toBe("3 von 10 Bücher");
    expect(translate("en", "view.stats", { count: 3, total: 10 }) + " " + translate("en", "view.statsBooksName")).toBe("3 of 10 books");
  });

  it("fällt auf Englisch zurück", () => {
    expect(translate("de", "view.title")).toBe("Book Library");
    expect(translate("de", "notice.scanDone", { added: 1, updated: 2, unmatched: "" })).toContain(
      "Bibliothek gescannt"
    );
    expect(translate("en", "notice.scanDone", { added: 1, updated: 2, unmatched: "" })).toContain(
      "Library scanned"
    );
  });

  it("erkennt Systemsprache", () => {
    expect(typeof detectSystemLanguage()).toBe("string");
  });
});
