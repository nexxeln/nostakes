import { Effect } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { ZONE } from "./site.js";

export const WWW_HOST = `www.${ZONE}`;

export const APEX_ORIGIN = `https://${ZONE}`;

export const apexLocation = (url: URL) =>
  `${APEX_ORIGIN}${url.pathname}${url.search}`;

export const redirectToApex = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((incoming) => HttpServerRequest.toWeb(incoming)),
  Effect.map((request) =>
    HttpServerResponse.redirect(apexLocation(new URL(request.url)), {
      headers: { "cache-control": "public, max-age=86400" },
      status: 301,
    })
  ),
  Effect.orElseSucceed(() =>
    HttpServerResponse.redirect(APEX_ORIGIN, { status: 301 })
  )
);
