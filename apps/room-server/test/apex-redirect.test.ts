import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { redirectToApex } from "../src/apex-redirect.js";

const redirected = (address: string) =>
  redirectToApex.pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(new Request(address))
    ),
    Effect.map((response) => {
      const web = HttpServerResponse.toWeb(response);

      return { location: web.headers.get("location"), status: web.status };
    })
  );

describe("the www host", () => {
  it.effect(
    "sends every path and query on www to the same place on the apex, for good",
    () =>
      Effect.gen(function* sendToApex() {
        expect(
          yield* Effect.all([
            redirected("https://www.nostakes.club/"),
            redirected("https://www.nostakes.club/r/K7P2XZ?from=chat"),
            redirected("https://www.nostakes.club/privacy"),
          ])
        ).toEqual([
          { location: "https://nostakes.club/", status: 301 },
          { location: "https://nostakes.club/r/K7P2XZ?from=chat", status: 301 },
          { location: "https://nostakes.club/privacy", status: 301 },
        ]);
      })
  );
});
