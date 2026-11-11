import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";

const socketClosedBeforeAnswer = (failure: HttpClientError.HttpClientError) =>
  failure.reason instanceof HttpClientError.TransportError &&
  failure.reason.cause instanceof Error &&
  failure.reason.cause.cause instanceof Error &&
  "code" in failure.reason.cause.cause &&
  failure.reason.cause.cause.code === "UND_ERR_SOCKET";

export const answeringAfterStalls = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* answeringAfterStalls() {
    const client = yield* HttpClient.HttpClient;

    return client.pipe(
      HttpClient.retry({ times: 1, while: socketClosedBeforeAnswer })
    );
  })
).pipe(Layer.provide(FetchHttpClient.layer));
