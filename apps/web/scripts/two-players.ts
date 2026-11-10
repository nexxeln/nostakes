import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Console,
  Deferred,
  Effect,
  Option,
  Schedule,
  Schema,
  Stream,
} from "effect";
import * as ChildProcess from "effect/process/ChildProcess";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

const WEB_PORT = 5199;

const WEB = `http://localhost:${WEB_PORT}`;

const REPO = new URL("../../..", import.meta.url).pathname;

const ROOM_SERVER_READY = /ready at (?<url>http:\/\/localhost:\d+)/u;

const WEB_READY = /Local:\s+(?<url>http:\/\/localhost:\d+)/u;

class NightFailed extends Schema.TaggedError<
  NightFailed,
  { readonly brand: unique symbol }
>()("NightFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {
  override get message() {
    return `Two players could not finish a hand at "${this.step}": ${this.detail}. Run pnpm dev and play the same steps by hand to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new NightFailed({ detail: String(cause), step }),
    try: run,
  });

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
          new NightFailed({ detail: "never said it was ready", step: label })
      )
    );
  });

const roomServer = started(
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
      "verify_web",
      "scripts/local.run.ts",
    ],
    {
      cwd: REPO,
      env: {
        ALLOWED_ORIGINS: WEB,
        CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
        NO_COLOR: "1",
      },
      extendEnv: true,
      killSignal: "SIGINT",
    }
  )
);

const webServer = (roomServerUrl: string) =>
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
        String(WEB_PORT),
        "--strictPort",
      ],
      {
        cwd: REPO,
        env: { NO_COLOR: "1", ROOM_SERVER_URL: roomServerUrl },
        extendEnv: true,
      }
    )
  );

const browser = Effect.acquireRelease(
  attempt("launch a headless, muted browser", () =>
    chromium.launch({ args: ["--mute-audio"], headless: true })
  ),
  (opened) => Effect.promise(() => opened.close())
);

const player = (opened: Browser) =>
  attempt("open a window", () => opened.newContext()).pipe(
    Effect.flatMap((context) => attempt("open a page", () => context.newPage()))
  );

const click = (page: Page, step: string, name: string | RegExp) =>
  attempt(step, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* click(page, `${who} picks a seat`, "Sit");
    yield* click(page, `${who} sits down`, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page.getByText("Stand up").waitFor({ timeout: 15_000 })
    );
  });

const enabledButton = (page: Page, name: RegExp) =>
  attempt("look for a button", () =>
    page.getByRole("button", { name }).first().isEnabled({ timeout: 50 })
  ).pipe(Effect.orElseSucceed(() => false));

const PASSIVE = /^(?:Check|Call \d+|Show my hand|Once)$/u;

const actOnce = (pages: readonly Page[]) =>
  Effect.gen(function* actForWhoeverCan() {
    for (const page of pages) {
      if (yield* enabledButton(page, PASSIVE)) {
        yield* attempt("act", () =>
          page.getByRole("button", { name: PASSIVE }).first().click()
        );

        return;
      }
    }
  });

const winner = (page: Page) =>
  attempt("read the result", () =>
    page.locator(".awards li").first().textContent({ timeout: 50 })
  ).pipe(
    Effect.map((text) => text?.trim() ?? ""),
    Effect.orElseSucceed(() => "")
  );

const playHand = (pages: readonly Page[], watcher: Page) =>
  actOnce(pages).pipe(
    Effect.andThen(winner(watcher)),
    Effect.repeat({
      schedule: Schedule.spaced("300 millis"),
      times: 200,
      until: (result) => result.length > 0,
    }),
    Effect.filterOrFail(
      (result) => result.length > 0,
      () =>
        new NightFailed({
          detail: "no pot was awarded",
          step: "play the hand to a result",
        })
    )
  );

const night = Effect.gen(function* playOneHand() {
  const roomServerUrl = yield* roomServer;

  yield* Console.log(`room server at ${roomServerUrl}`);

  const web = yield* webServer(roomServerUrl);

  yield* Console.log(`web app at ${web}`);

  const opened = yield* browser;
  const ana = yield* player(opened);
  const ben = yield* player(opened);

  yield* attempt("Ana opens the home page", () => ana.goto(WEB));
  yield* attempt("Ana types her name", () =>
    ana.getByPlaceholder("Name").fill("Ana", { timeout: 60_000 })
  );
  yield* click(ana, "Ana opens a room", "Open a room");
  yield* attempt("Ana lands in the room", () =>
    ana.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
  );

  const link = ana.url();

  yield* Console.log(`room link ${link}`);
  yield* attempt("Ben opens the link", () => ben.goto(link));
  yield* attempt("Ben types his name", () =>
    ben.getByPlaceholder("Name").fill("Ben")
  );
  yield* click(ben, "Ben joins", "Join the room");
  yield* sitDown(ana, "Ana");
  yield* sitDown(ben, "Ben");
  yield* click(ana, "Ana starts the game", "Start the game");

  const result = yield* playHand([ana, ben], ana);

  yield* Console.log(`hand 1: ${result}`);
});

await Effect.runPromise(
  night.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
