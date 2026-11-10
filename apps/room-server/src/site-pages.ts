import { Data, Effect, Layer, Option, Predicate, Schema } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import type { Recorder } from "./analytics.js";
import { measure } from "./measures.js";
import { siteOrigin } from "./site.js";

export interface AssetFetcher {
  readonly fetch: (request: Request) => Promise<Response>;
}

export const AssetFetcherSchema = Schema.declare(
  (input): input is AssetFetcher =>
    Predicate.hasProperty(input, "fetch") && Predicate.isFunction(input.fetch)
);

const NO_ASSETS = new Response(null, { status: 404 });

export const assetsFrom = (binding: Option.Option<AssetFetcher>) => ({
  fetch: (request: Request) =>
    Option.match(binding, {
      onNone: () => Promise.resolve(NO_ASSETS.clone()),
      onSome: (assets) => assets.fetch(request),
    }),
});

export const PAGE_ROUTES = ["/", "/r/*", "/preview/*"];

export const HOME_PAGE = "/index.html";

export const INVITE_PAGE = "/invite.html";

export const PAGE_ORIGIN = siteOrigin("production");

const pageUrlTag = (address: string) =>
  `<meta property="og:url" content="${address}" />`;

const MEDIA_CACHE = "public, max-age=86400";

export type ByteRange = Data.TaggedEnum<{
  Whole: { readonly size: number };
  Part: { readonly start: number; readonly end: number; readonly size: number };
  Unsatisfiable: { readonly size: number };
}>;

export const ByteRanges = Data.taggedEnum<ByteRange>();

const SINGLE_RANGE = /^bytes=(?<first>\d*)-(?<last>\d*)$/u;

export const byteRangeOf = (
  header: string | undefined,
  size: number
): ByteRange => {
  const groups = SINGLE_RANGE.exec(header?.trim() ?? "")?.groups;
  const first = groups?.first ?? "";
  const last = groups?.last ?? "";

  if (groups === undefined || (first === "" && last === "")) {
    return ByteRanges.Whole({ size });
  }

  if (first === "") {
    const suffix = Number(last);

    return suffix === 0 || size === 0
      ? ByteRanges.Unsatisfiable({ size })
      : ByteRanges.Part({
          end: size - 1,
          size,
          start: Math.max(0, size - suffix),
        });
  }

  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);

  if (start >= size) {
    return ByteRanges.Unsatisfiable({ size });
  }

  return end < start
    ? ByteRanges.Whole({ size })
    : ByteRanges.Part({ end, size, start });
};

const fromAssets = (assets: AssetFetcher, pathOf: (url: URL) => string) =>
  Effect.gen(function* readAsset() {
    const request = yield* HttpServerRequest.HttpServerRequest.pipe(
      Effect.flatMap((incoming) => HttpServerRequest.toWeb(incoming)),
      Effect.orDie
    );

    const url = new URL(request.url);

    const response = yield* Effect.promise(() =>
      assets.fetch(new Request(new URL(pathOf(url), url), { method: "GET" }))
    );

    return { request, response, url };
  });

const keptHeaders = (from: Headers, names: readonly string[]) =>
  Object.fromEntries(
    names.flatMap((name) =>
      Option.match(Option.fromNullishOr(from.get(name)), {
        onNone: () => [],
        onSome: (value) => [[name, value] as const],
      })
    )
  );

export type SitePage = "Home" | "Invite";

const visited = (request: Request) =>
  request.method === "GET" &&
  request.headers.get("sec-fetch-dest") === "document";

const page = <R>(
  assets: AssetFetcher,
  path: string,
  kind: SitePage,
  record: Recorder<R>
) =>
  Effect.gen(function* servePage() {
    const { request, response, url } = yield* fromAssets(assets, () => path);

    if (!response.ok) {
      return HttpServerResponse.fromWeb(response);
    }

    if (visited(request)) {
      yield* record([measure("PageVisit", { page: kind })]);
    }

    const html = new TextEncoder().encode(
      (yield* Effect.promise(() => response.text()))
        .replace(
          pageUrlTag(`${PAGE_ORIGIN}/`),
          pageUrlTag(url.origin + url.pathname)
        )
        .replaceAll(PAGE_ORIGIN, url.origin)
    );

    return HttpServerResponse.uint8Array(html, {
      contentType: "text/html; charset=utf-8",
      headers: {
        ...keptHeaders(response.headers, ["cache-control"]),
        "content-length": String(html.length),
      },
      status: response.status,
    });
  });

const media = (assets: AssetFetcher) =>
  Effect.gen(function* serveMedia() {
    const { request, response } = yield* fromAssets(
      assets,
      (url) => url.pathname
    );

    if (!response.ok) {
      return HttpServerResponse.fromWeb(response);
    }

    const body = new Uint8Array(
      yield* Effect.promise(() => response.arrayBuffer())
    );

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    const answer = (
      bytes: Uint8Array,
      status: number,
      range: Readonly<Record<string, string>>
    ) =>
      HttpServerResponse.uint8Array(bytes, {
        contentType,
        headers: {
          ...keptHeaders(response.headers, ["etag", "last-modified"]),
          ...range,
          "accept-ranges": "bytes",
          "cache-control": MEDIA_CACHE,
          "content-length": String(bytes.length),
        },
        status,
      });

    return ByteRanges.$match(
      byteRangeOf(request.headers.get("range") ?? undefined, body.length),
      {
        Part: ({ end, size, start }) =>
          answer(body.subarray(start, end + 1), 206, {
            "content-range": `bytes ${start}-${end}/${size}`,
          }),
        Unsatisfiable: ({ size }) =>
          answer(new Uint8Array(0), 416, {
            "content-range": `bytes */${size}`,
          }),
        Whole: () => answer(body, 200, {}),
      }
    );
  });

export const sitePages = <R>(assets: AssetFetcher, record: Recorder<R>) =>
  Layer.mergeAll(
    HttpRouter.add("*", "/", page(assets, HOME_PAGE, "Home", record)),
    HttpRouter.add("*", "/r/*", page(assets, INVITE_PAGE, "Invite", record)),
    HttpRouter.add("*", "/preview/*", media(assets))
  );
