import { Deferred, Effect, Option, Schema, Stream } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";
import type { BrowserType } from "playwright-core";

const REPO = new URL("../../..", import.meta.url).pathname;

const ROOM_SERVER_READY = /ready at (?<url>http:\/\/localhost:\d+)/u;

const WEB_READY = /Local:\s+(?<url>http:\/\/localhost:\d+)/u;

export class LocalSiteFailed extends Schema.TaggedError<
  LocalSiteFailed,
  { readonly brand: unique symbol }
>()("LocalSiteFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {
  override get message() {
    return `Could not run the local site at "${this.step}": ${this.detail}. Run pnpm build first, and check that nothing else holds the ports.`;
  }
}

const started = (label: string, ready: RegExp, command: ChildProcess.Command) =>
  Effect.gen(function* startProcess() {
    const url = yield* Deferred.make<string>();
    const handle = yield* command;

    yield* handle.all.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) =>
        Option.match(Option.fromNullishOr(ready.exec(line)?.groups?.url), {
          onNone: () => Effect.void,
          onSome: (found) => Deferred.succeed(url, found),
        })
      ),
      Effect.ignore,
      Effect.forkScoped
    );

    return yield* Deferred.await(url).pipe(
      Effect.timeout("90 seconds"),
      Effect.mapError(
        () =>
          new LocalSiteFailed({
            detail: "never said it was ready",
            step: label,
          })
      )
    );
  });

export const localRoomServer = (
  webPort: number,
  stage: string,
  build: Option.Option<string> = Option.none()
) =>
  started(
    "start the room server",
    ROOM_SERVER_READY,
    ChildProcess.make(
      "pnpm",
      [
        "--filter",
        "@nostakes/room-server",
        "exec",
        "alchemy",
        "dev",
        "--no-input",
        "--stage",
        stage,
        "scripts/local.run.ts",
      ],
      {
        cwd: REPO,
        env: {
          ALLOWED_ORIGINS: `http://localhost:${webPort}`,
          CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
          NO_COLOR: "1",
          ...Option.match(build, {
            onNone: () => ({}),
            onSome: (served) => ({ WEB_BUILD: served }),
          }),
        },
        extendEnv: true,
        killSignal: "SIGINT",
      }
    )
  );

export const localWebApp = (webPort: number, roomServer: string) =>
  started(
    "start the web app",
    WEB_READY,
    ChildProcess.make(
      "pnpm",
      [
        "--filter",
        "@nostakes/web",
        "exec",
        "vite",
        "dev",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        cwd: REPO,
        env: { NO_COLOR: "1", ROOM_SERVER_URL: roomServer },
        extendEnv: true,
      }
    )
  );

export const localSite = (webPort: number, stage: string) =>
  Effect.gen(function* startLocalSite() {
    const roomServer = yield* localRoomServer(webPort, stage);
    const app = yield* localWebApp(webPort, roomServer);

    return { app, roomServer };
  });

export const mutedBrowser = (engine: BrowserType) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      catch: (cause) =>
        new LocalSiteFailed({
          detail: String(cause),
          step: `launch a headless, muted ${engine.name()}`,
        }),
      try: () =>
        engine.launch({
          args: engine.name() === "chromium" ? ["--mute-audio"] : [],
          headless: true,
        }),
    }),
    (opened) => Effect.promise(() => opened.close())
  );
