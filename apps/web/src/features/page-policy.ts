import {
  BEACON_REPORTS,
  BEACON_SOURCE,
  DRAND_RELAYS,
  SITE_HOSTS,
  countsPages,
} from "./outside-hosts.js";

const SELF = "'self'";

const NONE = "'none'";

const originOf = (address: string) => new URL(address).origin;

const counter = (sources: readonly string[]) => (countsPages ? sources : []);

export const POLICY_DIRECTIVES: readonly (readonly [
  string,
  readonly string[],
])[] = [
  ["default-src", [SELF]],
  ["script-src", [SELF, ...counter([originOf(BEACON_SOURCE)])]],
  ["style-src", [SELF, "'unsafe-inline'"]],
  ["img-src", [SELF, "data:", "blob:"]],
  ["media-src", [SELF, "blob:"]],
  ["font-src", [SELF]],
  [
    "connect-src",
    [
      SELF,
      ...SITE_HOSTS.map((host) => `wss://${host}`),
      ...DRAND_RELAYS,
      ...counter([BEACON_REPORTS]),
    ],
  ],
  ["worker-src", [SELF]],
  ["manifest-src", [SELF]],
  ["object-src", [NONE]],
  ["base-uri", [NONE]],
  ["form-action", [SELF]],
  ["frame-ancestors", [NONE]],
];

export const CONTENT_SECURITY_POLICY = POLICY_DIRECTIVES.map(
  ([name, sources]) => `${name} ${sources.join(" ")}`
).join("; ");

export const PERMISSIONS = [
  ["screen-wake-lock", "(self)"],
  ["web-share", "(self)"],
  ["clipboard-write", "(self)"],
  ["camera", "()"],
  ["microphone", "()"],
  ["geolocation", "()"],
  ["payment", "()"],
  ["usb", "()"],
  ["serial", "()"],
  ["hid", "()"],
  ["midi", "()"],
  ["display-capture", "()"],
] as const;

export const PAGE_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Permissions-Policy": PERMISSIONS.map(
    ([feature, allowed]) => `${feature}=${allowed}`
  ).join(", "),
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const satisfies Readonly<Record<string, string>>;

export const HEADERS_FILE = [
  "/*",
  ...Object.entries(PAGE_HEADERS).map(([name, value]) => `  ${name}: ${value}`),
  "",
].join("\n");
