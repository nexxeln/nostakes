import * as NodeServices from "@effect/platform-node/NodeServices";
import { MOMENT_KINDS, TIERS } from "@nostakes/room";
import { Config, Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE_PORT = 5197;

const STAGE = `http://localhost:${STAGE_PORT}/scripts/moments`;

const FRAMES = [
  { frame: "Chat", height: 1350, width: 1080 },
  { frame: "Story", height: 1920, width: 1080 },
] as const;

const THEMES = ["Light", "Dark"] as const;

class PicturesFailed extends Schema.TaggedError<
  PicturesFailed,
  { readonly brand: unique symbol }
>()("PicturesFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not draw the moment pictures at "${this.step}": ${this.detail}. Build the packages first (pnpm build).`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new PicturesFailed({ detail: String(cause), step }),
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

const browser = Effect.acquireRelease(
  attempt("launch a headless, muted browser", () =>
    chromium.launch({ args: ["--mute-audio"], headless: true })
  ),
  (opened: Browser) => Effect.promise(() => opened.close())
);

const staged = (page: Page, url: string) =>
  attempt(`open ${url}`, () => page.goto(url)).pipe(
    Effect.andThen(
      attempt("wait for the stage", () =>
        page
          .locator("html[data-staged]")
          .waitFor({ state: "attached", timeout: 60_000 })
      )
    )
  );

const NamesSchema = Schema.Array(Schema.String);

const sampleNames = (opened: Browser) =>
  Effect.gen(function* readNames() {
    const page = yield* attempt("open a page", () => opened.newPage());

    yield* staged(page, `${STAGE}/stage.html?view=names`);

    const found = yield* attempt("read the sample names", () =>
      page
        .locator("#stage")
        .evaluate((node) =>
          node instanceof HTMLElement ? (node.dataset.result ?? null) : null
        )
    );

    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(NamesSchema)
    )(found).pipe(
      Effect.mapError(
        (failure) =>
          new PicturesFailed({
            detail: String(failure),
            step: "read the sample names",
          })
      )
    );
  });

const pictures = (opened: Browser, dir: string) =>
  Effect.forEach(
    FRAMES,
    ({ frame, height, width }) =>
      Effect.gen(function* drawFrame() {
        const fs = yield* FileSystem.FileSystem;

        const page = yield* attempt("open a page", () =>
          opened.newPage({ viewport: { height, width } })
        );

        const names = yield* sampleNames(opened);

        for (const sample of names) {
          for (const theme of THEMES) {
            yield* staged(
              page,
              `${STAGE}/stage.html?view=png&sample=${sample}&theme=${theme}&frame=${frame}`
            );

            const png = yield* attempt("photograph the picture", () =>
              page.locator("img").screenshot({ type: "png" })
            );

            const name = `${frame.toLowerCase()}-${sample}-${theme.toLowerCase()}.png`;

            yield* fs.writeFile(`${dir}/${name}`, png);
            yield* Console.log(`  ${name}`);
          }
        }
      }),
    { discard: true }
  );

const SoundsSchema = Schema.Record(
  Schema.String,
  Schema.Struct({ seconds: Schema.Finite, wav: Schema.String })
);

const sounds = (opened: Browser, dir: string) =>
  Effect.gen(function* recordSounds() {
    const fs = yield* FileSystem.FileSystem;
    const page = yield* attempt("open a page", () => opened.newPage());

    const jobs = MOMENT_KINDS.flatMap((kind) =>
      TIERS[kind].map((tier) => `${kind}-${tier}`)
    );

    yield* staged(page, `${STAGE}/sfx.html?jobs=${jobs.join(",")}`);

    const rendered = yield* attempt("read the rendered sounds", () =>
      page
        .locator("#stage")
        .evaluate((node) =>
          node instanceof HTMLElement ? (node.dataset.result ?? null) : null
        )
    ).pipe(
      Effect.flatMap((found) =>
        Schema.decodeUnknownEffect(Schema.fromJsonString(SoundsSchema))(
          found
        ).pipe(
          Effect.mapError(
            (failure) =>
              new PicturesFailed({
                detail: String(failure),
                step: "read the rendered sounds",
              })
          )
        )
      )
    );

    for (const [name, { seconds, wav }] of Object.entries(rendered)) {
      yield* fs.writeFile(
        `${dir}/${name}.wav`,
        Uint8Array.from(atob(wav), (letter) => letter.codePointAt(0) ?? 0)
      );
      yield* Console.log(`  ${name}.wav ${seconds.toFixed(2)} s`);
    }
  });

const program = Effect.gen(function* drawMoments() {
  const dir = yield* Config.String("MOMENTS_DIR");
  const fs = yield* FileSystem.FileSystem;

  yield* fs.makeDirectory(dir, { recursive: true });
  yield* stageServer;

  const opened = yield* browser;

  yield* Console.log(`share pictures into ${dir}`);
  yield* pictures(opened, dir);
  yield* Console.log(`sounds into ${dir}`);
  yield* sounds(opened, dir);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
