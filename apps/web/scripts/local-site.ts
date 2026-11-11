import { Config, Deferred, Effect, Option, Schema, Stream } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";
import type { BrowserType } from "playwright-core";
import { createServer } from "vite";
import type { InlineConfig, ProxyOptions } from "vite";

const REPO = new URL("../../..", import.meta.url).pathname;

const WEB = new URL("..", import.meta.url).pathname;

const ROOM_SERVER_READY = /ready at (?<url>http:\/\/localhost:\d+)/u;

const NOWHERE_YET = "http://localhost:9";

export class LocalSiteFailed extends Schema.TaggedError<
  LocalSiteFailed,
  { readonly brand: unique symbol }
>()("LocalSiteFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {
  override get message() {
    return `Could not run the local site at "${this.step}": ${this.detail}. Run pnpm build first, and if WEB_PORT or STAGE_PORT is set, check that nothing else holds it.`;
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
  webOrigin: string,
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
          ALLOWED_ORIGINS: webOrigin,
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

const portFrom = (name: string) =>
  Config.Int(name).pipe(
    Config.withDefault(0),
    Effect.mapError(
      (failure) =>
        new LocalSiteFailed({
          detail: failure.message,
          step: `read ${name}`,
        })
    )
  );

export const servedVite = (
  step: string,
  portName: string,
  config: InlineConfig
) =>
  Effect.gen(function* serveVite() {
    const port = yield* portFrom(portName);

    const server = yield* Effect.acquireRelease(
      Effect.tryPromise({
        catch: (cause) => new LocalSiteFailed({ detail: String(cause), step }),
        try: () =>
          createServer({
            ...config,
            server: { ...config.server, port, strictPort: true },
          }),
      }),
      (vite) => Effect.promise(() => vite.close())
    );

    yield* Effect.tryPromise({
      catch: (cause) => new LocalSiteFailed({ detail: String(cause), step }),
      try: () => server.listen(),
    });

    const [address] = server.resolvedUrls?.local ?? [];

    return address === undefined
      ? yield* new LocalSiteFailed({ detail: "it reported no address", step })
      : address.replace(/\/$/u, "");
  });

export interface WebApp {
  readonly url: string;
  readonly reach: (roomServer: string) => void;
}

export const localWebApp = Effect.gen(function* startWebApp() {
  const routes: ProxyOptions[] = [];

  const url = yield* servedVite("start the web app", "WEB_PORT", {
    logLevel: "silent",
    root: WEB,
    server: {
      proxy: {
        "/rooms": {
          configure: (_proxy, route) => {
            routes.push(route);
          },
          target: NOWHERE_YET,
          ws: true,
        },
      },
    },
  });

  const app: WebApp = {
    reach: (roomServer) => {
      for (const route of routes) {
        route.target = roomServer;
      }
    },
    url,
  };

  return app;
});

export const localSite = (stage: string) =>
  Effect.gen(function* startLocalSite() {
    const web = yield* localWebApp;
    const roomServer = yield* localRoomServer(web.url, stage);

    web.reach(roomServer);

    return { app: web.url, roomServer };
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
