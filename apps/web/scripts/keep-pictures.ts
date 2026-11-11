import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Option, pipe, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { chromium, webkit } from "playwright-core";
import type { BrowserType, Page } from "playwright-core";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

import { mutedBrowser } from "./local-site.ts";
import { SHARE_STUB } from "./share-stub.ts";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE_PORT = 5194;

const STAGE = `http://localhost:${STAGE_PORT}/scripts/moments/stage.html`;

const NIGHT_STAGE = `http://localhost:${STAGE_PORT}/scripts/night/stage.html`;

const SMALLEST_PNG_BYTES = 20_000;

const SHARES = 2;

class KeepCheckFailed extends Schema.TaggedError<
  KeepCheckFailed,
  { readonly brand: unique symbol }
>()("KeepCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Keeping a picture failed at "${this.step}": ${this.detail}. Open ${STAGE}?view=live and tap Keep to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new KeepCheckFailed({ detail: String(cause), step }),
    try: run,
  });

const stageServer = Effect.acquireRelease(
  attempt("start the stage server", () =>
    createServer({
      configFile: false,
      logLevel: "warn",
      root: WEB,
      server: { port: STAGE_PORT, strictPort: true },
    })
  ).pipe(
    Effect.tap((server) =>
      attempt("listen for the stage", () => server.listen())
    )
  ),
  (server: ViteDevServer) => Effect.promise(() => server.close())
);

const SharedSchema = Schema.Array(
  Schema.Struct({
    activated: Schema.NullOr(Schema.Boolean),
    bytes: Schema.Int,
    height: Schema.Int,
    name: Schema.String,
    sameTask: Schema.Boolean,
    type: Schema.String,
    width: Schema.Int,
  })
);

type Shared = typeof SharedSchema.Type;

const PicturesSchema = Schema.Array(
  Schema.Struct({ bytes: Schema.Array(Schema.Int), name: Schema.String })
);

const unreadable = (step: string) => (failure: Schema.SchemaError) =>
  Effect.fail(new KeepCheckFailed({ detail: failure.message, step }));

const shared = (page: Page) =>
  attempt("read what was shared", () =>
    page.evaluate<string>("window.__report()")
  ).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(SharedSchema))),
    Effect.catchTag("SchemaError", unreadable("read what was shared"))
  );

const savedPictures = (page: Page, dir: string, engine: string) =>
  Effect.gen(function* savePictures() {
    const fs = yield* FileSystem.FileSystem;

    const pictures = yield* attempt("read the shared pictures", () =>
      page.evaluate<string>("window.__pictures()")
    ).pipe(
      Effect.flatMap(
        Schema.decodeEffect(Schema.fromJsonString(PicturesSchema))
      ),
      Effect.catchTag("SchemaError", unreadable("read the shared pictures"))
    );

    yield* fs.makeDirectory(dir, { recursive: true });

    for (const { bytes, name } of pictures) {
      yield* fs.writeFile(`${dir}/${engine}-${name}`, Uint8Array.from(bytes));
    }
  });

const keptAs = (found: Shared, name: string) =>
  Option.fromUndefinedOr(found.find((entry) => entry.name === name));

