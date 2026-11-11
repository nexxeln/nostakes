import { Effect, Option, Schema } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import {
  REPLAY_BUDGET_MS,
  reachFor,
} from "../../features/moments/clip-reach.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import {
  replaySeatsOf,
  tellsTheHand,
} from "../../features/moments/replay-plan.js";
import { offer } from "../pictures/keeper.js";
import type { PartBox } from "./clip-measure.js";
import { clipFile, clipSupport, replayFile, slotFor } from "./clip.js";
import type { ClipPace, ClipSupport } from "./clip.js";
import type { SceneStory } from "./element.js";

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
  readonly look: { readonly deck: Deck; readonly theme: Theme };
  readonly story: SceneStory | null;
  readonly svg: string;
}

const replayOrderOf = (story: SceneStory | null) =>
  story === null
    ? null
    : {
        principals: story.seats,
        record: story.hand.record,
        seats: replaySeatsOf(story.hand),
      };

const ReportedMemorySchema = Schema.Struct({ deviceMemory: Schema.Finite });

const deviceMemory = () =>
  Schema.decodeUnknownOption(ReportedMemorySchema)(globalThis.navigator).pipe(
    Option.map((reported) => reported.deviceMemory)
  );

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

    if (Option.isNone(found) || reachFor(deviceMemory()) === "None") {
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

    const order = {
      boxes: this.#art.boxes,
      budgetMs: null,
      frame: "Chat" as const,
      slot: Effect.suspend(() => slotFor(this.#pace)),
      support,
      svg: this.#art.svg,
    };

    const replay = replayOrderOf(this.#art.story);
    const short = clipFile(this.#picture, order);

    Effect.runFork(
      (replay !== null &&
      tellsTheHand(this.#picture.kind, this.#picture.tier) &&
      reachFor(deviceMemory()) === "Replay"
        ? replayFile(this.#picture, this.#art.look, {
            ...order,
            ...replay,
            budgetMs: REPLAY_BUDGET_MS,
          }).pipe(Effect.catchTag("ClipTooSlow", () => short))
        : short
      ).pipe(
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
