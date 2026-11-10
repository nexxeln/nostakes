import { RoomPassSchema } from "@nostakes/protocol";
import type { RoomCode } from "@nostakes/protocol";
import { Effect, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { JoinRequestSchema, OpenRequestSchema } from "../../src/poker-room.js";
import type { JoinRequest, OpenRequest } from "../../src/poker-room.js";
import { TEST_ORIGIN } from "./toy-worker.js";

const encodeOpen = Schema.encodeSync(Schema.toCodecJson(OpenRequestSchema));

const encodeJoin = Schema.encodeSync(Schema.toCodecJson(JoinRequestSchema));

export const postJson = (url: URL, body: Schema.Json, origin = TEST_ORIGIN) =>
  HttpClientRequest.post(url).pipe(
    HttpClientRequest.setHeader("origin", origin),
    HttpClientRequest.bodyJsonUnsafe(body),
    HttpClient.execute
  );

export class PassRefused extends Schema.TaggedError<
  PassRefused,
  { readonly brand: unique symbol }
>()("PassRefused", { body: Schema.String, status: Schema.Int }) {
  override get message() {
    return `The server answered ${this.status} ${this.body} instead of a room pass. Read the refusal and the server's log.`;
  }
}

const passFrom = <E, R>(
  response: Effect.Effect<
    { readonly status: number; readonly json: Effect.Effect<unknown, E> },
    E,
    R
  >
) =>
  response.pipe(
    Effect.orDie,
    Effect.flatMap((reply) =>
      reply.json.pipe(
        Effect.orDie,
        Effect.flatMap((json) =>
          Schema.decodeUnknownEffect(RoomPassSchema)(json).pipe(
            Effect.mapError(
              () =>
                new PassRefused({
                  body: JSON.stringify(json),
                  status: reply.status,
                })
            )
          )
        )
      )
    )
  );

export const createPokerRoom = (base: string, request: OpenRequest) =>
  passFrom(postJson(new URL("/rooms", base), encodeOpen(request)));

export const joinPokerRoom = (
  base: string,
  code: RoomCode,
  request: JoinRequest
) =>
  passFrom(
    postJson(new URL(`/rooms/${code}/members`, base), encodeJoin(request))
  );
