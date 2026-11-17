import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { realtimeCalls } from "../src/realtime.js";

const SESSION = "4f2d9c0a7b1e3f5d8c6a2b9e0d1f3a5c";

const SDP = "v=0\r\no=- 46117317 2 IN IP4 127.0.0.1\r\ns=-\r\na=mid:0";

const servedWith = (status: number, errorCode: string) =>
  realtimeCalls(
    HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json({ errorCode, sessionId: SESSION }, { status })
        )
      )
    ),
    {
      appId: "app",
      appSecret: Redacted.make("secret"),
      turn: Option.none(),
    }
  );

const detailOf = (status: number, errorCode: string) =>
  servedWith(status, errorCode).newSession.pipe(
    Effect.flip,
    Effect.map((failure) => `${failure.step} ${failure.code}`)
  );

describe("the detail a refused voice call carries", () => {
  it.effect(
    "names only the step and Cloudflare's code, never an id or an SDP Cloudflare echoed",
    () =>
      Effect.gen(function* detailHoldsNoSecret() {
        const details = yield* Effect.all([
          detailOf(410, "session_error"),
          detailOf(200, "invalid_session"),
          detailOf(400, `bad ${SESSION}`),
          detailOf(200, SDP),
          detailOf(500, `track ${SESSION}\r\nx-injected: 1`),
        ]);

        expect(details).toStrictEqual([
          "NewSession Status410 session_error",
          "NewSession invalid_session",
          "NewSession Status400 bad",
          "NewSession Unreadable Unreadable",
          "NewSession Status500 track",
        ]);
      })
  );
});
