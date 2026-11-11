import { Effect, Option } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { checkPath } from "../features/wire.js";

const NOT_FOUND = 404;

const QUIET_MEANS_THERE = "2500 millis";

export const roomIsGone = (code: string) =>
  HttpClientRequest.post(
    new URL(checkPath(code), globalThis.location.href)
  ).pipe(
    HttpClient.execute,
    Effect.map((response) => response.status === NOT_FOUND),
    Effect.timeoutOption(QUIET_MEANS_THERE),
    Effect.map(Option.getOrElse(() => false)),
    Effect.orElseSucceed(() => false),
    Effect.provide(FetchHttpClient.layer)
  );
