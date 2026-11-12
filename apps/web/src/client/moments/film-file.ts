import { Effect, Function, Option, Schema } from "effect";
import type { Scope } from "effect";

import {
  filmFrames,
  filmProblem,
  filmSamples,
} from "../../features/moments/film.js";
import type { Film, Mix } from "../../features/moments/film.js";
import { EMBEDDED_FONTS } from "../pictures/png.js";
import { ClipUnavailable, failedAt, shotAtlas } from "./clip-layers.js";
import { ClipReplySchema } from "./clip-wire.js";
import type { ClipReply, FilmRequest, WorkerRequest } from "./clip-wire.js";
import { closedPolitely } from "./worker-close.js";

export class ClipTooSlow extends Schema.TaggedError<
  ClipTooSlow,
  { readonly brand: unique symbol }
>()("ClipTooSlow", { budgetMs: Schema.Number, projectedMs: Schema.Number }) {
  override get message() {
    return `This device would take about ${Math.round(this.projectedMs / 1000)} s to make the clip, more than the ${Math.round(this.budgetMs / 1000)} s it was given. Make a shorter clip instead.`;
  }
}

export interface ClipSupport {
  readonly codec: string;
}

export interface FilmWatch {
  readonly heldBy: (heard: (held: boolean) => void) => () => void;
  readonly made: (share: number) => void;
}

export interface FilmOrder {
  readonly budgetMs: number | null;
  readonly watch?: FilmWatch;
  readonly name: string;
  readonly scale?: number;
  readonly slot: Effect.Effect<void>;
  readonly support: ClipSupport;
}

export interface FilmMade {
  readonly compared: FilmCompared | null;
  readonly file: File;
  readonly redrawn: number;
}

export interface FilmCompared {
  readonly frames: number;
  readonly most: number;
  readonly pixels: number;
}

export interface FilmChecks {
  readonly aac: FilmRequest["aac"];
  readonly bitrate: number | null;
  readonly compare: boolean;
  readonly redraw: FilmRequest["redraw"];
}

const EVERYDAY: FilmChecks = {
  aac: "Browser",
  bitrate: null,
  compare: false,
  redraw: "Changed",
};

type Progress = (made: number) => Option.Option<ClipTooSlow>;

export interface ClipWorker {
  readonly ask: (
    request: WorkerRequest,
    transfer: readonly Transferable[],
    progress?: Progress
  ) => Effect.Effect<ClipReply, ClipUnavailable | ClipTooSlow>;
  readonly hold: (held: boolean) => void;
}

export const clipWorker: Effect.Effect<
  ClipWorker,
  ClipUnavailable,
  Scope.Scope
> = Effect.acquireRelease(
  Effect.try({
    catch: failedAt("start the clip worker"),
    try: () =>
      new Worker(new URL("clip-worker.ts", import.meta.url), {
        name: "nostakes-clip",
        type: "module",
      }),
  }),
  closedPolitely
).pipe(
  Effect.map((worker) => ({
    ask: (
      request: WorkerRequest,
      transfer: readonly Transferable[],
      progress: Progress = () => Option.none()
    ) =>
      Effect.callback<unknown, ClipUnavailable | ClipTooSlow>((resume) => {
        const heard = (event: MessageEvent<unknown>) => {
          const decoded = Schema.decodeUnknownOption(ClipReplySchema)(
            event.data
          );

          if (Option.isSome(decoded) && decoded.value.tag === "Progress") {
            const slow = progress(decoded.value.made);

            if (Option.isSome(slow)) {
              resume(Effect.fail(slow.value));
            }

            return;
          }

          resume(Effect.succeed(event.data));
        };

        const broke = (event: ErrorEvent) => {
          resume(Effect.fail(failedAt("run the clip worker")(event.message)));
        };

        worker.addEventListener("message", heard);
        worker.addEventListener("error", broke, { once: true });
        worker.postMessage(request, { transfer: [...transfer] });

        return Effect.sync(() => {
          worker.removeEventListener("message", heard);
          worker.removeEventListener("error", broke);
        });
      }).pipe(
        Effect.flatMap((reply) =>
          Schema.decodeUnknownEffect(ClipReplySchema)(reply).pipe(
            Effect.mapError(failedAt("read the clip worker's reply"))
          )
        ),
        Effect.flatMap((reply) =>
          reply.tag === "Failed"
            ? Effect.fail(
                new ClipUnavailable({ detail: reply.detail, step: reply.step })
              )
            : Effect.succeed(reply)
        )
      ),
    hold: (held: boolean) => {
      worker.postMessage({ held, kind: "Hold" }, { transfer: [] });
    },
  }))
);

const evenOf = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export const scaledFrame = (
  film: Pick<Film, "height" | "width">,
  scale: number
) => ({
  height: evenOf(film.height * scale),
  width: evenOf(film.width * scale),
});

const MONO_BITRATE = 96_000;

const STEREO_BITRATE = 160_000;

