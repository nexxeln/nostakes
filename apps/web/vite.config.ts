import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

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

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: false }), linkPreviews()],
  server: {
    port: 5173,
    proxy: {
      "/rooms": { target: roomServer, ws: true },
    },
    strictPort: true,
  },
});
