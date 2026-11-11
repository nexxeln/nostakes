import "../../src/client/tokens.css";
import { replayOf } from "@nostakes/room";
import { Effect, Option } from "effect";

import { drawFrame, placementsAt } from "../../src/client/moments/clip-draw.js";
import {
  atlasOf,
  replayAtlas,
  spriteAtlas,
} from "../../src/client/moments/clip-layers.js";
import { measureParts } from "../../src/client/moments/clip-measure.js";
import { EMBEDDED_FONTS } from "../../src/client/pictures/png.js";
import { CLIP_STAGING } from "../../src/features/moments/clip-plan.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { spriteMarkup } from "../../src/features/moments/replay-art.js";
import { replayPlan } from "../../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../../src/features/moments/scene.js";
import { FAMILIES } from "../../src/features/moments/score.js";
import { paletteFor } from "../../src/features/pictures/paper.js";
import { replayHand } from "./replay-hands.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const deck = "TwoColour" as const;

const WIDTH = 1080;

const HEIGHT = 1350;

const TILE = Number(params.get("tile") ?? "6");

const SCALE = Number(params.get("scale") ?? "0.25");

const hand = replayHand(params.get("hand") ?? "", { deck, theme });

const stage = document.querySelector("#stage");

const measured = (svg: string) => {
  const host = document.createElement("div");

  host.style.width = "420px";
  host.innerHTML = svg;
  document.body.append(host);

  const root = host.querySelector("svg");
  const boxes = root === null ? [] : measureParts(root);

  host.remove();

  return boxes;
};

const program = Effect.gen(function* storyboard() {
  const found = shownMomentOf(hand);
  const replay = replayOf(hand.record);

  if (Option.isNone(found) || Option.isNone(replay)) {
    return { failure: "no moment or no replay", frames: "" };
  }

  const { picture, seats } = found.value;
  const people = new Map(hand.people.map((person) => [person.player, person]));

  const plan = replayPlan(replay.value, {
    lead: seats[0] ?? replay.value.dealtIn[0] ?? replay.value.button,
    seats: hand.lastHand.dealtIn.map(({ player, seat }) => ({
      avatar: people.get(player)?.avatar ?? "",
      name: people.get(player)?.name ?? "Someone",
      seat,
      stack: hand.stacks?.find((each) => each.seat === seat)?.stack ?? null,
    })),
  });

  yield* Effect.promise(() => document.fonts.ready);

  const boxes = measured(
    pictureSvg(picture, { deck, fonts: "", frame: "Table", theme })
  );

  const card = yield* atlasOf(
    pictureSvg(picture, { deck, fonts: "", frame: "Chat", theme }),
    {
      boxes,
      fonts: EMBEDDED_FONTS,
      from: (role) =>
        role === "base" || CLIP_STAGING.landed.has(role) ? 0 : plan.cardAt,
      size: { height: HEIGHT, width: WIDTH },
    },
    Effect.void
  );

  const palette = paletteFor(theme, deck);

  const sprites = yield* spriteAtlas(
    plan.sprites.map((sprite) => ({
      ...spriteMarkup(palette, theme, sprite.art),
      keys: sprite.keys,
    })),
    EMBEDDED_FONTS,
    Effect.void
  );

  const atlas = replayAtlas(card, sprites);
  const motion = { family: FAMILIES[picture.kind], tier: picture.tier };

  const asked = (params.get("at") ?? "")
    .split(",")
    .filter((each) => each.length > 0)
    .map(Number);

  const times =
    asked.length > 0
      ? asked
      : Array.from({ length: TILE * 2 }, (_, index) =>
          Math.round((index * (plan.length - 1)) / (TILE * 2 - 1))
        );

  const sheet = new OffscreenCanvas(
    WIDTH * SCALE * TILE,
    HEIGHT * SCALE * Math.ceil(times.length / TILE)
  );

  const sheetContext = sheet.getContext("2d");
  const frame = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = frame.getContext("2d");

  if (sheetContext === null || context === null) {
    return { failure: "no canvas", frames: "" };
  }

  for (const [index, ms] of times.entries()) {
    drawFrame(
      context,
      atlas.bands,
      atlas.layers,
      placementsAt(atlas.layers, motion, ms)
    );
    sheetContext.drawImage(
      frame,
      (index % TILE) * WIDTH * SCALE,
      Math.floor(index / TILE) * HEIGHT * SCALE,
      WIDTH * SCALE,
      HEIGHT * SCALE
    );
  }

  const blob = yield* Effect.promise(() =>
    sheet.convertToBlob({ type: "image/png" })
  );

  const bytes = new Uint8Array(yield* Effect.promise(() => blob.arrayBuffer()));
  let binary = "";

  for (let at = 0; at < bytes.length; at += 32_768) {
    binary += String.fromCodePoint(...bytes.subarray(at, at + 32_768));
  }

  return {
    cardAt: plan.cardAt,
    frames: btoa(binary),
    kind: picture.kind,
    length: plan.length,
    sprites: plan.sprites.length,
    tier: picture.tier,
    times,
    title: picture.title,
  };
});

await Effect.runPromise(
  program.pipe(
    Effect.flatMap((result) =>
      Effect.sync(() => {
        if (stage instanceof HTMLElement) {
          stage.dataset.result = JSON.stringify(result);
        }
      })
    )
  )
);

document.documentElement.dataset.staged = "true";
