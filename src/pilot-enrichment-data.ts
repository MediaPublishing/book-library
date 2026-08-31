import type { AuthorSourceRecord, BookExternalIdentity, BookSourceDescription } from "./types";

export const MICHAEL_HUDSON_AUTHORITY_ID = "OL7467564A";

export const MICHAEL_HUDSON_PILOT_TITLES = [
  "j is for junk economics",
  "and forgive them their debts",
] as const;

export const MICHAEL_HUDSON_AUTHOR_SOURCES: AuthorSourceRecord[] = [
  {
    source: "michael-hudson-official",
    url: "https://michael-hudson.com/about/",
    locale: "en",
    checkedAt: "2026-08-29T00:00:00Z",
    matchConfidence: 1,
    kind: "biography",
    text: "Michael Hudson is president of the Institute for the Study of Long-Term Economic Trends and a distinguished research professor of economics at the University of Missouri–Kansas City. His work focuses on finance, real estate, economic history and debt.",
    works: ["Super-Imperialism", "Killing the Host", "The Bubble and Beyond"],
  },
  {
    source: "amazon-author-profile",
    url: "https://www.amazon.com/stores/author/B000APC58U/about",
    locale: "en-US",
    checkedAt: "2026-08-29T00:00:00Z",
    matchConfidence: 1,
    kind: "profile",
  },
];

export const JUNK_ECONOMICS_AMAZON_IDENTITY: BookExternalIdentity = {
  source: "amazon",
  url: "https://www.amazon.com/dp/B071W31MTM",
  locale: "en-US",
  checkedAt: "2026-08-29T00:00:00Z",
  matchConfidence: 1,
  editionId: "B071W31MTM",
};

export const MICHAEL_HUDSON_PILOT_SUMMARIES: Record<string, BookSourceDescription> = {
  "j is for junk economics": {
    source: "local-ai-summary",
    url: "https://michael-hudson.com/about/",
    locale: "en",
    checkedAt: "2026-08-29T00:00:00Z",
    matchConfidence: 0.8,
    kind: "ai-summary",
    text: "J Is for Junk Economics examines how economic language and models can obscure power, debt and rent extraction, and argues for reading economic claims against their real-world beneficiaries.",
    inputSources: ["https://michael-hudson.com/about/", "https://www.amazon.com/dp/B071W31MTM"],
  },
  "and forgive them their debts": {
    source: "local-ai-summary",
    url: "https://michael-hudson.com/about/",
    locale: "en",
    checkedAt: "2026-08-29T00:00:00Z",
    matchConfidence: 0.8,
    kind: "ai-summary",
    text: "...and forgive them their debts traces debt, foreclosure and periodic debt cancellation from the Bronze Age to the biblical Jubilee, connecting ancient practices to modern debates about finance and social stability.",
    inputSources: ["https://michael-hudson.com/about/"],
  },
};
