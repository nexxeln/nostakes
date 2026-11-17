import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { Effect, Option } from "effect";

import { defineMoment } from "../../src/client/moments/element.js";
import { EMBEDDED_FONTS, pngFile } from "../../src/client/pictures/png.js";
import { defineTonight } from "../../src/client/tonight/element.js";
import { MOMENT_TAG } from "../../src/features/moments/element.js";
import type { MomentHand } from "../../src/features/moments/element.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { sceneOf } from "../../src/features/moments/scene.js";
import {
  slipAloneSvg,
  slipOf,
  slipSvg,
} from "../../src/features/moments/slip.js";
import { fileNameOf } from "../../src/features/pictures/paper.js";
import type { KeptFrame } from "../../src/features/pictures/paper.js";
import { TONIGHT_TAG } from "../../src/features/tonight/element.js";
import { BLUFF_HAND } from "./bluff-hand.js";
import { replayHand } from "./replay-hands.js";
import { SAMPLE_NAMES, samplePicture } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame: KeptFrame = params.get("frame") === "Story" ? "Story" : "Chat";

const deck = params.get("deck") === "four" ? "FourColour" : "TwoColour";

const picture = samplePicture(params.get("sample") ?? "", { deck, theme });

document.documentElement.dataset.theme = theme.toLowerCase();

document.body.style.margin = "0";

const root = document.querySelector("#stage");

interface MomentHost extends HTMLElement {
  dealing: boolean;
  hand: MomentHand | null;
  room: string;
  sound: boolean;
}

const isMomentHost = (node: Element): node is MomentHost =>
  node.tagName.toLowerCase() === MOMENT_TAG;

const told = (into: Element) => {
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
    host.room = params.get("room") ?? "STAGE1";
    host.hand = replayHand(params.get("hand") ?? "", { deck, theme });
    Reflect.set(globalThis, "__tellHand", (name: string) => {
      host.hand = replayHand(name, { deck, theme });
    });
  }
};

const titleBoxOf = (hand: MomentHand) => {
  const scene = sceneOf(hand);

  if (Option.isNone(scene)) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  const host = document.createElement("div");

  host.style.cssText = "position:absolute;left:-4000px;top:0;width:1080px";
  host.innerHTML = pictureSvg(scene.value.picture, {
    deck,
    fonts: "",
    frame: "Story",
    theme,
  });
  document.body.append(host);

  const part = host.querySelector('[data-part="title"]');

  const box =
    part instanceof SVGGraphicsElement
      ? part.getBBox()
      : { height: 0, width: 0, x: 0, y: 0 };

  host.remove();

  return { height: box.height, width: box.width, x: box.x, y: box.y };
};

const tonight = (into: Element) => {
  defineMoment();
  defineTonight();

  const room = params.get("room") ?? "STAGE1";
  const table = document.createElement("div");
  const host = document.createElement(MOMENT_TAG);
  const drawer = document.createElement(TONIGHT_TAG);

  Object.assign(table.style, {
    background: "var(--color-felt)",
    height: "60vh",
    position: "relative",
  });
  Object.assign(drawer.style, { padding: "16px" });
  table.append(host);
  into.append(table, drawer);
  Object.assign(drawer, { deck, mode: "Drawer", room, theme });

  if (isMomentHost(host)) {
    const hand = replayHand(params.get("hand") ?? "AcesCracked", {
      deck,
      theme,
    });

    host.sound = false;
    host.room = room;
    host.dealing = params.get("turn") === "true";
    host.hand = hand;
    Reflect.set(globalThis, "__titleBox", titleBoxOf(hand));
    Reflect.set(globalThis, "__turn", (yours: boolean) => {
      host.dealing = yours;
    });
  }
};

const definedLate = (into: Element) => {
  const stage = document.createElement("div");
  const host = document.createElement(MOMENT_TAG);

  Object.assign(stage.style, {
    background: "var(--color-page)",
    height: "100vh",
    position: "relative",
  });
  stage.append(host);
  into.append(stage);
  Object.assign(host, { hand: BLUFF_HAND, sound: false });
  defineMoment();
};

const png = (into: Element) =>
  pngFile(
    pictureSvg(picture, { deck, fonts: EMBEDDED_FONTS, frame, theme }),
    frame,
    fileNameOf(picture.title, frame)
  ).pipe(
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
  } else if (view === "slip") {
    const [name = "AcesCracked"] = (params.get("sample") ?? "").split("-");
    const hand = replayHand(name, { deck, theme });
    const slip = slipOf(hand, picture);

    if (Option.isSome(slip)) {
      root.innerHTML =
        params.get("alone") === "true"
          ? slipAloneSvg(slip.value, { deck, theme })
          : slipSvg(slip.value, { deck, fonts: "", frame, theme });
    }
  } else if (view === "tonight") {
    tonight(root);
  } else if (view === "hand") {
    told(root);
  } else if (view === "late") {
    definedLate(root);
  } else if (view === "png") {
    await Effect.runPromise(png(root));
  } else {
    root.innerHTML = pictureSvg(picture, { deck, fonts: "", frame, theme });
  }
}

await document.fonts.ready;

document.documentElement.dataset.staged = "true";
