import { Effect, Option, Result, Stream } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";

export type BodyRefusal = "BadRequest" | "BodyTooLarge";

interface Collected {
  readonly bytes: number;
  readonly chunks: readonly Uint8Array[];
}

const NOTHING: Collected = { bytes: 0, chunks: [] };

const utf8 = new TextDecoder("utf-8", { fatal: true });

const joined = ({ bytes, chunks }: Collected) => {
  const whole = new Uint8Array(bytes);
  let offset = 0;

  for (const chunk of chunks) {
    whole.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return whole;
};

const declaredLength = (request: HttpServerRequest.HttpServerRequest) =>
  Number(request.headers["content-length"] ?? "0");

export const bodyWithin = (
  limit: number
): Effect.Effect<
  Result.Result<string, BodyRefusal>,
  never,
  HttpServerRequest.HttpServerRequest
> =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.flatMap((request) =>
      declaredLength(request) > limit
        ? Effect.succeed(Result.fail<BodyRefusal>("BodyTooLarge"))
        : request.stream.pipe(
            Stream.scan(
              (): Collected => NOTHING,
              (collected, chunk): Collected => ({
                bytes: collected.bytes + chunk.byteLength,
                chunks: [...collected.chunks, chunk],
              })
            ),
            Stream.takeUntil(({ bytes }) => bytes > limit),
            Stream.runLast,
            Effect.map((last) => {
              const collected = Option.getOrElse(last, () => NOTHING);

              return collected.bytes > limit
                ? Result.fail<BodyRefusal>("BodyTooLarge")
                : Result.try({
                    catch: (): BodyRefusal => "BadRequest",
                    try: () => utf8.decode(joined(collected)),
                  });
            }),
            Effect.orElseSucceed(() => Result.fail<BodyRefusal>("BadRequest"))
          )
    )
  );
