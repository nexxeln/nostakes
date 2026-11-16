import { Effect, Option } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import type { SiteStage } from "./site.js";

export type Indexing = "Indexed" | "Unindexed";

export const indexingOf = (stage: SiteStage): Indexing =>
  stage === "production" ? "Indexed" : "Unindexed";

export const ROBOTS_HEADER = "x-robots-tag";

export const ROOM_ROBOTS = "noindex, nofollow";

export const UNINDEXED_ROBOTS = "noindex";

export const UNINDEXED_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

const SWITCHING_PROTOCOLS = 101;

export const roomApi = (path: string) =>
  path === "/rooms" || path.startsWith("/rooms/");

export const namesARoom = (path: string) =>
  roomApi(path) || path.startsWith("/r/");

export const robotsTagOf = (
  indexing: Indexing,
  path: string
): Option.Option<string> => {
  if (namesARoom(path)) {
    return Option.some(ROOM_ROBOTS);
  }

  return indexing === "Indexed" ? Option.none() : Option.some(UNINDEXED_ROBOTS);
};

export const withRobotsTag =
  (indexing: Indexing) =>
  <E, R>(
    handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
  ): Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    R | HttpServerRequest.HttpServerRequest
  > =>
    Effect.gen(function* tagForSearch() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const response = yield* handler;
      const { pathname } = new URL(request.url, "http://site");

      return response.status === SWITCHING_PROTOCOLS
        ? response
        : Option.match(robotsTagOf(indexing, pathname), {
            onNone: () => response,
            onSome: (tag) =>
              HttpServerResponse.setHeader(response, ROBOTS_HEADER, tag),
          });
    });
