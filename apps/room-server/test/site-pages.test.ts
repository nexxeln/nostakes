import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import type { Recorder } from "../src/analytics.js";
import { measure } from "../src/measures.js";
import type { Measure } from "../src/measures.js";
import { sitePages } from "../src/site-pages.js";
import type { AssetFetcher } from "../src/site-pages.js";

const STAGE = "https://preview.nostakes.club";

const CLIP = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);

const pageText = (title: string) =>
  `<title>${title}</title><meta property="og:url" content="https://nostakes.club/" /><meta property="og:image" content="https://nostakes.club/preview/card.png" />`;

const POLICY_HEADERS = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "permissions-policy": "camera=()",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};

const ASSET_FILES = new Map<string, Response>([
  [
    "/index.html",
    new Response(pageText("home"), {
      headers: {
        ...POLICY_HEADERS,
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "text/html",
        etag: '"home"',
      },
    }),
  ],
  [
    "/invite.html",
    new Response(pageText("invite"), {
      headers: { ...POLICY_HEADERS, "content-type": "text/html" },
    }),
  ],
  [
    "/preview/clip.mp4",
    new Response(CLIP, {
      headers: {
        ...POLICY_HEADERS,
        "content-type": "video/mp4",
        etag: '"clip"',
      },
    }),
  ],
]);

const assets: AssetFetcher = {
  fetch: (request) => {
    const asked = new URL(request.url);
    const file = ASSET_FILES.get(asked.pathname);

    return Promise.resolve(
      file === undefined || request.headers.has("range")
        ? new Response(null, { status: file === undefined ? 404 : 400 })
        : file.clone()
    );
  },
};

const answer = (
  path: string,
  init: RequestInit = {},
  record: Recorder = () => Effect.void
) =>
  Effect.gen(function* answerRequest() {
    const handle = yield* HttpRouter.toHttpEffect(sitePages(assets, record));

    const response = yield* handle.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request(new URL(path, STAGE), init))
      )
    );

    const web = HttpServerResponse.toWeb(response);
    const body = new Uint8Array(yield* Effect.promise(() => web.arrayBuffer()));

    return {
      body,
      headers: Object.fromEntries(web.headers),
      status: web.status,
    };
  }).pipe(Effect.scoped);

describe("the site's pages", () => {
  it.effect(
    "keep every header the asset layer set, the security policy among them, and drop the rewritten page's old validator",
    () =>
      Effect.gen(function* keepHeaders() {
        const home = yield* answer("/");
        const invite = yield* answer("/r/QT8VND");

        const policyOf = (headers: Readonly<Record<string, string>>) =>
          Object.fromEntries(
            Object.keys(POLICY_HEADERS).map((name) => [name, headers[name]])
          );

        expect({
          home: policyOf(home.headers),
          homeValidator: home.headers.etag,
          invite: policyOf(invite.headers),
        }).toStrictEqual({
          home: POLICY_HEADERS,
          homeValidator: undefined,
          invite: POLICY_HEADERS,
        });
      })
  );
});

const from = (referer: string) => ({
  headers: { referer, "sec-fetch-dest": "document" },
});

describe("counting visits", () => {
  it.effect(
    "counts a page a browser opens as a document, by page and nothing else, and not a link preview's fetch",
    () =>
      Effect.gen(function* countVisits() {
        const counted: Measure[] = [];

        const record: Recorder = (measures) =>
          Effect.sync(() => {
            counted.push(...measures);
          });

        const opened = { headers: { "sec-fetch-dest": "document" } };

        yield* answer("/", opened, record);
        yield* answer("/r/K7P2XZ", opened, record);
        yield* answer("/r/K7P2XZ", {}, record);
        yield* answer("/preview/clip.mp4", opened, record);

        expect(counted).toEqual([
          measure("PageVisit", { page: "Home", source: "none" }),
          measure("PageVisit", { page: "Invite", source: "none" }),
        ]);
      })
  );

  it.effect(
    "records where a visit came from only as a name from the table, never the address it came from",
    () =>
      Effect.gen(function* countSources() {
        const counted: Measure[] = [];

        const record: Recorder = (measures) =>
          Effect.sync(() => {
            counted.push(...measures);
          });

        yield* answer("/", from(`${STAGE}/r/Q8MZ4T?name=Wren`), record);
        yield* answer(
          "/r/K7P2XZ",
          from("https://news.ycombinator.com/item?id=4417"),
          record
        );
        yield* answer("/", from("https://t.co/Q8MZ4T"), record);
        yield* answer("/", from("https://wren.example/r/Q8MZ4T"), record);

        expect({
          counted,
          leaked: ["Q8MZ4T", "Wren", "4417", "example"].filter((secret) =>
            JSON.stringify(counted).includes(secret)
          ),
        }).toEqual({
          counted: [
            measure("PageVisit", { page: "Home", source: "own" }),
            measure("PageVisit", { page: "Invite", source: "hn" }),
            measure("PageVisit", { page: "Home", source: "x" }),
            measure("PageVisit", { page: "Home", source: "other" }),
          ],
          leaked: [],
        });
      })
  );
});
