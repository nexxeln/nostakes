import { Effect, Option } from "effect";

import type { MomentPicture } from "../../features/moments/picture.js";
import { offer } from "../pictures/keeper.js";
import type { PartBox } from "./clip-measure.js";
import { clipFile, clipSupport, slotFor } from "./clip.js";
import type { ClipPace, ClipSupport } from "./clip.js";

export type ClipState =
  | "Asked"
  | "Checking"
  | "Making"
  | "Ready"
  | "Share"
  | "Unavailable"
  | "Waiting";

export interface ClipArt {
  readonly boxes: readonly PartBox[];
  readonly svg: string;
}

const activationLasts = () =>
  globalThis.navigator.userActivation?.isActive ?? false;

export class Clipper {
  readonly #picture: MomentPicture;
  readonly #art: ClipArt;
  readonly #changed: (state: ClipState) => void;
  #support: ClipSupport | null = null;
  #state: ClipState = "Checking";
  #pace: ClipPace = "Quiet";
  #file: File | null = null;
  #making: AbortController | null = null;
  #dropped = false;

  constructor(
    picture: MomentPicture,
    art: ClipArt,
    changed: (state: ClipState) => void
  ) {
    this.#picture = picture;
    this.#art = art;
    this.#changed = changed;
  }

  get state(): ClipState {
    return this.#state;
  }

  start(quiet: boolean) {
    Effect.runFork(
      clipSupport("Chat").pipe(
        Effect.flatMap((found) =>
          Effect.sync(() => {
            this.#supported(found, quiet);
          })
        )
      )
    );
  }

  #supported(found: Option.Option<ClipSupport>, quiet: boolean) {
    if (this.#dropped) {
      return;
    }

    if (Option.isNone(found)) {
      this.#become("Unavailable");

      return;
    }

    this.#support = found.value;
    this.#become("Waiting");

    if (quiet) {
      this.prepare();
    }
  }

  prepare() {
    if (this.#making === null && this.#file === null) {
      this.#make("Quiet");
    }
  }

  abandon() {
    const making = this.#making;

    if (making !== null) {
      this.#making = null;
      making.abort();

      if (this.#state === "Making" || this.#state === "Asked") {
        this.#become("Waiting");
      }
    }
  }

  keep() {
    const file = this.#file;

    if (file !== null) {
      Effect.runFork(offer(file));
      this.#become("Ready");

      return;
    }

    this.#pace = "Asked";
    this.#become("Asked");

    if (this.#making === null) {
      this.#make("Asked");
    }
  }

  drop() {
    this.#dropped = true;
    this.abandon();
    this.#file = null;
  }

  #become(state: ClipState) {
    if (!this.#dropped && state !== this.#state) {
      this.#state = state;
      this.#changed(state);
    }
  }

  #make(pace: ClipPace) {
    const support = this.#support;

    if (support === null || this.#dropped) {
      return;
    }

    this.#pace = pace;

    if (pace === "Quiet") {
      this.#become("Making");
    }

    const making = new AbortController();

    this.#making = making;
    Effect.runFork(
      clipFile(this.#picture, {
        boxes: this.#art.boxes,
        frame: "Chat",
        slot: Effect.suspend(() => slotFor(this.#pace)),
        support,
        svg: this.#art.svg,
      }).pipe(
        Effect.match({
          onFailure: () => {
            this.#finished(making, null);
          },
          onSuccess: (file) => {
            this.#finished(making, file);
          },
        })
      ),
      { signal: making.signal }
    );
  }

  #finished(making: AbortController, file: File | null) {
    if (this.#making !== making) {
      return;
    }

    this.#making = null;

    if (file === null) {
      this.#become("Unavailable");

      return;
    }

    this.#file = file;

    if (this.#state === "Asked" && activationLasts()) {
      Effect.runFork(offer(file));
      this.#become("Ready");
    } else {
      this.#become(this.#state === "Asked" ? "Share" : "Ready");
    }
  }
}
