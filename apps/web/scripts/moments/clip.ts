import "../../src/client/tokens.css";
import { Clock, Effect, Option } from "effect";

import { measureParts } from "../../src/client/moments/clip-measure.js";
import type { PartBox } from "../../src/client/moments/clip-measure.js";
import {
  clipFile,
  clipSupport,
  slotFor,
} from "../../src/client/moments/clip.js";
import { EMBEDDED_FONTS, pngFile } from "../../src/client/pictures/png.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { FRAME_SIZES, fileNameOf } from "../../src/features/pictures/paper.js";
import type { KeptFrame } from "../../src/features/pictures/paper.js";
import { samplePicture } from "./samples.js";

const params = new URLSearchParams(globalThis.location.search);

const theme = params.get("theme") === "Dark" ? "Dark" : "Light";

const frame: KeptFrame = params.get("frame") === "Story" ? "Story" : "Chat";

const deck = params.get("deck") === "four" ? "FourColour" : "TwoColour";

const pace = params.get("pace") === "Asked" ? "Asked" : "Quiet";

const tableWorkMs = Number(params.get("tableWork") ?? "3");

const picture = samplePicture(params.get("sample") ?? "");

const LATE_FRAME_MS = 25;

const busyFor = (ms: number, from: number) => {
  let spins = 0;

  while (performance.now() - from < ms) {
    spins += 1;
  }

  return spins;
};

const tableStandIn = () => {
  const seen = { frames: 0, late: 0, longest: 0, running: true };
  let last = -1;

  const tick = (now: number) => {
    if (last >= 0) {
      const gap = now - last;

      seen.frames += 1;
      seen.longest = Math.max(seen.longest, gap);
      seen.late += gap > LATE_FRAME_MS ? 1 : 0;
    }

    last = now;
    busyFor(tableWorkMs, now);

    if (seen.running) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);

  return seen;
};

const frameTop = (FRAME_SIZES[frame].height - FRAME_SIZES.Chat.height) / 2;

const titleBoxOf = (boxes: readonly PartBox[]) => {
  const title = boxes.find((part) => part.role === "title");

  return title === undefined
    ? undefined
    : { ...title.box, y: title.box.y + frameTop };
};

const measured = () => {
  const host = document.createElement("div");

  host.style.width = "420px";
  host.innerHTML = pictureSvg(picture, {
    deck,
    fonts: "",
    frame: "Table",
    theme,
  });
  document.body.append(host);

  const root = host.querySelector("svg");
  const boxes = root === null ? [] : measureParts(root);

  host.remove();

  return boxes;
};

const slices: number[] = [];

const timedSlot = () => {
  const resumed = { at: -1 };

  return Effect.suspend(() => {
    if (resumed.at >= 0) {
      slices.push(Math.round(performance.now() - resumed.at));
    }

    return slotFor(pace).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          resumed.at = performance.now();
        })
      )
    );
  });
};

const program = Effect.gen(function* stageClip() {
  const support = yield* clipSupport(frame);

  if (Option.isNone(support)) {
    return { files: [], result: { support: null } };
  }

  const still = yield* pngFile(
    pictureSvg(picture, { deck, fonts: EMBEDDED_FONTS, frame, theme }),
    frame,
    fileNameOf(picture.title, frame)
  );

  yield* Effect.promise(() => document.fonts.ready);

  const boxes = measured();
  const before = tableStandIn();

  yield* Effect.sleep("1 second");
  before.running = false;

  const during = tableStandIn();
  const started = yield* Clock.currentTimeMillis;

  const clip = yield* clipFile(picture, {
    boxes,
    budgetMs: null,
    frame,
    slot: timedSlot(),
    support: support.value,
    svg: pictureSvg(picture, { deck, fonts: "", frame, theme }),
  });

  const finished = yield* Clock.currentTimeMillis;

  during.running = false;

  return {
    files: [still, clip],
    result: {
      lateBefore: before.late,
      lateDuring: during.late,
      longestBeforeMs: Math.round(before.longest),
      longestDuringMs: Math.round(during.longest),
      ms: finished - started,
      size: clip.size,
      slices,
      support: support.value,
      title: titleBoxOf(boxes),
    },
  };
});

const stage = document.querySelector("#stage");

await Effect.runPromise(
  program.pipe(
    Effect.match({
      onFailure: (failure) => ({
        files: [],
        result: { failure: failure.message },
      }),
      onSuccess: (made) => made,
    }),
    Effect.flatMap(({ files, result }) =>
      Effect.sync(() => {
        Reflect.set(globalThis, "__files", files);

        if (stage instanceof HTMLElement) {
          stage.dataset.result = JSON.stringify(result);
        }
      })
    )
  )
);

document.documentElement.dataset.staged = "true";
