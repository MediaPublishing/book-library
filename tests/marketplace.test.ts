import { describe, expect, it } from "vitest";
import { amazonSearchDestination, resolveAmazonMarketplace } from "../src/marketplace";

describe("Amazon marketplace resolution", () => {
  it("verwendet Ausgabe-Markt vor Einstellung und Sprachstandard", () => {
    expect(resolveAmazonMarketplace("en", "amazon.co.uk", "amazon.ca")).toBe("amazon.co.uk");
    expect(resolveAmazonMarketplace("en", "", "amazon.ca")).toBe("amazon.ca");
    expect(resolveAmazonMarketplace("de")).toBe("amazon.de");
    expect(resolveAmazonMarketplace("fr")).toBe("amazon.fr");
    expect(resolveAmazonMarketplace("pt")).toBe("amazon.com.br");
  });

  it("kennzeichnet Links ohne Produktidentität als Suche", () => {
    expect(amazonSearchDestination({ title: "J Is for Junk Economics", author: "Michael Hudson", language: "en" })).toEqual({
      marketplace: "amazon.com",
      verifiedProduct: false,
      label: "Amazon.com search (unverified)",
      url: expect.stringContaining("https://www.amazon.com/s?k="),
    });
  });

  it("verwendet eine bestätigte ASIN als direkten Produktlink", () => {
    const destination = amazonSearchDestination({
      title: "J Is for Junk Economics",
      author: "Michael Hudson",
      language: "en",
      externalIdentities: [{
        source: "amazon", url: "https://www.amazon.com/dp/B071W31MTM", locale: "en",
        checkedAt: "2026-08-29", matchConfidence: 1, editionId: "B071W31MTM",
      }],
    });
    expect(destination).toMatchObject({
      verifiedProduct: true,
      url: "https://www.amazon.com/dp/B071W31MTM",
      label: "Amazon.com product",
    });
  });

  it("bewahrt bei bestätigten Ausgaben den Markt aus der Produkt-URL", () => {
    const destination = amazonSearchDestination({
      title: "J Is for Junk Economics",
      author: "Michael Hudson",
      language: "de",
      externalIdentities: [{
        source: "amazon", url: "https://www.amazon.com/dp/B071W31MTM", locale: "en-US",
        checkedAt: "2026-08-29", matchConfidence: 1, editionId: "B071W31MTM",
      }],
    });
    expect(destination.marketplace).toBe("amazon.com");
    expect(destination.url).toBe("https://www.amazon.com/dp/B071W31MTM");
  });

  it("behandelt eine ASIN mit niedriger Match-Confidence als lokalisierte unbestätigte Suche", () => {
    const destination = amazonSearchDestination({
      title: "J Is for Junk Economics",
      author: "Michael Hudson",
      language: "de",
      externalIdentities: [{
        source: "amazon", url: "https://www.amazon.com/dp/B071W31MTM", locale: "en-US",
        checkedAt: "2026-08-29", matchConfidence: 0.72, editionId: "B071W31MTM",
      }],
    });

    expect(destination).toEqual({
      marketplace: "amazon.de",
      verifiedProduct: false,
      label: "Amazon.de-Suche (unbestätigt)",
      url: expect.stringContaining("https://www.amazon.de/s?k="),
    });
  });

  it("verlangt, dass die bestätigte Produkt-URL dieselbe ASIN enthält", () => {
    const destination = amazonSearchDestination({
      title: "J Is for Junk Economics",
      author: "Michael Hudson",
      language: "en",
      externalIdentities: [{
        source: "amazon", url: "https://www.amazon.com/dp/B000000000", locale: "en-US",
        checkedAt: "2026-08-29", matchConfidence: 1, editionId: "B071W31MTM",
      }],
    });

    expect(destination).toMatchObject({ verifiedProduct: false, marketplace: "amazon.com" });
  });
});
