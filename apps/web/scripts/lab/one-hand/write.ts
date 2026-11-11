import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { build } from "vite";

import { filmed } from "./film.js";
import { pageOf, stylesheet } from "./page.js";

const WEB = new URL("../../..", import.meta.url).pathname;

const SOURCE = `${WEB}scripts/lab/one-hand`;

const OUT = `${WEB}public/lab/one-hand`;

const FONTS = ["figtree.woff2", "dm-sans.woff2"];

class LabWriteFailed extends Schema.TaggedError<
  LabWriteFailed,
  { readonly brand: unique symbol }
>()("LabWriteFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not write the one-hand page at "${this.step}": ${this.detail}. Build the packages first (pnpm build).`;
  }
}

const BundleSchema = Schema.Array(
  Schema.Struct({
    output: Schema.Array(Schema.Struct({ code: Schema.String })),
  })
);

const runtime = Effect.tryPromise({
  catch: (cause) =>
    new LabWriteFailed({ detail: String(cause), step: "bundle the runtime" }),
  try: () =>
    build({
      build: {
        lib: {
          entry: `${SOURCE}/runtime.ts`,
          fileName: "film",
          formats: ["iife"],
          name: "oneHand",
        },
        minify: true,
        write: false,
      },
      configFile: false,
      logLevel: "warn",
      root: WEB,
    }),
}).pipe(
  Effect.flatMap((output) =>
    Schema.decodeUnknownEffect(BundleSchema)([output].flat())
  ),
  Effect.map((bundles) => bundles.at(0)?.output.at(0)?.code ?? "")
);

const program = Effect.gen(function* writeOneHand() {
  const fs = yield* FileSystem.FileSystem;
  const film = filmed();
  const html = pageOf(film);
  const tokens = yield* fs.readFileString(`${WEB}src/client/tokens.css`);
  const styles = yield* fs.readFileString(`${SOURCE}/page.css`);
  const css = stylesheet(tokens, styles, film);
  const script = yield* runtime;

  yield* fs.makeDirectory(OUT, { recursive: true });
  yield* fs.writeFileString(`${OUT}/index.html`, html);
  yield* fs.writeFileString(`${OUT}/film.gen.css`, css);
  yield* fs.writeFileString(`${OUT}/film.gen.js`, script);

  for (const font of FONTS) {
    yield* fs.copyFile(`${WEB}src/client/fonts/${font}`, `${OUT}/${font}`);
  }

  const formatter = yield* ChildProcess.make(
    "pnpm",
    ["exec", "oxfmt", `${OUT}/index.html`],
    { cwd: WEB }
  );

  yield* formatter.exitCode;

  yield* Console.log(
    `one-hand: ${film.sprites} sprites, ${film.animations} keyframe sets, html ${html.length} B, css ${css.length} B, js ${script.length} B`
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
