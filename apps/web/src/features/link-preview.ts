export const SITE_ORIGIN = "https://nostakes.club";

export const BRAND_LINE = "Poker night. Pull up a chair.";

export const PREVIEW_IMAGE = {
  alt: `The nostakes shark in shades and a gold chain, and the line "${BRAND_LINE}"`,
  height: 630,
  path: "/preview/card.png",
  type: "image/png",
  width: 1200,
} as const;

export const PREVIEW_CLIP = {
  height: 630,
  path: "/preview/clip.mp4",
  type: "video/mp4",
  width: 1200,
} as const;

export interface LinkPreview {
  readonly title: string;
  readonly description: string;
}

export const HOME_PREVIEW: LinkPreview = {
  description:
    "Poker night with your friends, in the browser. Open a room, drop the link in the group chat, and play hold'em. No money on the table, just the count.",
  title: "nostakes",
};

export const INVITE_PREVIEW: LinkPreview = {
  description:
    "You're invited to a hold'em game with friends on nostakes. Tap the link, pick a face, and take a seat.",
  title: BRAND_LINE,
};

const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const meta = (key: "name" | "property", name: string, content: string) =>
  `<meta ${key}="${name}" content="${escaped(content)}" />`;

export const previewHead = ({ description, title }: LinkPreview) =>
  [
    `<title>${escaped(title)}</title>`,
    meta("name", "description", description),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "nostakes"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:image", `${SITE_ORIGIN}${PREVIEW_IMAGE.path}`),
    meta("property", "og:image:type", PREVIEW_IMAGE.type),
    meta("property", "og:image:width", String(PREVIEW_IMAGE.width)),
    meta("property", "og:image:height", String(PREVIEW_IMAGE.height)),
    meta("property", "og:image:alt", PREVIEW_IMAGE.alt),
    meta("property", "og:video", `${SITE_ORIGIN}${PREVIEW_CLIP.path}`),
    meta(
      "property",
      "og:video:secure_url",
      `${SITE_ORIGIN}${PREVIEW_CLIP.path}`
    ),
    meta("property", "og:video:type", PREVIEW_CLIP.type),
    meta("property", "og:video:width", String(PREVIEW_CLIP.width)),
    meta("property", "og:video:height", String(PREVIEW_CLIP.height)),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", `${SITE_ORIGIN}${PREVIEW_IMAGE.path}`),
    meta("name", "twitter:image:alt", PREVIEW_IMAGE.alt),
  ].join("\n    ");
