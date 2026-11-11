import "../../src/client/tokens.css";
import { replayOf } from "@nostakes/room";
import { Effect, Option } from "effect";

import { measureParts } from "../../src/client/moments/clip-measure.js";
import { replayFilm } from "../../src/client/moments/clip.js";
import { clipWorker } from "../../src/client/moments/film-file.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { replaySeatsOf } from "../../src/features/moments/replay-plan.js";
import { shownMomentOf } from "../../src/features/moments/scene.js";
import { evenTimes, filmSheet } from "./film-sheet.js";
import { replayHand } from "./replay-hands.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const deck = "TwoColour" as const;

const frame = params.get("frame") === "Chat" ? "Chat" : "Story";

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

  yield* Effect.promise(() => document.fonts.ready);

  const boxes = measured(
    pictureSvg(picture, { deck, fonts: "", frame: "Table", theme })
  );

  const worker = yield* clipWorker;

  const film = yield* replayFilm(
    worker,
    picture,
    { deck, theme },
    {
      boxes,
      budgetMs: null,
      frame,
      principals: seats,
      record: hand.record,
      seats: replaySeatsOf(hand),
      slot: Effect.void,
      support: { codec: "", sound: false },
      svg: pictureSvg(picture, { deck, fonts: "", frame, theme }),
    }
  );

  const asked = (params.get("at") ?? "")
    .split(",")
    .filter((each) => each.length > 0)
    .map(Number);

  const sheet = yield* filmSheet(film, {
    scale: SCALE,
    tile: TILE,
    times: asked.length > 0 ? asked : evenTimes(film, TILE * 2),
  });

  return {
    frames: sheet.png,
    kind: picture.kind,
    length: film.length,
    shots: film.shots.length,
    tier: picture.tier,
    times: sheet.times,
    title: picture.title,
  };
}).pipe(Effect.scoped);

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
