import * as Cloudflare from "@alchemy.run/cloudflare";
import type { RoomCode } from "@nostakes/protocol";
import * as Alchemy from "alchemy";
import * as State from "alchemy/State";
import { Effect, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { InspectionSchema } from "../../src/room-rpc.js";
import ToyWorker from "./toy-worker.js";

export const ToyStack = Alchemy.Stack(
  "RoomServerTest",
  { providers: Cloudflare.providers(), state: State.inMemoryState() },
  Effect.gen(function* toyStack() {
    const worker = yield* ToyWorker;

    return { url: worker.url };
  })
);

export const inspect = (base: string, code: RoomCode) =>
  HttpClient.get(new URL(`/test/rooms/${code}`, base)).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(InspectionSchema)),
    Effect.orDie
  );

export const restart = (base: string, code: RoomCode) =>
  HttpClient.post(new URL(`/test/rooms/${code}/restart`, base)).pipe(
    Effect.asVoid,
    Effect.orDie
  );

export const wakeAt = (base: string, code: RoomCode, at: number) =>
  HttpClientRequest.post(new URL(`/test/rooms/${code}/alarm`, base)).pipe(
    HttpClientRequest.bodyJsonUnsafe({ at }),
    HttpClient.execute,
    Effect.asVoid,
    Effect.orDie
  );

export const queueCodes = (base: string, codes: readonly RoomCode[]) =>
  HttpClientRequest.post(new URL("/test/codes", base)).pipe(
    HttpClientRequest.bodyJsonUnsafe({ codes }),
    HttpClient.execute,
    Effect.asVoid,
    Effect.orDie
  );