const checkEngine = (engine: BrowserType, dir: Option.Option<string>) =>
  Effect.gen(function* checkKeep() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("stub the share sheet", () =>
      context.addInitScript(SHARE_STUB)
    );

    const page = yield* attempt("open a page", () => context.newPage());

    yield* attempt("open the stage", () =>
      page.goto(`${STAGE}?view=live&sample=BadBeat-1&theme=Dark`)
    );
    yield* attempt("wait for both pictures to be drawn before any tap", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 30_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );
    yield* attempt("tap Keep", () =>
      page.locator("nostakes-moment .keep").click()
    );
    yield* attempt("tap Story", () =>
      page.locator("nostakes-moment .story").click()
    );
    yield* attempt("wait for both taps to reach the share sheet", () =>
      page.waitForFunction(`window.__shared.length >= ${SHARES}`, undefined, {
        timeout: 15_000,
      })
    );

    const found = yield* shared(page);
    const problems: string[] = [];

    for (const [name, width, height] of [
      ["nostakes-bad-beat.png", 1080, 1350],
      ["nostakes-bad-beat-story.png", 1080, 1920],
    ] as const) {
      Option.match(keptAs(found, name), {
        onNone: () => {
          problems.push(`${name} was never offered to the share sheet`);
        },
        onSome: (entry) => {
          if (!entry.sameTask) {
            problems.push(`${name} reached the share sheet after the tap`);
          }

          if (entry.activated === false) {
            problems.push(`${name} was shared without a user activation`);
          }

          if (
            entry.type !== "image/png" ||
            entry.bytes < SMALLEST_PNG_BYTES ||
            entry.width !== width ||
            entry.height !== height
          ) {
            problems.push(
              `${name} is ${entry.type} ${entry.width}x${entry.height}, ${entry.bytes} bytes`
            );
          }
        },
      });
    }

    if (Option.isSome(dir)) {
      yield* savedPictures(page, dir.value, engine.name());
    }

    yield* attempt("turn file sharing off", () =>
      page.evaluate(() => {
        Reflect.set(globalThis, "__canShare", false);
      })
    );

    const download = yield* attempt(
      "download where files cannot be shared",
      () =>
        Promise.all([
          page.waitForEvent("download", { timeout: 10_000 }),
          page.locator("nostakes-moment .keep").click(),
        ]).then(([started]) => started.suggestedFilename())
    );

    if (download !== "nostakes-bad-beat.png") {
      problems.push(`the download fallback saved ${download}`);
    }

    const settled = yield* attempt("open a settled screen's keep row", () =>
      context.newPage()
    );

    yield* attempt("open the night stage", () =>
      settled.goto(
        `${NIGHT_STAGE}?view=keep&card=settle&sample=nine&theme=Light`
      )
    );
    yield* attempt("draw the settle-up at both sizes before any tap", () =>
      settled
        .locator('nostakes-keep[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 30_000 })
    );
    yield* attempt("tap Share as a picture", () =>
      settled.locator("nostakes-keep .keep").click()
    );
    yield* attempt("tap Story beside it", () =>
      settled.locator("nostakes-keep .story").click()
    );
    yield* attempt(
      "wait for both settle-up taps to reach the share sheet",
      () =>
        settled.waitForFunction(
          `window.__shared.length >= ${SHARES}`,
          undefined,
          {
            timeout: 15_000,
          }
        )
    );

    const settledFound = yield* shared(settled);

    for (const [name, width, height] of [
      ["nostakes-settle-up.png", 1080, 1350],
      ["nostakes-settle-up-story.png", 1080, 1920],
    ] as const) {
      Option.match(keptAs(settledFound, name), {
        onNone: () => {
          problems.push(`${name} was never offered to the share sheet`);
        },
        onSome: (entry) => {
          if (
            !entry.sameTask ||
            entry.width !== width ||
            entry.height !== height ||
            entry.type !== "image/png"
          ) {
            problems.push(
              `${name} reached the share sheet ${entry.sameTask ? "in" : "after"} the tap as ${entry.type} ${entry.width}x${entry.height}`
            );
          }
        },
      });
    }

    if (Option.isSome(dir)) {
      yield* savedPictures(settled, dir.value, engine.name());
    }

    yield* Console.log(
      `${problems.length === 0 ? "ok  " : "FAIL"} ${engine.name()}: settle-up ${settledFound
        .map(
          (entry) =>
            `${entry.name} ${entry.width}x${entry.height} in the tap ${String(entry.sameTask)}`
        )
        .join("; ")}`
    );
    yield* Console.log(
      `${problems.length === 0 ? "ok  " : "FAIL"} ${engine.name()}: ${found
        .map(
          (entry) =>
            `${entry.name} ${entry.width}x${entry.height} in the tap ${String(entry.sameTask)}, activation ${String(entry.activated)}`
        )
        .join("; ")}; download ${download}`
    );

    return problems.map((problem) => `${engine.name()}: ${problem}`);
  }).pipe(Effect.scoped);

const program = Effect.gen(function* checkKeeping() {
  const engines = yield* Config.String("KEEP_ENGINES").pipe(
    Config.withDefault("chromium,webkit")
  );

  const dir = yield* Config.String("KEEP_SHOTS_DIR").pipe(Config.option);

  yield* stageServer;

  const chosen = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  const problems = yield* pipe(
    chosen,
    Effect.forEach((engine) => checkEngine(engine, dir))
  );

  const all = problems.flat();

  return all.length === 0
    ? yield* Effect.void
    : yield* new KeepCheckFailed({
        detail: all.join("; "),
        step: "keep a moment",
      });
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
