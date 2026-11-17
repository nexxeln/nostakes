import type { Schema } from "effect";

import type { Guide } from "./guides.js";
import { canonicalOf, HOME_PREVIEW, PREVIEW_IMAGE } from "./link-preview.js";

const SCHEMA_ORG = "https://schema.org";

const NOSTAKES = {
  "@type": "Organization",
  name: "nostakes",
  url: canonicalOf("/"),
} as const;

export const HOME_APPLICATION = {
  "@context": SCHEMA_ORG,
  "@type": "WebApplication",
  applicationCategory: "GameApplication",
  browserRequirements: "Requires JavaScript and a current web browser.",
  description: HOME_PREVIEW.description,
  image: canonicalOf(PREVIEW_IMAGE.path),
  isAccessibleForFree: true,
  name: "nostakes",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  operatingSystem: "Any",
  url: canonicalOf("/"),
} satisfies Schema.Json;

export const LEARN_ARTICLE = {
  "@context": SCHEMA_ORG,
  "@type": ["Article", "LearningResource"],
  about: "Texas hold'em poker",
  author: NOSTAKES,
  datePublished: "2026-11-11",
  description:
    "Learn Texas hold'em by playing five short hands: what happens in a hand, what beats what, and four habits that keep your chips.",
  educationalLevel: "Beginner",
  headline: "How to play poker: Texas hold'em in 2 minutes",
  image: canonicalOf(PREVIEW_IMAGE.path),
  inLanguage: "en",
  isAccessibleForFree: true,
  learningResourceType: "Interactive lesson",
  mainEntityOfPage: canonicalOf("/learn"),
  publisher: NOSTAKES,
  timeRequired: "PT2M",
  url: canonicalOf("/learn"),
} satisfies Schema.Json;

export const guideArticle = (guide: Guide) =>
  ({
    "@context": SCHEMA_ORG,
    "@type": "Article",
    about: "Texas hold'em poker",
    author: NOSTAKES,
    datePublished: "2026-11-16",
    description: guide.description,
    headline: guide.headline,
    image: canonicalOf(PREVIEW_IMAGE.path),
    inLanguage: "en",
    isAccessibleForFree: true,
    mainEntityOfPage: canonicalOf(guide.path),
    publisher: NOSTAKES,
    url: canonicalOf(guide.path),
  }) satisfies Schema.Json;

export const dataBlock = (data: Schema.Json) =>
  `<script type="application/ld+json">${JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")}</script>`;
