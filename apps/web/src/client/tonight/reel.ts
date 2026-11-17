import { oddsAskedBy, replayOf } from "@nostakes/room";
import type { SeenTableEvent } from "@nostakes/room";
import { Effect, Option } from "effect";

import { CLIP_FPS } from "../../features/moments/atlas.js";
import { filmFrames, frameTime } from "../../features/moments/film.js";
import type { Film, Mix } from "../../features/moments/film.js";
import {
  reelPartOf,
  reelPicks,
  reelPlan,
} from "../../features/moments/reel.js";
import type { ReelLook, ReelMoment } from "../../features/moments/reel.js";
import { FRAME_SIZES } from "../../features/pictures/paper.js";
import { ClipUnavailable } from "../moments/clip-layers.js";
import { clipWorker, filmOn } from "../moments/film-file.js";
import type {
  ClipSupport,
  ClipTooSlow,
  ClipWorker,
  FilmWatch,
} from "../moments/film-file.js";
import { mixedOffThread } from "../moments/soundtrack.js";

export const REEL_NAME = "nostakes-night-reel.mp4";

const chancesOf = (worker: ClipWorker, record: readonly SeenTableEvent[]) =>
  Effect.forEach(oddsAskedBy(record), (asked) =>
    worker
      .ask(
        {
          board: asked.board,
          dead: asked.dead,
          game: asked.game,
          holes: asked.holes,
          kind: "Chances",
        },
        []
      )
      .pipe(
        Effect.map(
          (reply) =>
            [
              JSON.stringify(asked),
              reply.tag === "Chances" ? reply.percents : [],
            ] as const
        )
      )
  ).pipe(Effect.map((answers) => new Map(answers)));

const joined = (mixes: readonly Mix[], tailSamples: number): Mix | null => {
  const [first] = mixes;

  if (first === undefined) {
    return null;
  }

  const channels = first.channels.map((_, channel) => {
    let length = tailSamples;

    for (const mix of mixes) {
      length += mix.channels[channel]?.length ?? 0;
    }

    const out = new Float32Array(length);
    let at = 0;

    for (const mix of mixes) {
      const samples = mix.channels[channel];

      if (samples !== undefined) {
        out.set(samples, at);
        at += samples.length;
      }
    }

    return out;
  });

  return { channels, sampleRate: first.sampleRate };
};

export interface ReelOrder {
  readonly scale: number;
  readonly slot: Effect.Effect<void>;
  readonly support: ClipSupport;
  readonly watch: FilmWatch;
}

export const reelFilm = (
  worker: ClipWorker,
  moments: readonly ReelMoment[],
  endSvg: string,
  look: ReelLook,
  slot: Effect.Effect<void>
): Effect.Effect<Film, ClipUnavailable | ClipTooSlow> =>
  Effect.gen(function* filmReel() {
    const picks = reelPicks(moments);
    const parts = [];

    for (const moment of picks) {
      const percents = yield* chancesOf(worker, moment.hand.record);

      yield* slot;

      const replay = replayOf(
        moment.hand.record,
        (asked) => percents.get(JSON.stringify(asked)) ?? []
      );

      if (Option.isSome(replay)) {
        parts.push(reelPartOf(moment, replay.value, look));
      }
    }

    if (parts.length === 0) {
      return yield* new ClipUnavailable({
        detail: "no moment of the night told its hand on this device",
        step: "pick the night's moments",
      });
    }

    const plan = reelPlan(parts, { svg: endSvg });
    const mixes: Mix[] = [];

    for (const part of parts) {
      yield* slot;
      mixes.push(
        yield* mixedOffThread({ ...part.sheet, lengthMs: part.length }, "Drift")
      );
    }

    const length = frameTime(
      filmFrames({ fps: CLIP_FPS, length: plan.length }),
      CLIP_FPS
    );

    const sampleRate = mixes[0]?.sampleRate ?? 48_000;
    const tail = Math.round(((length - plan.endAt) * sampleRate) / 1000);
    const { height, width } = FRAME_SIZES.Story;

    return {
      camera: plan.camera,
      fps: CLIP_FPS,
      height,
      length,
      shots: plan.shots.map(({ art, box, keys, pinned, pivot }) => {
        const base = { art, box, keys, pinned: pinned === true };

        return pivot === undefined ? base : { ...base, pivot };
      }),
      sound: joined(mixes, tail),
      width,
    };
  });

export const reelFile = (
  moments: readonly ReelMoment[],
  endSvg: string,
  look: ReelLook,
  order: ReelOrder
): Effect.Effect<File, ClipUnavailable | ClipTooSlow> =>
  clipWorker.pipe(
    Effect.flatMap((worker) =>
      reelFilm(worker, moments, endSvg, look, order.slot).pipe(
        Effect.flatMap((film) =>
          filmOn(worker, film, {
            budgetMs: null,
            name: REEL_NAME,
            scale: order.scale,
            slot: order.slot,
            support: order.support,
            watch: order.watch,
          })
        )
      )
    ),
    Effect.map((made) => made.file),
    Effect.scoped
  );
