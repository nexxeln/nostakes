import { Effect } from "effect";

import { fileNameOf } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { KeepFailed } from "./keep-failed.js";

export interface PictureSource {
  readonly svg: (frame: KeptFrame, fonts: string) => string;
  readonly title: string;
}

export type Kept = "Cancelled" | "Downloaded" | "NotAllowed" | "Shared";

const IDLE_WAIT_MS = 600;

const whenIdle = Effect.callback<"Idle">((resume) => {
  const done = () => {
    resume(Effect.succeed("Idle"));
  };

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(done, { timeout: IDLE_WAIT_MS });
  } else {
    requestAnimationFrame(done);
  }
});

const drawn = (source: PictureSource, frame: KeptFrame) =>
  Effect.promise(() => import("./png.js")).pipe(
    Effect.flatMap(({ EMBEDDED_FONTS, pngFile }) =>
      pngFile(
        source.svg(frame, EMBEDDED_FONTS),
        frame,
        fileNameOf(source.title, frame)
      )
    )
  );

const download = (file: File) =>
  Effect.sync((): Kept => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;
    link.click();
    requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
    });

    return "Downloaded";
  });

const sharesFiles = (file: File) =>
  "canShare" in globalThis.navigator &&
  globalThis.navigator.canShare({ files: [file] });

const refusalOf = (cause: DOMException) => {
  if (cause.name === "AbortError") {
    return "Cancelled";
  }

  return cause.name === "NotAllowedError" ? "NotAllowed" : "Refused";
};

export const offer = (file: File): Effect.Effect<Kept> => {
  if (!sharesFiles(file)) {
    return download(file);
  }

  const sharing = globalThis.navigator.share({ files: [file] });

  return Effect.tryPromise({
    catch: (cause) =>
      new KeepFailed({
        file: file.name,
        reason: cause instanceof DOMException ? refusalOf(cause) : "Refused",
      }),
    try: () => sharing,
  }).pipe(
    Effect.as<Kept>("Shared"),
    Effect.catchTag("KeepFailed", (failed) => {
      if (failed.reason === "Cancelled") {
        return Effect.succeed<Kept>("Cancelled");
      }

      return failed.reason === "NotAllowed"
        ? Effect.succeed<Kept>("NotAllowed")
        : download(file);
    })
  );
};

export class Keeper {
  readonly #source: PictureSource;
  readonly #files = new Map<KeptFrame, File>();
  readonly #drawnAs: (frames: readonly KeptFrame[]) => void;
  #dropped = false;

  constructor(
    source: PictureSource,
    drawnAs: (frames: readonly KeptFrame[]) => void
  ) {
    this.#source = source;
    this.#drawnAs = drawnAs;
  }

  prepare(frames: readonly KeptFrame[]) {
    Effect.runFork(
      Effect.forEach(
        frames,
        (frame) =>
          whenIdle.pipe(
            Effect.andThen(Effect.suspend(() => this.#draw(frame))),
            Effect.ignore
          ),
        { discard: true }
      )
    );
  }

  keep(frame: KeptFrame) {
    const file = this.#files.get(frame);

    Effect.runFork(
      file === undefined
        ? this.#draw(frame).pipe(
            Effect.flatMap(offer),
            Effect.catchTag("KeepFailed", () =>
              Effect.succeed<Kept>("Cancelled")
            )
          )
        : offer(file)
    );
  }

  drop() {
    this.#dropped = true;
    this.#files.clear();
  }

  #draw(frame: KeptFrame) {
    const ready = this.#files.get(frame);

    if (ready !== undefined) {
      return Effect.succeed(ready);
    }

    if (this.#dropped) {
      return Effect.fail(
        new KeepFailed({
          file: fileNameOf(this.#source.title, frame),
          reason: "NotDrawn",
        })
      );
    }

    return drawn(this.#source, frame).pipe(
      Effect.tap((file) =>
        Effect.sync(() => {
          if (!this.#dropped) {
            this.#files.set(frame, file);
            this.#drawnAs([...this.#files.keys()]);
          }
        })
      )
    );
  }
}
