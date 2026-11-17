import "../../src/client/tokens.css";
import "../../src/client/app.css";
import { Events } from "@nostakes/engine";
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
import { sampleSettleUp } from "../night/samples.js";
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

const renumbered = (hand: MomentHand, number: number): MomentHand => ({
  ...hand,
  lastHand: { ...hand.lastHand, handNumber: number },
  record: hand.record.map((event) =>
    Events.$is("HandStarted")(event) || Events.$is("HandEnded")(event)
      ? { ...event, handNumber: number }
      : event
  ),
});

const handsAsked = () => {
  const named = (params.get("hands") ?? params.get("hand") ?? "AcesCracked")
    .split(",")
    .filter((name) => name.length > 0);

  return named.map((name, index) =>
    renumbered(replayHand(name, { deck, theme }), 12 + index * 17)
  );
};

const fed = (host: MomentHost, hands: readonly MomentHand[]) =>
  Effect.runFork(
    Effect.forEach(
      hands,
      (hand) =>
        Effect.sync(() => {
          host.hand = hand;
        }).pipe(Effect.andThen(Effect.sleep("700 millis"))),
      { discard: true }
    )
  );

const tonight = (into: Element) => {
  defineMoment();
  defineTonight();

  const room = params.get("room") ?? "STAGE1";
  const only = params.get("drawer") === "only";
  const settled = params.get("settled") === "true";
  const table = document.createElement("div");
  const host = document.createElement(MOMENT_TAG);
  const drawer = document.createElement(TONIGHT_TAG);

  Object.assign(table.style, {
    background: "var(--color-felt)",
    height: only ? "1px" : "60vh",
    overflow: "hidden",
    position: "relative",
  });
  Object.assign(drawer.style, { padding: "16px" });
  table.append(host);
  into.append(table, drawer);
  Object.assign(drawer, {
    deck,
    mode: settled ? "Settled" : "Drawer",
    room,
    settled: settled ? sampleSettleUp("six") : null,
    theme,
  });

  const tableHeight = globalThis.innerHeight * 0.6;

  host.style.setProperty(
    "--moment-floor",
    `${Math.round(tableHeight * 0.3)}px`
  );
  host.style.setProperty(
    "--moment-height",
    `${Math.round(tableHeight * 0.7 - 6)}px`
  );

  if (isMomentHost(host)) {
    const hands = handsAsked();
    const [first] = hands;

    host.sound = false;
    host.room = room;
    host.dealing = params.get("turn") === "true";
    fed(host, hands);

    if (first !== undefined) {
      Reflect.set(globalThis, "__titleBox", titleBoxOf(first));
    }

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
