export const SITE_HOSTS = ["nostakes.club", "preview.nostakes.club"] as const;

export type SiteHost = (typeof SITE_HOSTS)[number];

export const DRAND_RELAYS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://drand.cloudflare.com",
  "https://api3.drand.sh",
] as const;

export const BEACON_SOURCE =
  "https://static.cloudflareinsights.com/beacon.min.js";

export const BEACON_REPORTS = "https://cloudflareinsights.com";

export const PAGE_COUNTER_TOKENS = {
  "nostakes.club": "",
  "preview.nostakes.club": "",
} as const satisfies Readonly<Record<SiteHost, string>>;

export const countsPages = Object.values(PAGE_COUNTER_TOKENS).some(
  (token) => token.length > 0
);
