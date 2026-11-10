import { foldkit } from "@foldkit/vite-plugin";
import { Hash, Option } from "effect";
import { defineConfig } from "vite";
import type { Plugin, Rolldown } from "vite";

import {
  HOME_PREVIEW,
  INVITE_PREVIEW,
  previewHead,
} from "./src/features/link-preview.js";

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
  transformIndexHtml: (html) => {
    if (!html.includes(PLAIN_TITLE)) {
      throw new Error(
        `index.html needs ${PLAIN_TITLE} for the link preview to replace.`
      );
    }

    return html.replace(PLAIN_TITLE, previewHead(HOME_PREVIEW));
  },
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

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: false }), buildStamp(), linkPreviews()],
  server: {
    port: 5173,
    proxy: {
      "/rooms": { target: roomServer, ws: true },
    },
    strictPort: true,
  },
});
