import { describe, expect, it } from "vitest";
import { validateManualAudiobookInput } from "../src/manual-audiobook-validation";

describe("manual audiobook validation", () => {
  it("requires a title", () => {
    expect(validateManualAudiobookInput({
      title: " ",
      author: "",
      storagePath: "",
      sourceLink: "",
      categories: [],
      synopsis: "",
    })).toBe("manual.needsTitle");
  });

  it("rejects non-http source links", () => {
    expect(validateManualAudiobookInput({
      title: "Book",
      author: "",
      storagePath: "/audio",
      sourceLink: "javascript:alert(1)",
      categories: [],
      synopsis: "",
    })).toBe("manual.needsValidLink");
  });

  it("accepts valid input without a link", () => {
    expect(validateManualAudiobookInput({
      title: "Book",
      author: "Author",
      storagePath: "/audio",
      sourceLink: "",
      categories: ["Business"],
      synopsis: "",
    })).toBeNull();
  });
});
