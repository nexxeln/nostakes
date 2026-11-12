import type { SeatIndex } from "@nostakes/engine";
import { oddsAskedBy, replayOf } from "@nostakes/room";
import type { Replay, SeenTableEvent } from "@nostakes/room";
import { Effect, Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import {
  BASE_ROLE,
  CLIP_FPS,
  SHORT_CLIP,
  shortHook,
  shortPose,
  shortSheet,
  tagPose,
} from "../../features/moments/clip-plan.js";
import type { ClipStyle } from "../../features/moments/clip-style.js";
import { driftPlan } from "../../features/moments/drift/plan.js";
import { driftTold } from "../../features/moments/drift/told.js";
import { frameTime, sampledKeys } from "../../features/moments/film.js";
import type {
  Film,
  FilmRate,
  Pose,
  Shot,
} from "../../features/moments/film.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import { spriteMarkup } from "../../features/moments/replay-art.js";
import { outcomeOf, replayPlan } from "../../features/moments/replay-plan.js";
import type {
  ReplayNote,
  ReplayPlan,
  ReplaySeat,
} from "../../features/moments/replay-plan.js";
import { FAMILIES } from "../../features/moments/score.js";
import type { ScoreSheet } from "../../features/moments/sound/sheet.js";
import { FRAME_SIZES, paletteFor } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { cardParts, ClipUnavailable } from "./clip-layers.js";
import type { CardPart } from "./clip-layers.js";
import type { PartBox } from "./clip-measure.js";
import { clipWorker, filmFile, filmOn } from "./film-file.js";
import type {
  ClipSupport,
  ClipTooSlow,
  ClipWorker,
  FilmOrder,
  FilmWatch,
} from "./film-file.js";
import { mixedOffThread } from "./soundtrack.js";

export { ClipUnavailable } from "./clip-layers.js";

export type { PartBox } from "./clip-measure.js";

export { ClipTooSlow, filmFile } from "./film-file.js";

export type { ClipSupport, FilmMade, FilmOrder } from "./film-file.js";

const VIDEO_CODECS = ["avc1.640028", "avc1.4D4028", "avc1.42E028"];

const VIDEO_BITRATE = 3_000_000;

const ENCODING_GLOBALS = [
  "OffscreenCanvas",
  "VideoEncoder",
  "VideoFrame",
  "Worker",
] as const;

const hasEncoders = () => ENCODING_GLOBALS.every((name) => name in globalThis);

const videoCodec = (size: {
  readonly height: number;
  readonly width: number;
}) =>
  Effect.all(
    VIDEO_CODECS.map((codec) =>
      Effect.tryPromise(() =>
        VideoEncoder.isConfigSupported({
          avc: { format: "avc" },
          bitrate: VIDEO_BITRATE,
          codec,
          framerate: CLIP_FPS,
          height: size.height,
          width: size.width,
        })
      ).pipe(
        Effect.map((found) => (found.supported === true ? [codec] : [])),
        Effect.orElseSucceed(() => [])
      )
    )
  ).pipe(Effect.map((found) => Option.fromNullishOr(found.flat()[0])));

export const filmSupport = (size: {
  readonly height: number;
  readonly width: number;
}): Effect.Effect<Option.Option<ClipSupport>> =>
  hasEncoders()
    ? videoCodec(size).pipe(Effect.map(Option.map((codec) => ({ codec }))))
    : Effect.succeedNone;

export const clipSupport = (
  frame: KeptFrame
): Effect.Effect<Option.Option<ClipSupport>> => filmSupport(FRAME_SIZES[frame]);

export type ClipPace = "Asked" | "Quiet";

const QUIET_MS = 6;

const ASKED_WAIT_MS = 120;

const afterPaint: Effect.Effect<void> = Effect.callback<"Painted">((resume) => {
  const channel = new MessageChannel();

  channel.port1.addEventListener("message", () => {
    resume(Effect.succeed("Painted"));
  });
  channel.port1.start();

  const id = requestAnimationFrame(() => {
    channel.port2.postMessage(0);
  });

  return Effect.sync(() => {
    cancelAnimationFrame(id);
    channel.port1.close();
  });
}).pipe(Effect.asVoid);

const idleFor = (pace: ClipPace): Effect.Effect<void> =>
  Effect.callback<"Idle">((resume) => {
    const waiting = { id: 0 };

    const ask = () => {
      waiting.id = globalThis.requestIdleCallback(
        (deadline) => {
          if (
            pace === "Asked" ||
            deadline.didTimeout ||
            deadline.timeRemaining() >= QUIET_MS
          ) {
            resume(Effect.succeed("Idle"));
          } else {
            ask();
          }
        },
        pace === "Asked" ? { timeout: ASKED_WAIT_MS } : {}
      );
    };

    ask();

    return Effect.sync(() => {
      globalThis.cancelIdleCallback(waiting.id);
    });
  }).pipe(Effect.asVoid);

export const slotFor = (pace: ClipPace): Effect.Effect<void> =>
  "requestIdleCallback" in globalThis ? idleFor(pace) : afterPaint;

export const clipName = (picture: MomentPicture, frame: KeptFrame) =>
  `nostakes-${picture.title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.mp4`;

export interface ClipOrder {
  readonly boxes: readonly PartBox[];
  readonly budgetMs: number | null;
  readonly frame: KeptFrame;
  readonly slot: Effect.Effect<void>;
  readonly support: ClipSupport;
  readonly svg: string;
  readonly watch?: FilmWatch;
}

const filmOrderOf = (
  order: ClipOrder,
  name: string,
  scale: number
): FilmOrder => {
  const base = {
    budgetMs: order.budgetMs,
    name,
    scale,
    slot: order.slot,
    support: order.support,
  };

  return order.watch === undefined ? base : { ...base, watch: order.watch };
};

const motionOf = (picture: MomentPicture) => ({
  family: FAMILIES[picture.kind],
  tier: picture.tier,
});

export const cardShots = (
  parts: readonly CardPart[],
  timing: {
    readonly fps: FilmRate;
    readonly frames: number;
    readonly pose: (part: CardPart, ms: number) => Pose;
  }
): readonly Shot[] =>
  parts.map((part) => ({
    art: part.art,
    box: part.cell,
    keys: sampledKeys((ms) => timing.pose(part, ms), timing.frames, timing.fps),
    pinned: part.role === BASE_ROLE,
    pivot: part.centre,
  }));

const DEALT_ROLES = new Set(["board", "lifted"]);

export const cardFilm = (
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ClipOrder
): Effect.Effect<Film, ClipUnavailable> =>
  Effect.gen(function* clip() {
    const { frame, slot } = order;
    const size = FRAME_SIZES[frame];
    const parts = yield* cardParts(order.svg, order.boxes, size);
    const frames = Math.ceil((SHORT_CLIP.lengthMs * CLIP_FPS) / 1000);
    const length = frameTime(frames, CLIP_FPS);

    yield* slot;

    const card = cardShots(parts, {
      fps: CLIP_FPS,
      frames,
      pose: shortPose,
    });

    const palette = paletteFor(look.theme, look.deck);

    const hook = shortHook(picture.line, frame).map((sprite) => {
      const drawn = spriteMarkup(palette, look.theme, sprite.art);

      return { art: drawn.markup, box: drawn.box, keys: sprite.keys };
    });

    const shots = [...card, ...hook];

    const sheet = shortSheet({
      cards: parts.filter((part) => DEALT_ROLES.has(part.role)).length,
      outcome: outcomeOf(picture.kind),
      seed: picture.pot,
    });

    return {
      camera: [],
      fps: CLIP_FPS,
      height: size.height,
      length,
      shots,
      sound: yield* mixedOffThread({ ...sheet, lengthMs: length }),
      width: size.width,
    };
  });

export const clipFile = (
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ClipOrder
): Effect.Effect<File, ClipUnavailable | ClipTooSlow> =>
  cardFilm(picture, look, order).pipe(
    Effect.flatMap((film) =>
      filmFile(film, filmOrderOf(order, clipName(picture, order.frame), 1))
    ),
    Effect.map((made) => made.file)
  );

export interface ReplayOrder extends ClipOrder {
  readonly calm?: boolean;
  readonly notes: readonly ReplayNote[];
  readonly scale?: number;
  readonly style?: ClipStyle;
  readonly principals: readonly SeatIndex[];
  readonly record: readonly SeenTableEvent[];
  readonly seats: readonly ReplaySeat[];
}

const SPRITES_PER_SLOT = 6;

const chancesOf = (worker: ClipWorker, record: readonly SeenTableEvent[]) =>
  Effect.all(
    oddsAskedBy(record).map((asked) =>
      worker
        .ask({ board: asked.board, holes: asked.holes, kind: "Chances" }, [])
        .pipe(
          Effect.map(
            (reply) =>
              [
                JSON.stringify(asked),
                reply.tag === "Chances" ? reply.percents : [],
              ] as const
          )
        )
    )
  ).pipe(Effect.map((answers) => new Map(answers)));

const spriteShots = (
  plan: ReplayPlan,
  look: { readonly deck: Deck; readonly theme: Theme },
  slot: Effect.Effect<void>
) =>
  Effect.gen(function* drawSprites() {
    const palette = paletteFor(look.theme, look.deck);
    const shots: Shot[] = [];

    for (const [index, sprite] of plan.sprites.entries()) {
      if (index % SPRITES_PER_SLOT === 0) {
        yield* slot;
      }

      const drawn = spriteMarkup(palette, look.theme, sprite.art);

      shots.push({ art: drawn.markup, box: drawn.box, keys: sprite.keys });
    }

    return shots;
  });

const UNDER_SPRITES = new Set([BASE_ROLE, "felt", "mark"]);

export interface StoryPlan {
  readonly beats: readonly { readonly at: number; readonly hold: number }[];
  readonly sheet: ScoreSheet;
}

export interface ReplayStory {
  readonly film: Film;
  readonly plan: StoryPlan;
}

const driftStory = (
  replay: Replay,
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ReplayOrder
): Effect.Effect<ReplayStory, ClipUnavailable> =>
  Effect.gen(function* driftClip() {
    const plan = driftPlan(
      driftTold(replay, {
        kind: picture.kind,
        principals: order.principals,
        seats: order.seats,
        title: picture.title,
      }),
      {
        calm: order.calm ?? false,
        deck: look.deck,
        kept: {
          shows: [
            ...picture.boards.flat(),
            ...picture.faces.flatMap((face) => face.cards),
          ],
          svg: order.svg,
        },
        seed: replay.handNumber,
        theme: look.theme,
      }
    );

    yield* order.slot;

    return {
      film: {
        camera: plan.camera,
        fps: CLIP_FPS,
        height: FRAME_SIZES.Story.height,
        length: plan.length,
        shots: plan.shots,
        sound: yield* mixedOffThread(plan.sheet, "Drift"),
        width: FRAME_SIZES.Story.width,
      },
      plan,
    };
  });

export const replayStory = (
  worker: ClipWorker,
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ReplayOrder
): Effect.Effect<ReplayStory, ClipUnavailable | ClipTooSlow> =>
  Effect.gen(function* replayClip() {
    const { frame, slot } = order;
    const size = FRAME_SIZES[frame];
    const percents = yield* chancesOf(worker, order.record);

    yield* slot;

    const replay = yield* Effect.fromOption(
      replayOf(
        order.record,
        (asked) => percents.get(JSON.stringify(asked)) ?? []
      )
    ).pipe(
      Effect.mapError(
        () =>
          new ClipUnavailable({
            detail: "the hand did not end in what this device saw",
            step: "tell the hand",
          })
      )
    );

    if (order.style === "Drift" && frame === "Story") {
      return yield* driftStory(replay, picture, look, order);
    }

    const told = replayPlan(replay, {
      frame,
      kind: picture.kind,
      notes: order.notes,
      principals: order.principals,
      seats: order.seats,
      tier: picture.tier,
    });

    const frames = Math.ceil((told.length * CLIP_FPS) / 1000);
    const length = frameTime(frames, CLIP_FPS);
    const plan = { ...told, sheet: { ...told.sheet, lengthMs: length } };
    const parts = yield* cardParts(order.svg, order.boxes, size);
    const tag = { cardAt: plan.cardAt, motion: motionOf(picture) };

    yield* slot;

    const card = cardShots(parts, {
      fps: CLIP_FPS,
      frames,
      pose: (part, ms) => tagPose(part, ms, tag),
    });

    const under = card.filter((_, index) =>
      UNDER_SPRITES.has(parts[index]?.role ?? "")
    );

    const over = card.filter(
      (_, index) => !UNDER_SPRITES.has(parts[index]?.role ?? "")
    );

    const sprites = yield* spriteShots(plan, look, slot);

    const sound = yield* mixedOffThread(plan.sheet);

    return {
      film: {
        camera: plan.camera,
        fps: CLIP_FPS,
        height: size.height,
        length,
        shots: [...under, ...sprites, ...over],
        sound,
        width: size.width,
      },
      plan,
    };
  });

export const replayFilm = (
  worker: ClipWorker,
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ReplayOrder
): Effect.Effect<Film, ClipUnavailable | ClipTooSlow> =>
  replayStory(worker, picture, look, order).pipe(
    Effect.map((story) => story.film)
  );

export const replayFile = (
  picture: MomentPicture,
  look: { readonly deck: Deck; readonly theme: Theme },
  order: ReplayOrder
): Effect.Effect<File, ClipUnavailable | ClipTooSlow> =>
  clipWorker.pipe(
    Effect.flatMap((worker) =>
      replayFilm(worker, picture, look, order).pipe(
        Effect.flatMap((film) =>
          filmOn(
            worker,
            film,
            filmOrderOf(order, clipName(picture, order.frame), order.scale ?? 1)
          )
        )
      )
    ),
    Effect.map((made) => made.file),
    Effect.scoped
  );
