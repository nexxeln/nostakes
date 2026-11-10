import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { ByteRanges, byteRangeOf, sitePages } from "../src/site-pages.js";
import type { AssetFetcher } from "../src/site-pages.js";

const STAGE = "https://preview.nostakes.club";

const Size = Schema.Int.check(Schema.isBetween({ maximum: 4096, minimum: 1 }));

const Offset = Schema.Int.check(
  Schema.isBetween({ maximum: 8192, minimum: 0 })
);

const CLIP = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);

const pageText = (title: string) =>
  `<title>${title}</title><meta property="og:image" content="https://nostakes.club/preview/card.png" />`;

const ASSET_FILES = new Map<string, Response>([
  [
    "/index.html",
    new Response(pageText("home"), {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "text/html",
      },
    }),
  ],
  [
    "/invite.html",
    new Response(pageText("invite"), {
      headers: { "content-type": "text/html" },
    }),
  ],
  [
    "/preview/clip.mp4",
    new Response(CLIP, {
      headers: { "content-type": "video/mp4", etag: '"clip"' },
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

const answer = (path: string, init: RequestInit = {}) =>
  Effect.gen(function* answerRequest() {
    const handle = yield* HttpRouter.toHttpEffect(sitePages(assets));

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

describe("byte ranges", () => {
  it.prop(
    "a closed range inside the file is served exactly, and one starting past it is refused",
    {
      first: Arbitrary.schema(Offset),
      last: Arbitrary.schema(Offset),
      size: Arbitrary.schema(Size),
    },
    ({ first, last, size }) => {
      const start = Math.min(first, last);
      const end = Math.max(first, last);

      expect(byteRangeOf(`bytes=${start}-${end}`, size)).toEqual(
        start >= size
          ? ByteRanges.Unsatisfiable({ size })
          : ByteRanges.Part({ end: Math.min(end, size - 1), size, start })
      );
    }
  );

  it.prop(
    "a suffix range serves the last bytes, and never more than the file",
    { size: Arbitrary.schema(Size), suffix: Arbitrary.schema(Offset) },
    ({ size, suffix }) => {
      expect(byteRangeOf(`bytes=-${suffix}`, size)).toEqual(
        suffix === 0
          ? ByteRanges.Unsatisfiable({ size })
          : ByteRanges.Part({
              end: size - 1,
              size,
              start: Math.max(0, size - suffix),
            })
      );
    }
  );

  it("serves the whole file for no range, several ranges, or a range it cannot read", () => {
    expect(
      ["", "bytes=0-1,4-5", "items=0-4", "bytes=-", "bytes=9-3"].map((header) =>
        byteRangeOf(header === "" ? undefined : header, 10)
      )
    ).toEqual(Array.from({ length: 5 }, () => ByteRanges.Whole({ size: 10 })));
  });
});

describe("the site's pages", () => {
  it.effect(
    "serve the home page and a room link with the stage's own origin",
    () =>
      Effect.gen(function* servePages() {
        const decoder = new TextDecoder();
        const home = yield* answer("/");
        const invite = yield* answer("/r/QT8VND");

        expect({
          home: decoder.decode(home.body),
          homeCache: home.headers["cache-control"],
          invite: decoder.decode(invite.body),
          type: invite.headers["content-type"],
        }).toEqual({
          home: `<title>home</title><meta property="og:image" content="${STAGE}/preview/card.png" />`,
          homeCache: "public, max-age=0, must-revalidate",
          invite: `<title>invite</title><meta property="og:image" content="${STAGE}/preview/card.png" />`,
          type: "text/html; charset=utf-8",
        });
      })
  );

  it.effect("answer a crawler's HEAD with the page's type and length", () =>
    Effect.gen(function* headPage() {
      const head = yield* answer("/r/QT8VND", { method: "HEAD" });
      const page = yield* answer("/r/QT8VND");

      expect({
        length: head.headers["content-length"],
        status: head.status,
        type: head.headers["content-type"],
      }).toEqual({
        length: String(page.body.length),
        status: 200,
        type: "text/html; charset=utf-8",
      });
    })
  );
});

describe("the preview clip", () => {
  it.effect("is served whole with its type and a promise of ranges", () =>
    Effect.gen(function* wholeClip() {
      const whole = yield* answer("/preview/clip.mp4");

      expect({
        bytes: whole.body.length,
        headers: whole.headers,
        status: whole.status,
      }).toEqual({
        bytes: CLIP.length,
        headers: {
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400",
          "content-length": String(CLIP.length),
          "content-type": "video/mp4",
          etag: '"clip"',
        },
        status: 200,
      });
    })
  );

  it.effect("answers a range with 206 and exactly those bytes", () =>
    Effect.gen(function* rangedClip() {
      const part = yield* answer("/preview/clip.mp4", {
        headers: { range: "bytes=500-509" },
      });

      expect({
        body: [...part.body],
        range: part.headers["content-range"],
        status: part.status,
      }).toEqual({
        body: [...CLIP.subarray(500, 510)],
        range: "bytes 500-509/1000",
        status: 206,
      });
    })
  );

  it.effect("refuses a range that starts past the end with 416", () =>
    Effect.gen(function* pastTheEnd() {
      const refused = yield* answer("/preview/clip.mp4", {
        headers: { range: "bytes=1000-" },
      });

      expect({
        range: refused.headers["content-range"],
        status: refused.status,
      }).toEqual({ range: "bytes */1000", status: 416 });
    })
  );

  it.effect("passes a missing file through as the asset layer's 404", () =>
    Effect.gen(function* missingClip() {
      const missing = yield* answer("/preview/nothing.mp4");

      expect(missing.status).toBe(404);
    })
  );
});
