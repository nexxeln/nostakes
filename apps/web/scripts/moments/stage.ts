import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { Effect } from "effect";

import { defineMoment } from "../../src/client/moments/element.js";
import type { MomentScene } from "../../src/client/moments/element.js";
import { pictureFile } from "../../src/client/moments/share.js";
import { MOMENT_TAG } from "../../src/features/moments/element.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import type { PictureFrame } from "../../src/features/moments/picture.js";
import { SAMPLE_NAMES, samplePicture } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame: PictureFrame = params.get("frame") === "Story" ? "Story" : "Chat";

const deck = params.get("deck") === "four" ? "FourColour" : "TwoColour";

const picture = samplePicture(params.get("sample") ?? "");

document.documentElement.dataset.theme = theme.toLowerCase();

document.body.style.margin = "0";

const root = document.querySelector("#stage");

interface MomentHost extends HTMLElement {
  present: (scene: MomentScene) => void;
  sound: boolean;
}

const isMomentHost = (node: Element): node is MomentHost =>
  node.tagName.toLowerCase() === MOMENT_TAG;

const live = (into: Element) => {
  defineMoment();
  const stage = document.createElement("div");
  const host = document.createElement(MOMENT_TAG);

  Object.assign(stage.style, {
    background: "var(--color-page)",
    height: "100vh",
    position: "relative",
  });
  stage.append(host);
  into.append(stage);

  if (isMomentHost(host)) {
    host.sound = false;
    host.present({ deck, id: "stage", picture, theme });
  }

  const at = Number(params.get("at") ?? "0");

  for (const animation of host.shadowRoot?.getAnimations() ?? []) {
    animation.pause();
    animation.currentTime = at;
  }
};

const png = (into: Element) =>
  pictureFile(picture, { deck, theme }, frame).pipe(
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
      root.dataset.result = JSON.stringify(SAMPLE_NAMES);
    }
  } else if (view === "live") {
    live(root);
  } else if (view === "png") {
    await Effect.runPromise(png(root));
  } else {
    root.innerHTML = pictureSvg(picture, { deck, fonts: "", frame, theme });
  }
}

await document.fonts.ready;

document.documentElement.dataset.staged = "true";
