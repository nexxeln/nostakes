import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { Effect } from "effect";

import { defineKeep } from "../../src/client/pictures/element.js";
import { EMBEDDED_FONTS, pngFile } from "../../src/client/pictures/png.js";
import {
  KEEP_TAG,
  KeepPictureSchema,
} from "../../src/features/pictures/keep.js";
import { fileNameOf } from "../../src/features/pictures/paper.js";
import type { KeptFrame } from "../../src/features/pictures/paper.js";
import { recapSvg } from "../../src/features/pictures/recap-card.js";
import { settleUpSvg } from "../../src/features/pictures/settle-up.js";
import { NIGHT_NAMES, sampleRecap, sampleSettleUp } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame: KeptFrame = params.get("frame") === "Story" ? "Story" : "Chat";

const sample = params.get("sample") ?? "six";

const card = params.get("card") === "recap" ? "recap" : "settle";

const svgOf = (fonts: string) => {
  const look = { deck: "TwoColour", fonts, frame, theme } as const;

  return card === "recap"
    ? recapSvg(sampleRecap(sample), look)
    : settleUpSvg(sampleSettleUp(sample), look);
};

document.documentElement.dataset.theme = theme.toLowerCase();

document.body.style.margin = "0";

const root = document.querySelector("#stage");

const png = (into: Element) =>
  pngFile(svgOf(EMBEDDED_FONTS), frame, fileNameOf(card, frame)).pipe(
    Effect.flatMap((file) => {
      const image = document.createElement("img");

      image.src = URL.createObjectURL(file);
      image.style.display = "block";
      into.append(image);

      return Effect.tryPromise(() => image.decode());
    })
  );

const keepRow = (into: Element) => {
  defineKeep();

  const host = document.createElement(KEEP_TAG);

  into.append(host);
  Object.assign(host, {
    deck: "TwoColour",
    label: "Share as a picture",
    picture:
      card === "recap"
        ? KeepPictureSchema.cases.Recap.make(sampleRecap(sample))
        : KeepPictureSchema.cases.SettleUp.make(sampleSettleUp(sample)),
    theme,
    tone: "Primary",
  });
};

if (root !== null) {
  const view = params.get("view") ?? "svg";

  if (view === "keep") {
    keepRow(root);
  } else if (view === "names") {
    if (root instanceof HTMLElement) {
      root.dataset.result = JSON.stringify(NIGHT_NAMES);
    }
  } else if (view === "png") {
    await Effect.runPromise(png(root));
  } else {
    root.innerHTML = svgOf("");
  }
}

await document.fonts.ready;

document.documentElement.dataset.staged = "true";
