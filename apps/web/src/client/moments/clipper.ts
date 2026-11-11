import { Effect, Exit, Fiber, Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import { offer } from "../pictures/keeper.js";
import type { PartBox } from "./clip-measure.js";
import { clipFile, clipSupport, slotFor } from "./clip.js";
import type { ClipPace, ClipSupport, ClipUnavailable } from "./clip.js";

export type ClipState =
  | "Asked"
  | "Checking"
  | "Making"
  | "Ready"
  | "Share"
  | "Unavailable"
  | "Waiting";

interface Look {
  readonly deck: Deck;
  readonly theme: Theme;
}

const activationLasts = () =>
  globalThis.navigator.userActivation?.isActive ?? false;

export class Clipper {
  readonly #picture: MomentPicture;
  readonly #look: Look;
  readonly #boxes: readonly PartBox[];
  readonly #changed: (state: ClipState) => void;
  #support: ClipSupport | null = null;
  #state: ClipState = "Checking";
  #pace: ClipPace = "Quiet";
  #file: File | null = null;
  #making: Fiber.Fiber<File, ClipUnavailable> | null = null;
  #dropped = false;

  constructor(
    picture: MomentPicture,
    look: Look,
    boxes: readonly PartBox[],
    changed: (state: ClipState) => void
  ) {
    this.#picture = picture;
    this.#look = look;
    this.#boxes = boxes;
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
      Effect.runFork(Fiber.interrupt(making));

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

    const making = Effect.runFork(
      clipFile(this.#picture, this.#look, {
        boxes: this.#boxes,
        frame: "Chat",
        slot: Effect.suspend(() => slotFor(this.#pace)),
        support,
      })
    );

    this.#making = making;
    making.addObserver((exit) => {
      if (this.#making !== making) {
        return;
      }

      this.#making = null;

      if (Exit.isSuccess(exit)) {
        this.#file = exit.value;

        if (this.#state === "Asked" && activationLasts()) {
          Effect.runFork(offer(exit.value));
          this.#become("Ready");
        } else {
          this.#become(this.#state === "Asked" ? "Share" : "Ready");
        }
      } else {
        this.#become("Unavailable");
      }
    });
  }
}
