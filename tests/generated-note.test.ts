import { describe, expect, it } from "vitest";
import { isBookLibraryOwnedMarkdown } from "../src/generated-note";

describe("generated note ownership", () => {
  it("erkennt eng begrenzte ältere Topic-MOCs als generiert", () => {
    const legacy = "# Ökonomie\n\n## Verwandte Bücher\n\n- [[_catalog/Buch|Buch]]\n";
    expect(isBookLibraryOwnedMarkdown(legacy, "topic")).toBe(true);
  });

  it("behandelt eigene Topic-Notizen nicht als Plugin-Eigentum", () => {
    const userNote = "# Ökonomie\n\nMeine eigenen Gedanken.\n";
    expect(isBookLibraryOwnedMarkdown(userNote, "topic")).toBe(false);
  });
});
