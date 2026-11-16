import { GUIDES, guidePage } from "./guides.js";
import { canonicalOf } from "./link-preview.js";

export interface IndexedPage {
  readonly file: string;
  readonly path: string;
}

export const INDEXED_PAGES: readonly IndexedPage[] = [
  { file: "index.html", path: "/" },
  { file: "learn.html", path: "/learn" },
  { file: "privacy.html", path: "/privacy" },
  { file: "terms.html", path: "/terms" },
  ...GUIDES.map((guide) => ({ file: guidePage(guide), path: guide.path })),
];

export const UNCRAWLED_PATHS = ["/rooms/"] as const;

export const ROBOTS_FILE = "robots.txt";

export const SITEMAP_FILE = "sitemap.xml";

export const robotsText = () =>
  [
    "User-agent: *",
    ...UNCRAWLED_PATHS.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${canonicalOf(`/${SITEMAP_FILE}`)}`,
    "",
  ].join("\n");

export const sitemapXml = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...INDEXED_PAGES.map(
      ({ path }) => `  <url><loc>${canonicalOf(path)}</loc></url>`
    ),
    "</urlset>",
    "",
  ].join("\n");
