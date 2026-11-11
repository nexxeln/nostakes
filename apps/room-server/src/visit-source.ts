import { Schema } from "effect";

export const VisitSourceSchema = Schema.Literals([
  "x",
  "hn",
  "reddit",
  "discord",
  "google",
  "github",
  "bsky",
  "linkedin",
  "none",
  "own",
  "other",
]);

export type VisitSource = typeof VisitSourceSchema.Type;

const NAMED_SITES: readonly (readonly [VisitSource, readonly string[]])[] = [
  ["x", ["x.com", "twitter.com", "t.co"]],
  ["hn", ["news.ycombinator.com"]],
  ["reddit", ["reddit.com", "redd.it"]],
  ["discord", ["discord.com", "discordapp.com"]],
  ["github", ["github.com"]],
  ["bsky", ["bsky.app"]],
  ["linkedin", ["linkedin.com", "lnkd.in"]],
];

const GOOGLE = /(?:^|\.)google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/u;

const isOrUnder = (host: string, site: string) =>
  host === site || host.endsWith(`.${site}`);

const namedSite = (host: string): VisitSource =>
  GOOGLE.test(host)
    ? "google"
    : (NAMED_SITES.find(([, sites]) =>
        sites.some((site) => isOrUnder(host, site))
      )?.[0] ?? "other");

export const visitSourceOf = (
  referrer: string | null,
  ownOrigin: string
): VisitSource => {
  if (referrer === null || referrer.trim() === "") {
    return "none";
  }

  if (!URL.canParse(referrer)) {
    return "other";
  }

  const from = new URL(referrer);

  return from.origin === ownOrigin ? "own" : namedSite(from.hostname);
};
