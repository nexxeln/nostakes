import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { build, createServer } from "vite";
import type { Plugin, ViteDevServer } from "vite";

const WEB = new URL("../..", import.meta.url).pathname;

const OUT = `${WEB}public/lab/dealt-in`;

const PAGE_FILE = `${OUT}/index.html`;

const BASE = "/lab/dealt-in/";

const ENTRY = "scripts/lab/dealt-in/page.ts";

const BAKE_MODULE = "/scripts/lab/dealt-in/bake.ts";

const PURE_MODULES = [
  { sideEffects: false, test: /[\\/]packages[\\/][a-z-]+[\\/]dist[\\/]/u },
  { sideEffects: false, test: /[\\/]apps[\\/]web[\\/]src[\\/].*\.ts$/u },
  { sideEffects: false, test: /\?lean$/u },
];

class LabBuildFailed extends Schema.TaggedError<
  LabBuildFailed,
  { readonly brand: unique symbol }
>()("LabBuildFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not build the dealt-in lab page at "${this.step}": ${this.detail}. Build the packages first (pnpm build).`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LabBuildFailed({ detail: String(cause), step }),
    try: run,
  });

const LEAN = "?lean";

const LEAN_PACKAGE = "@nostakes/avatar";

const HEAVY_IMPORTER = /[\\/]dealt-in[\\/]ending\.ts$/u;

const LAB_SOURCE = /[\\/]scripts[\\/]lab[\\/]dealt-in[\\/]/u;

const pathOf = (url: URL) => decodeURIComponent(url.pathname);

const avatarEntry = pathOf(new URL(import.meta.resolve(LEAN_PACKAGE)));

const withoutLean = (id: string) => id.slice(0, -LEAN.length);

const leanAvatar = (): Plugin => ({
  enforce: "pre",
  name: "nostakes-lab-lean-avatar",
  resolveId: (source, importer = "") => {
    if (importer.endsWith(LEAN) && source.startsWith(".")) {
      return `${pathOf(new URL(source, `file://${withoutLean(importer)}`))}${LEAN}`;
    }

    return source === LEAN_PACKAGE &&
      LAB_SOURCE.test(importer) &&
      !HEAVY_IMPORTER.test(importer)
      ? `${avatarEntry}${LEAN}`
      : null;
  },
  transform: (code, id) =>
    id.endsWith(LEAN)
      ? code.replaceAll("= Schema.", "= /*#__PURE__*/ Schema.")
      : null,
});

const bundled = attempt("bundle the page", () =>
  build({
    base: BASE,
    build: {
      assetsInlineLimit: 0,
      emptyOutDir: true,
      modulePreload: false,
      outDir: OUT,
      rolldownOptions: {
        input: { page: ENTRY },
        output: {
          assetFileNames: "[name].gen[extname]",
          chunkFileNames: "[name].gen.js",
          entryFileNames: "[name].gen.js",
        },
        treeshake: { moduleSideEffects: PURE_MODULES },
      },
    },
    configFile: false,
    logLevel: "warn",
    plugins: [leanAvatar()],
    publicDir: false,
    root: WEB,
  })
);

const bakeServer = Effect.acquireRelease(
  attempt("start the bake server", () =>
    createServer({
      appType: "custom",
      configFile: false,
      logLevel: "warn",
      root: WEB,
      server: { middlewareMode: true },
    })
  ),
  (server: ViteDevServer) => Effect.promise(() => server.close())
);

const BakedSchema = Schema.Struct({
  PAGE_HTML: Schema.String,
  THEME_SCRIPT: Schema.String,
});

const baked = Effect.scoped(
  bakeServer.pipe(
    Effect.flatMap((server) =>
      attempt("bake the cast into the page", () =>
        server.ssrLoadModule(BAKE_MODULE)
      )
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(BakedSchema))
  )
);

const formatted = Effect.gen(function* formatThePage() {
  const spawner = yield* ChildProcessSpawner;

  const code = yield* spawner
    .exitCode(
      ChildProcess.make("pnpm", ["exec", "oxfmt", PAGE_FILE], { cwd: WEB })
    )
    .pipe(
      Effect.mapError(
        (failure) =>
          new LabBuildFailed({ detail: String(failure), step: "run oxfmt" })
      )
    );

  return code === 0
    ? yield* Effect.void
    : yield* new LabBuildFailed({
        detail: `oxfmt exited with ${code}`,
        step: "format the page",
      });
});

const program = Effect.gen(function* buildLabPage() {
  const files = yield* FileSystem.FileSystem;

  yield* bundled;

  const { PAGE_HTML, THEME_SCRIPT } = yield* baked;

  yield* files.writeFileString(PAGE_FILE, PAGE_HTML);
  yield* files.writeFileString(`${OUT}/theme.gen.js`, THEME_SCRIPT);
  yield* formatted;

  const written = yield* files.readDirectory(OUT);

  yield* Console.log(`Wrote ${written.toSorted().join(", ")} to ${OUT}.`);
});

await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
