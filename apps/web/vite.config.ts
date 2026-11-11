import * as NodeServices from "@effect/platform-node/NodeServices";
import { foldkit } from "@foldkit/vite-plugin";
import { Effect, Hash, Option, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import { defineConfig } from "vite";
import type { Connect, Plugin, Rolldown } from "vite";

import { MEDIA_PACKAGES } from "./src/client/moments/mediabunny/packages.js";
import { landingPictures } from "./src/features/landing/pictures.js";
import {
  HOME_PREVIEW,
  INVITE_PREVIEW,
  previewHead,
} from "./src/features/link-preview.js";
import {
  CLIP_WORKER_PATHS,
  headersFor,
  HEADERS_FILE,
} from "./src/features/page-policy.js";

const roomServer = process.env.ROOM_SERVER_URL ?? "http://localhost:1337";

const PLAIN_TITLE = "<title>nostakes</title>";

const HOME_PAGE = "index.html";

const INVITE_PAGE = "invite.html";

const linkPreviews = (): Plugin => ({
  enforce: "post",
  generateBundle(_options, bundle) {
    const home = bundle[HOME_PAGE];
    const homeHead = previewHead(HOME_PREVIEW);

    if (home?.type !== "asset" || !String(home.source).includes(homeHead)) {
      this.error(
        `The built ${HOME_PAGE} has no link preview to copy into ${INVITE_PAGE}. Keep ${PLAIN_TITLE} in index.html.`
      );
    }

    this.emitFile({
      fileName: INVITE_PAGE,
      source: String(home.source).replace(
        homeHead,
        previewHead(INVITE_PREVIEW)
      ),
      type: "asset",
    });
  },
  name: "nostakes-link-previews",
  transformIndexHtml: (html, { path }) => {
    if (path !== `/${HOME_PAGE}`) {
      return html;
    }

    if (!html.includes(PLAIN_TITLE)) {
      throw new Error(
        `index.html needs ${PLAIN_TITLE} for the link preview to replace.`
      );
    }

    return html.replace(PLAIN_TITLE, previewHead(HOME_PREVIEW));
  },
});

const PICTURES_MODULE = "virtual:nostakes-landing-pictures";

const RESOLVED_PICTURES = `\0${PICTURES_MODULE}`;

const builtLandingPictures = (): Plugin => ({
  load: (id) =>
    id === RESOLVED_PICTURES
      ? `export const PICTURES = ${JSON.stringify(landingPictures())};`
      : undefined,
  name: "nostakes-landing-pictures",
  resolveId: (id) => (id === PICTURES_MODULE ? RESOLVED_PICTURES : undefined),
});

const BUILD_FILE = "build.json";

const buildMeta = (build: string) =>
  `<meta name="nostakes-build" content="${build}" />`;

const stamped = (html: string, build: string) =>
  html.replace("</head>", `  ${buildMeta(build)}\n  </head>`);

const UINT32 = 2 ** 32;

const hashHex = (text: string) =>
  (((Hash.string(text) % UINT32) + UINT32) % UINT32)
    .toString(16)
    .padStart(8, "0");

const contentBuild = (files: readonly string[]) => {
  const names = files.toSorted();

  return `${hashHex(names.join("\n"))}${hashHex(names.toReversed().join("\n"))}`;
};

const stampBundle = (bundle: Rolldown.OutputBundle): Option.Option<string> => {
  const page = bundle[HOME_PAGE];

  if (page?.type !== "asset") {
    return Option.none();
  }

  const build = contentBuild(
    Object.keys(bundle).filter((file) => !file.endsWith(".html"))
  );

  page.source = stamped(String(page.source), build);

  return Option.some(build);
};

const buildStamp = (): Plugin => ({
  apply: "build",
  enforce: "post",
  generateBundle(_, bundle) {
    for (const build of Option.toArray(stampBundle(bundle))) {
      this.emitFile({
        fileName: BUILD_FILE,
        source: JSON.stringify({ build }),
        type: "asset",
      });
    }
  },
  name: "nostakes-build-stamp",
});

const HEADERS_FILE_NAME = "_headers";

const securityHeaders = (): Plugin => ({
  apply: "build",
  generateBundle(_options, bundle) {
    const [builtWorkers] = CLIP_WORKER_PATHS;

    if (
      !Object.keys(bundle).some((name) => `/${name}`.startsWith(builtWorkers))
    ) {
      this.error(
        `No built file starts with ${builtWorkers}, so the clip worker would run under the page's policy and its AAC extension could not load. Point CLIP_WORKER_PATHS in src/features/page-policy.ts at the worker's file name.`
      );
    }

    this.emitFile({
      fileName: HEADERS_FILE_NAME,
      source: HEADERS_FILE,
      type: "asset",
    });
  },
  name: "nostakes-security-headers",
});

const policyHeaders: Connect.NextHandleFunction = (request, response, next) => {
  for (const [name, value] of Object.entries(headersFor(request.url ?? "/"))) {
    response.setHeader(name, value);
  }

  next();
};

const pagePolicy = (): Plugin => ({
  configurePreviewServer: (server) => {
    server.middlewares.use(policyHeaders);
  },
  configureServer: (server) => {
    server.middlewares.use(policyHeaders);
  },
  name: "nostakes-page-policy",
});

const AAC_EXTENSION = "@mediabunny/aac-encoder";

const AAC_CHUNK = /^assets\/mediabunny-aac-encoder-[\w-]+\.js$/u;

const AAC_NOTICE = "assets/mediabunny-aac-encoder-notice.txt";

const ENCODER_WORKER_OPENS = "inlineWorker(`";

const ManifestSchema = Schema.fromJsonString(
  Schema.Struct({
    homepage: Schema.String,
    license: Schema.String,
    name: Schema.String,
    repository: Schema.Struct({
      directory: Schema.optional(Schema.String),
      url: Schema.String,
    }),
    version: Schema.String,
  })
);

const packageRoot = (specifier: string) =>
  Effect.gen(function* findRoot() {
    const fs = yield* FileSystem.FileSystem;
    let folder = new URL(".", import.meta.resolve(specifier));

    while (!(yield* fs.exists(new URL("package.json", folder).pathname))) {
      folder = new URL("..", folder);
    }

    return folder;
  });

const packageText = (root: URL, file: string) =>
  FileSystem.FileSystem.use((fs) =>
    fs.readFileString(new URL(file, root).pathname)
  );

const templateText = (source: string, opens: string) => {
  const start = source.indexOf(opens) + opens.length;
  let end = start;

  while (end < source.length && source[end] !== "`") {
    end += source[end] === "\\" ? 2 : 1;
  }

  return start < opens.length ? "" : source.slice(start, end);
};

const sourceAt = (manifest: typeof ManifestSchema.Type) =>
  [
    manifest.repository.url.replace(/^git\+/u, "").replace(/\.git$/u, ""),
    "tree",
    `v${manifest.version}`,
    ...(manifest.repository.directory === undefined
      ? []
      : [manifest.repository.directory]),
  ].join("/");

const ruled = (title: string, text: string) =>
  [`==== ${title} `.padEnd(78, "="), "", text.trim(), ""].join("\n");

const noticeFor = (chunk: string, worker: string) =>
  Effect.gen(function* writeNotice() {
    const root = yield* packageRoot(AAC_EXTENSION);
    const core = yield* packageRoot("mediabunny");

    const bundle = yield* packageText(
      root,
      "dist/bundles/mediabunny-aac-encoder.mjs"
    );

    const readme = yield* packageText(root, "README.md");
    const decode = Schema.decodeUnknownEffect(ManifestSchema);
    const extension = yield* decode(yield* packageText(root, "package.json"));
    const library = yield* decode(yield* packageText(core, "package.json"));
    const encoder = templateText(bundle, ENCODER_WORKER_OPENS);
    const copyright = /Copyright \(c\)[^\n]*/u.exec(bundle)?.[0] ?? "";
    const built = readme.slice(readme.indexOf("## Building and development"));

    return encoder.length === 0 || !chunk.includes(encoder)
      ? Option.none<string>()
      : Option.some(
          [
            "FFmpeg's AAC encoder in nostakes",
            "",
            "When a browser cannot encode AAC sound itself, nostakes makes the sound of a",
            `clip with ${extension.name} ${extension.version}, served as /${worker}.`,
            "It runs a WebAssembly build of FFmpeg's AAC encoder, which is licensed under",
            "the GNU Lesser General Public License version 2.1 or later.",
            "",
            "The FFmpeg part reaches your browser unmodified: the encoder worker that file",
            "starts, with the WebAssembly inside it, is byte for byte the one in the",
            "published package, and the package's README below gives the SHA-256 of that",
            "WebAssembly. Our build minifies the package's own JavaScript around it, which",
            `is under the ${extension.license} licence.`,
            "",
            "Copyright: FFmpeg is the work of the FFmpeg developers; each source file's",
            "notice is in the FFmpeg source named below. The package's JavaScript is",
            `${copyright}.`,
            "",
            `Package: ${extension.name} ${extension.version}, ${extension.homepage}`,
            `Its source: ${sourceAt(extension)}`,
            "",
            `The rest of ${library.name} ${library.version} (${library.license}), which writes`,
            `the clip, is minified into the clip worker. Its source: ${sourceAt(library)}`,
            "",
            ruled("From the package's README", built),
            ruled(
              "GNU Lesser General Public License 2.1 (the package's licenses/ffmpeg/COPYING.LGPLv2.1)",
              yield* packageText(root, "licenses/ffmpeg/COPYING.LGPLv2.1")
            ),
            ruled(
              "FFmpeg's licence note (the package's licenses/ffmpeg/LICENSE.md)",
              yield* packageText(root, "licenses/ffmpeg/LICENSE.md")
            ),
            ruled(
              "Mozilla Public License 2.0 (the package's LICENSE)",
              yield* packageText(root, "LICENSE")
            ),
          ].join("\n")
        );
  });

const sourceText = (file: Rolldown.OutputAsset | Rolldown.OutputChunk) => {
  if (file.type === "chunk") {
    return file.code;
  }

  return file.source instanceof Uint8Array
    ? new TextDecoder().decode(file.source)
    : file.source;
};

const aacNotice = (): Plugin => ({
  apply: "build",
  generateBundle(_options, bundle) {
    const found = Object.values(bundle).find((file) =>
      AAC_CHUNK.test(file.fileName)
    );

    if (found === undefined) {
      this.error(
        `No built file matches ${AAC_CHUNK.source}, so ${AAC_NOTICE} would name nothing. Find where the build put ${AAC_EXTENSION} and point AAC_CHUNK at it.`
      );
    }

    return Effect.runPromise(
      noticeFor(sourceText(found), found.fileName).pipe(
        Effect.provide(NodeServices.layer),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.sync(() =>
                this.error(
                  `${found.fileName} does not hold the encoder worker of ${AAC_EXTENSION} byte for byte, so the FFmpeg build it serves is no longer the published one. Stop the build from rewriting it, or tell the owner before it ships.`
                )
              ),
            onSome: (source) =>
              Effect.sync(() => {
                this.emitFile({ fileName: AAC_NOTICE, source, type: "asset" });
              }),
          })
        )
      )
    );
  },
  name: "nostakes-aac-notice",
});

const PURE_MODULES = [
  { sideEffects: false, test: /[\\/]packages[\\/][a-z-]+[\\/]dist[\\/]/u },
  { sideEffects: false, test: /[\\/]node_modules[\\/].*@noble[\\/]/u },
];

export const READING_PAGES = ["privacy.html", "terms.html", "learn.html"];

export default defineConfig({
  build: {
    rolldownOptions: {
      input: [HOME_PAGE, ...READING_PAGES],
      treeshake: { moduleSideEffects: PURE_MODULES },
    },
  },
  optimizeDeps: { include: MEDIA_PACKAGES },
  plugins: [
    foldkit({ devToolsMcpPort: false }),
    builtLandingPictures(),
    buildStamp(),
    linkPreviews(),
    pagePolicy(),
    securityHeaders(),
    aacNotice(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/rooms": { target: roomServer, ws: true },
    },
    strictPort: true,
  },
  worker: {
    format: "es",
    rolldownOptions: { treeshake: { moduleSideEffects: PURE_MODULES } },
  },
});
