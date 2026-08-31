import type { BookRecord } from "./types";

export interface AmazonDestination {
  marketplace: string;
  verifiedProduct: boolean;
  label: string;
  url: string;
}

const LANGUAGE_MARKETPLACES: Record<string, string> = {
  de: "amazon.de",
  deu: "amazon.de",
  ger: "amazon.de",
  en: "amazon.com",
  eng: "amazon.com",
  fr: "amazon.fr",
  fra: "amazon.fr",
  fre: "amazon.fr",
  es: "amazon.es",
  spa: "amazon.es",
  it: "amazon.it",
  ita: "amazon.it",
  ja: "amazon.co.jp",
  jpn: "amazon.co.jp",
  nl: "amazon.nl",
  nld: "amazon.nl",
  pl: "amazon.pl",
  pol: "amazon.pl",
  pt: "amazon.com.br",
  por: "amazon.com.br",
  sv: "amazon.se",
  swe: "amazon.se",
  tr: "amazon.com.tr",
  tur: "amazon.com.tr",
};

const KNOWN_AMAZON_MARKETPLACES = new Set([
  ...Object.values(LANGUAGE_MARKETPLACES),
  "amazon.com",
  "amazon.ca",
  "amazon.co.uk",
  "amazon.com.au",
  "amazon.com.mx",
  "amazon.com.be",
  "amazon.ae",
  "amazon.eg",
  "amazon.in",
  "amazon.sa",
  "amazon.sg",
]);

export function resolveAmazonMarketplace(
  language: string,
  editionMarketplace = "",
  preferredMarketplace = ""
): string {
  const edition = normalizeMarketplace(editionMarketplace);
  if (edition) return edition;
  const preferred = normalizeMarketplace(preferredMarketplace);
  if (preferred) return preferred;
  return LANGUAGE_MARKETPLACES[language.trim().toLocaleLowerCase()] || "amazon.com";
}

export function amazonSearchDestination(
  book: Pick<BookRecord, "title" | "author" | "language"> & Partial<Pick<BookRecord, "isbn" | "externalIdentities">>,
  options: { editionMarketplace?: string; preferredMarketplace?: string } = {}
): AmazonDestination {
  const productIdentity = book.externalIdentities?.find(isConfirmedAmazonProductIdentity);
  const identityMarketplace = productIdentity ? marketplaceFromUrl(productIdentity.url) : "";
  const marketplace = resolveAmazonMarketplace(
    book.language,
    identityMarketplace || options.editionMarketplace,
    options.preferredMarketplace
  );
  if (productIdentity?.editionId) {
    return {
      marketplace,
      verifiedProduct: true,
      label: `${displayMarketplace(marketplace)} product`,
      url: `https://www.${marketplace}/dp/${encodeURIComponent(productIdentity.editionId)}`,
    };
  }
  const query = encodeURIComponent([book.title, book.author, book.isbn].filter(Boolean).join(" "));
  const german = marketplace === "amazon.de";
  return {
    marketplace,
    verifiedProduct: false,
    label: german ? "Amazon.de-Suche (unbestätigt)" : `${displayMarketplace(marketplace)} search (unverified)`,
    url: `https://www.${marketplace}/s?k=${query}`,
  };
}

function normalizeMarketplace(value: string): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return KNOWN_AMAZON_MARKETPLACES.has(normalized) ? normalized : "";
}

function marketplaceFromUrl(value: string): string {
  try {
    return normalizeMarketplace(new URL(value).hostname);
  } catch {
    return "";
  }
}

function displayMarketplace(marketplace: string): string {
  return marketplace
    .split(".")
    .map((part, index) => index === 0 ? "Amazon" : part)
    .join(".");
}

/**
 * An ASIN-shaped value is not proof of the matched edition. A direct product
 * link is only safe when the checked identity explicitly has full match
 * confidence and its URL resolves to that exact ASIN on a known marketplace.
 */
function isConfirmedAmazonProductIdentity(
  identity: NonNullable<BookRecord["externalIdentities"]>[number]
): boolean {
  const asin = (identity.editionId || "").trim().toLocaleUpperCase();
  if (identity.source !== "amazon" || identity.matchConfidence !== 1 || !/^[A-Z0-9]{10}$/.test(asin)) return false;
  try {
    const url = new URL(identity.url);
    if (!normalizeMarketplace(url.hostname)) return false;
    const productAsin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1];
    return Boolean(productAsin && productAsin.toLocaleUpperCase() === asin);
  } catch {
    return false;
  }
}
