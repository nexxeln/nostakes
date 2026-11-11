import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { build } from "vite";

const WEB = new URL("../..", import.meta.url).pathname;

const SOURCE = `${WEB}scripts/lab/faces/`;

const PUBLISHED = `${WEB}public/lab/faces/`;

const SITE_PATH = "/lab/faces";

const FONTS = `${WEB}src/client/fonts/`;

const FONT_FILES = ["figtree.woff2", "dm-sans.woff2"];

const TOKENS = `${WEB}src/client/tokens.css`;

const SCRIPT_FILE = "page.gen.js";

const STYLE_FILE = "page.gen.css";

class LabFailed extends Schema.TaggedError<
  LabFailed,
  { readonly brand: unique symbol }
>()("LabFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not publish the face lab at "${this.step}": ${this.detail}. Build the packages first (pnpm build), because the pages bundle @nostakes/avatar from its dist.`;
  }
}

interface Idea {
  readonly letter: string;
  readonly name: string;
  readonly line: string;
}

const IDEAS: readonly Idea[] = [
  {
    letter: "a",
    line: "Every choice on the page, as your own face.",
    name: "The wall",
  },
  {
    letter: "b",
    line: "Tap a part of the face. Swipe to flip it.",
    name: "Touch the face",
  },
  {
    letter: "c",
    line: "Take a face. Hold what you like. Deal again.",
    name: "Deal me a face",
  },
];

const head = (title: string, style: string) =>
  [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <meta",
    '      name="viewport"',
    '      content="width=device-width, initial-scale=1, viewport-fit=cover"',
    "    />",
    '    <meta name="color-scheme" content="light dark" />',
    '    <meta name="robots" content="noindex" />',
    `    <title>${title}</title>`,
    `    <link rel="stylesheet" href="${style}" />`,
    "  </head>",
  ].join("\n");

const ideaPage = (idea: Idea) =>
  [
    head(
      `nostakes lab: ${idea.name}`,
      `${SITE_PATH}/${idea.letter}/${STYLE_FILE}`
    ),
    "  <body>",
    '    <div id="app"></div>',
    `    <script type="module" src="${SITE_PATH}/${idea.letter}/${SCRIPT_FILE}"></script>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");

const ideaLink = (idea: Idea) =>
  [
    `      <a class="idea" href="${SITE_PATH}/${idea.letter}/">`,
    `        <span class="letter">${idea.letter.toUpperCase()}</span>`,
    `        <span class="name">${idea.name}</span>`,
    `        <span class="line">${idea.line}</span>`,
    "      </a>",
  ].join("\n");

const indexPage = [
  head(
    "nostakes lab: three ways to build a face",
    `${SITE_PATH}/${STYLE_FILE}`
  ),
  "  <body>",
  "    <main>",
  "      <h1>Three ways to build a face</h1>",
  "      <p>Prototypes. The art is the same. Only the choosing is new.</p>",
  ...IDEAS.map(ideaLink),
  "    </main>",
  "  </body>",
  "</html>",
  "",
].join("\n");

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LabFailed({ detail: String(cause), step }),
    try: run,
  });

const bundled = (letter: string) =>
  attempt(`bundle ${letter}.ts`, () =>
    build({
      build: {
        lib: { entry: `${SOURCE}${letter}.ts`, formats: ["es"] },
        minify: true,
        write: false,
      },
      configFile: false,
      logLevel: "warn",
      root: WEB,
    })
  ).pipe(
    Effect.flatMap((result) => {
      const [first] = Array.isArray(result) ? result : [result];

      const chunks =
        first !== undefined && "output" in first ? first.output : [];

      const [chunk] = chunks;

      return chunk === undefined
        ? Effect.fail(
            new LabFailed({
              detail: "the bundler wrote no script",
              step: `bundle ${letter}.ts`,
            })
          )
        : Effect.succeed(chunk.code);
    })
  );

const program = Effect.gen(function* publishFaceLab() {
  const fs = yield* FileSystem.FileSystem;

  const tokens = (yield* fs.readFileString(TOKENS)).replaceAll(
    'url("./fonts/',
    `url("${SITE_PATH}/fonts/`
  );

  const shared = yield* fs.readFileString(`${SOURCE}shared.css`);

  yield* fs.remove(PUBLISHED, { force: true, recursive: true });
  yield* fs.makeDirectory(`${PUBLISHED}fonts`, { recursive: true });

  for (const font of FONT_FILES) {
    yield* fs.copyFile(`${FONTS}${font}`, `${PUBLISHED}fonts/${font}`);
  }

  yield* fs.writeFileString(`${PUBLISHED}index.html`, indexPage);
  yield* fs.writeFileString(
    `${PUBLISHED}${STYLE_FILE}`,
    `${tokens}\n${yield* fs.readFileString(`${SOURCE}index.css`)}`
  );

  for (const idea of IDEAS) {
    const folder = `${PUBLISHED}${idea.letter}/`;
    const script = yield* bundled(idea.letter);
    const style = yield* fs.readFileString(`${SOURCE}${idea.letter}.css`);

    yield* fs.makeDirectory(folder, { recursive: true });
    yield* fs.writeFileString(`${folder}index.html`, ideaPage(idea));
    yield* fs.writeFileString(`${folder}${SCRIPT_FILE}`, script);
    yield* fs.writeFileString(
      `${folder}${STYLE_FILE}`,
      `${tokens}\n${shared}\n${style}`
    );
    yield* Console.log(
      `${SITE_PATH}/${idea.letter}/  script ${Math.round(script.length / 1024)} KB`
    );
  }
});

await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
