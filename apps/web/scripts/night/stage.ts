import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { Effect } from "effect";

import { EMBEDDED_FONTS, pngFile } from "../../src/client/pictures/png.js";
import { fileNameOf } from "../../src/features/pictures/paper.js";
import type { KeptFrame } from "../../src/features/pictures/paper.js";
import { settleUpSvg } from "../../src/features/pictures/settle-up.js";
import { NIGHT_NAMES, sampleSettleUp } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame: KeptFrame = params.get("frame") === "Story" ? "Story" : "Chat";

const sample = params.get("sample") ?? "six";

const svgOf = (fonts: string) =>
  settleUpSvg(sampleSettleUp(sample), {
    deck: "TwoColour",
    fonts,
    frame,
    theme,
  });

document.documentElement.dataset.theme = theme.toLowerCase();

document.body.style.margin = "0";

const root = document.querySelector("#stage");

const png = (into: Element) =>
  pngFile(svgOf(EMBEDDED_FONTS), frame, fileNameOf("settle up", frame)).pipe(
    Effect.flatMap((file) => {
      const image = document.createElement("img");

      image.src = URL.createObjectURL(file);
      image.style.display = "block";
      into.append(image);

      return Effect.tryPromise(() => image.decode());
    })
  );

if (root !== null) {
  const view = params.get("view") ?? "svg";

  if (view === "names") {
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
