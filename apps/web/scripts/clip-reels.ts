import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { chromium, webkit } from "playwright-core";

import { mutedBrowser, servedVite } from "./local-site.ts";
import { pagePolicy } from "./stage-policy.ts";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE = "/scripts/moments/reel.html";

class ReelFailed extends Schema.TaggedError<
  ReelFailed,
  { readonly brand: unique symbol }
>()("ReelFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Making a replay reel failed at "${this.step}": ${this.detail}. Open ${STAGE}?hand=AcesCracked on the stage server to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ReelFailed({ detail: String(cause), step }),
    try: run,
  });

const StagedSchema = Schema.Struct({
  failure: Schema.optionalKey(Schema.String),
  file: Schema.optionalKey(Schema.String),
  length: Schema.optionalKey(Schema.Finite),
  madeMs: Schema.optionalKey(Schema.Finite),
  score: Schema.optionalKey(Schema.Json),
  sheet: Schema.optionalKey(Schema.String),
  shots: Schema.optionalKey(Schema.Finite),
  title: Schema.optionalKey(Schema.String),
  toldMs: Schema.optionalKey(Schema.Finite),
});

const listOf = (name: string, fallback: string) =>
  Config.String(name).pipe(
    Config.withDefault(fallback),
    Config.map((text) => text.split(",").filter((each) => each.length > 0))
  );

const bytesOf = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));

const program = Effect.gen(function* reels() {
  const files = yield* FileSystem.FileSystem;
  const dir = yield* Config.String("REELS_DIR");

  const engine = yield* Config.Literals(
    ["chromium", "webkit"],
    "REEL_ENGINE"
  ).pipe(Config.withDefault("chromium" as const));

  const hands = yield* listOf("REEL_HANDS", "AcesCracked");
  const samples = yield* listOf("REEL_SAMPLES", "");
  const themes = yield* listOf("REEL_THEMES", "Light");

  const frame = yield* Config.String("REEL_FRAME").pipe(
    Config.withDefault("Story")
  );

  const make = yield* Config.String("REEL_MAKE").pipe(
    Config.withDefault("file")
  );

  yield* files.makeDirectory(dir, { recursive: true });

  const origin = yield* servedVite("start the stage server", "STAGE_PORT", {
    configFile: false,
    logLevel: "warn",
    plugins: [pagePolicy()],
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new ReelFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const opened = yield* mutedBrowser(
    engine === "webkit" ? webkit : chromium
  ).pipe(
    Effect.mapError(
      (failure) =>
        new ReelFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const told = [
    ...hands.map((name) => ({ name, query: `hand=${name}` })),
    ...samples.map((name) => ({ name, query: `sample=${name}` })),
  ];

  for (const { name: hand, query } of told) {
    for (const theme of themes) {
      const label = `${engine === "webkit" ? "webkit-" : ""}${hand}-${theme.toLowerCase()}${frame === "Chat" ? "-chat" : ""}`;
      const page = yield* attempt("open a page", () => opened.newPage());

      yield* attempt("open the reel stage", () =>
        page.goto(
          `${origin}${STAGE}?${query}&theme=${theme}&frame=${frame}&make=${make}`
        )
      );
      yield* attempt("wait for the reel", () =>
        page
          .locator("html[data-staged]")
          .waitFor({ state: "attached", timeout: 300_000 })
      );

      const staged = yield* attempt("read the stage", () =>
        page
          .locator("#stage")
          .evaluate((node) =>
            node instanceof HTMLElement ? (node.dataset.result ?? "") : ""
          )
      ).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.fromJsonString(StagedSchema))
        ),
        Effect.mapError(
          (failure) =>
            new ReelFailed({ detail: String(failure), step: "read the reel" })
        )
      );

      yield* attempt("close the page", () => page.close());

      if (staged.failure !== undefined) {
        return yield* new ReelFailed({ detail: staged.failure, step: label });
      }

      yield* files.writeFile(
        `${dir}/${label}-storyboard.png`,
        bytesOf(staged.sheet ?? "")
      );
      yield* files.writeFileString(
        `${dir}/${label}.json`,
        JSON.stringify(staged.score ?? null)
      );

      const file = bytesOf(staged.file ?? "");

      if (file.length > 0) {
        yield* files.writeFile(`${dir}/${label}.mp4`, file);
      }

      yield* Console.log(
        `${label}: "${staged.title ?? ""}", ${((staged.length ?? 0) / 1000).toFixed(1)} s, ${staged.shots ?? 0} shots, told in ${staged.toldMs ?? 0} ms${file.length > 0 ? `, made in ${staged.madeMs ?? 0} ms, ${file.length} bytes` : ""}`
      );
    }
  }

  return yield* Effect.void;
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
