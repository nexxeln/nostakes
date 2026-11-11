import { Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { build } from "vite";

export const WEB = new URL("../../..", import.meta.url).pathname;

export const SOURCE = `${WEB}scripts/lab/one-hand`;

const FONTS = ["figtree.woff2", "dm-sans.woff2"];

export class LabWriteFailed extends Schema.TaggedError<
  LabWriteFailed,
  { readonly brand: unique symbol }
>()("LabWriteFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not write the lab page at "${this.step}": ${this.detail}. Build the packages first (pnpm build).`;
  }
}

const BundleSchema = Schema.Array(
  Schema.Struct({
    output: Schema.Array(Schema.Struct({ code: Schema.String })),
  })
);

const bundled = (entry: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      new LabWriteFailed({ detail: String(cause), step: "bundle the runtime" }),
    try: () =>
      build({
        build: {
          lib: {
            entry: `${SOURCE}/${entry}`,
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

export interface LabPage {
  readonly css: string;
  readonly html: string;
  readonly name: string;
  readonly runtime: string;
  readonly summary: string;
}

export const written = (page: LabPage) =>
  Effect.gen(function* writeLabPage() {
    const fs = yield* FileSystem.FileSystem;
    const out = `${WEB}public/lab/${page.name}`;
    const script = yield* bundled(page.runtime);

    yield* fs.makeDirectory(out, { recursive: true });
    yield* fs.writeFileString(`${out}/index.html`, page.html);
    yield* fs.writeFileString(`${out}/film.gen.css`, page.css);
    yield* fs.writeFileString(`${out}/film.gen.js`, script);

    for (const font of FONTS) {
      yield* fs.copyFile(`${WEB}src/client/fonts/${font}`, `${out}/${font}`);
    }

    const formatter = yield* ChildProcess.make(
      "pnpm",
      ["exec", "oxfmt", `${out}/index.html`],
      { cwd: WEB }
    );

    yield* formatter.exitCode;
    yield* Console.log(
      `${page.name}: ${page.summary}, html ${page.html.length} B, css ${page.css.length} B, js ${script.length} B`
    );
  });
