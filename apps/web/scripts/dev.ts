import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Deferred, Effect, Option, Schema, Stream } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";
import type { ChildProcessHandle } from "effect/process/ChildProcessSpawner";

const REPO = new URL("../../..", import.meta.url).pathname;

const WEB_PORT = 5173;

const ROOM_SERVER_READY = /ready at (?<url>http:\/\/localhost:\d+)/u;

const READY_WITHIN = "120 seconds";

class DevStartFailed extends Schema.TaggedError<
  DevStartFailed,
  { readonly brand: unique symbol }
>()("DevStartFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {
  override get message() {
    return `pnpm dev could not ${this.step}: ${this.detail}. Run pnpm --filter @nostakes/room-server dev on its own to see why.`;
  }
}

const echoed = (label: string, handle: ChildProcessHandle) =>
  handle.all.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.tap((line) => Console.log(`${label} │ ${line}`))
  );

const roomServer = Effect.gen(function* startRoomServer() {
  const url = yield* Deferred.make<string>();

  const handle = yield* ChildProcess.make(
    "pnpm",
    ["--filter", "@nostakes/room-server", "run", "dev"],
    { cwd: REPO, extendEnv: true, killSignal: "SIGINT" }
  );

  yield* echoed("rooms", handle).pipe(
    Stream.runForEach((line) =>
      Option.match(
        Option.fromNullishOr(ROOM_SERVER_READY.exec(line)?.groups?.url),
        {
          onNone: () => Effect.void,
          onSome: (found) => Deferred.succeed(url, found),
        }
      )
    ),
    Effect.ignore,
    Effect.forkScoped
  );

  return yield* Deferred.await(url).pipe(
    Effect.timeout(READY_WITHIN),
    Effect.mapError(
      () =>
        new DevStartFailed({
          detail: `it never said it was ready within ${READY_WITHIN}`,
          step: "start the room server",
        })
    )
  );
});

const webApp = (roomServerUrl: string) =>
  Effect.gen(function* startWebApp() {
    const handle = yield* ChildProcess.make(
      "pnpm",
      [
        "--filter",
        "@nostakes/web",
        "exec",
        "vite",
        "dev",
        "--port",
        String(WEB_PORT),
        "--strictPort",
      ],
      {
        cwd: REPO,
        env: { ROOM_SERVER_URL: roomServerUrl },
        extendEnv: true,
      }
    );

    yield* echoed("web", handle).pipe(
      Stream.runDrain,
      Effect.ignore,
      Effect.forkScoped
    );

    return yield* handle.exitCode;
  });

const dev = Effect.gen(function* runDev() {
  const roomServerUrl = yield* roomServer;

  yield* Console.log(`room server at ${roomServerUrl}, proxied from /rooms`);

  const exitCode = yield* webApp(roomServerUrl);

  return yield* new DevStartFailed({
    detail: `vite exited with code ${exitCode}`,
    step: "keep the web app running",
  });
});

await Effect.runPromise(
  dev.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