export const soundBitrate = (channels: number) =>
  channels > 1 ? STEREO_BITRATE : MONO_BITRATE;

const fitted = (
  sound: Mix,
  samples: number
): readonly Float32Array<ArrayBuffer>[] =>
  sound.channels.map((channel) => {
    if (channel.length === samples) {
      return channel;
    }

    const fit = new Float32Array(samples);

    fit.set(channel.subarray(0, samples));

    return fit;
  });

const JUDGED_AFTER_SECONDS = 2;

const RUNNING: FilmWatch = {
  heldBy: () => Function.constVoid,
  made: Function.constVoid,
};

interface WorkingClock {
  readonly now: () => number;
  readonly stop: () => void;
}

const workingClock = (watch: FilmWatch, worker: ClipWorker): WorkingClock => {
  const held = { ms: 0, since: Option.none<number>() };

  const stop = watch.heldBy((holding) => {
    const now = performance.now();

    if (holding && Option.isNone(held.since)) {
      held.since = Option.some(now);
    }

    if (!holding && Option.isSome(held.since)) {
      held.ms += now - held.since.value;
      held.since = Option.none();
    }

    worker.hold(holding);
  });

  return {
    now: () => {
      const now = performance.now();

      return (
        now -
        held.ms -
        Option.match(held.since, {
          onNone: () => 0,
          onSome: (since) => now - since,
        })
      );
    },
    stop,
  };
};

const watching = (
  film: Film,
  budgetMs: number | null,
  started: number,
  clock: { readonly made: (share: number) => void; readonly now: () => number }
): Progress => {
  const frames = filmFrames(film);
  const drawing = { from: clock.now() };

  return (made) => {
    const now = clock.now();

    clock.made(made / frames);

    if (made === 0) {
      drawing.from = now;
    }

    if (budgetMs === null || made < film.fps * JUDGED_AFTER_SECONDS) {
      return Option.none();
    }

    const projectedMs =
      drawing.from - started + ((now - drawing.from) / made) * frames;

    return projectedMs > budgetMs
      ? Option.some(new ClipTooSlow({ budgetMs, projectedMs }))
      : Option.none();
  };
};

const filmWatched = (
  worker: ClipWorker,
  film: Film,
  order: FilmOrder,
  checks: FilmChecks,
  clock: WorkingClock,
  watch: FilmWatch
): Effect.Effect<FilmMade, ClipUnavailable | ClipTooSlow> =>
  Effect.gen(function* makeFilm() {
    const started = clock.now();

    yield* Option.match(filmProblem(film), {
      onNone: () => Effect.void,
      onSome: (problem) =>
        Effect.fail(
          new ClipUnavailable({ detail: problem, step: "read the film" })
        ),
    });

    const scale = order.scale ?? 1;
    const size = scaledFrame(film, scale);

    const atlas = yield* shotAtlas(
      film.shots,
      EMBEDDED_FONTS,
      order.slot,
      scale
    );

    const sound =
      film.sound === null
        ? null
        : {
            bitrate: soundBitrate(film.sound.channels.length),
            channels: fitted(
              film.sound,
              filmSamples(film, film.sound.sampleRate)
            ),
            sampleRate: film.sound.sampleRate,
          };

    const request: FilmRequest = {
      aac: checks.aac,
      bands: atlas.bands,
      bitrate: checks.bitrate,
      camera: film.camera,
      compare: checks.compare,
      fps: film.fps,
      frames: filmFrames(film),
      height: size.height,
      kind: "Film",
      redraw: checks.redraw,
      scale,
      shots: atlas.shots,
      sound,
      width: size.width,
    };

    const reply = yield* worker.ask(
      request,
      [
        ...atlas.bands,
        ...new Set((sound?.channels ?? []).map((channel) => channel.buffer)),
      ],
      watching(film, order.budgetMs, started, {
        made: watch.made,
        now: clock.now,
      })
    );

    if (reply.tag !== "Made") {
      return yield* new ClipUnavailable({
        detail: "the worker answered something else",
        step: "encode the film",
      });
    }

    return {
      compared: reply.compared,
      file: new File([reply.file], order.name, { type: "video/mp4" }),
      redrawn: reply.redrawn,
    };
  });

export const filmOn = (
  worker: ClipWorker,
  film: Film,
  order: FilmOrder,
  checks: FilmChecks = EVERYDAY
): Effect.Effect<FilmMade, ClipUnavailable | ClipTooSlow> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const watch = order.watch ?? RUNNING;

      return { clock: workingClock(watch, worker), watch };
    }),
    ({ clock, watch }) =>
      filmWatched(worker, film, order, checks, clock, watch),
    ({ clock }) => Effect.sync(clock.stop)
  );

export const filmFile = (
  film: Film,
  order: FilmOrder,
  checks: FilmChecks = EVERYDAY
): Effect.Effect<FilmMade, ClipUnavailable | ClipTooSlow> =>
  clipWorker.pipe(
    Effect.flatMap((worker) => filmOn(worker, film, order, checks)),
    Effect.scoped
  );
