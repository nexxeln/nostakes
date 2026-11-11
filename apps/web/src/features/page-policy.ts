import { DRAND_RELAYS, SITE_HOSTS } from "./outside-hosts.js";

const SELF = "'self'";

const NONE = "'none'";

export const POLICY_DIRECTIVES: readonly (readonly [
  string,
  readonly string[],
])[] = [
  ["default-src", [SELF]],
  ["script-src", [SELF]],
  ["style-src", [SELF, "'unsafe-inline'"]],
  ["img-src", [SELF, "data:", "blob:"]],
  ["media-src", [SELF, "blob:"]],
  ["font-src", [SELF]],
  [
    "connect-src",
    [SELF, ...SITE_HOSTS.map((host) => `wss://${host}`), ...DRAND_RELAYS],
  ],
  ["worker-src", [SELF]],
  ["manifest-src", [SELF]],
  ["object-src", [NONE]],
  ["base-uri", [NONE]],
  ["form-action", [SELF]],
  ["frame-ancestors", [NONE]],
];

const policyOf = (
  directives: readonly (readonly [string, readonly string[]])[]
) =>
  directives
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");

export const CONTENT_SECURITY_POLICY = policyOf(POLICY_DIRECTIVES);

const AAC_EXTENSION_NEEDS = new Map<string, readonly string[]>([
  ["script-src", ["'wasm-unsafe-eval'"]],
  ["worker-src", ["blob:"]],
]);

export const CLIP_WORKER_DIRECTIVES = POLICY_DIRECTIVES.map(
  ([name, sources]) =>
    [name, [...sources, ...(AAC_EXTENSION_NEEDS.get(name) ?? [])]] as const
);

export const CLIP_WORKER_PATHS = [
  "/assets/clip-worker-",
  "/src/client/moments/clip-worker.ts",
] as const;

const BUILT_CLIP_WORKERS = `${CLIP_WORKER_PATHS[0]}*`;

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

export const CLIP_WORKER_HEADERS = {
  ...PAGE_HEADERS,
  "Content-Security-Policy": policyOf(CLIP_WORKER_DIRECTIVES),
} as const satisfies Readonly<Record<string, string>>;

export const headersFor = (path: string) =>
  CLIP_WORKER_PATHS.some((prefix) => path.startsWith(prefix))
    ? CLIP_WORKER_HEADERS
    : PAGE_HEADERS;

export const HEADERS_FILE = [
  "/*",
  ...Object.entries(PAGE_HEADERS).map(([name, value]) => `  ${name}: ${value}`),
  BUILT_CLIP_WORKERS,
  "  ! Content-Security-Policy",
  `  Content-Security-Policy: ${CLIP_WORKER_HEADERS["Content-Security-Policy"]}`,
  "",
].join("\n");
