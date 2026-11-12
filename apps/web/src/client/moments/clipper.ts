import { Duration, Effect, Option, Schedule, Schema } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import {
  REPLAY_BUDGET_MS,
  reachFor,
  replayScales,
} from "../../features/moments/clip-reach.js";
import type { ClipStyle } from "../../features/moments/clip-style.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import {
  replayNotesOf,
  replaySeatsOf,
  tellsTheHand,
} from "../../features/moments/replay-plan.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { offer } from "../pictures/keeper.js";
import type { Kept } from "../pictures/keeper.js";
import { ClipUnavailable } from "./clip-layers.js";
import type { PartBox } from "./clip-measure.js";
import { clipFile, clipSupport, replayFile, slotFor } from "./clip.js";
import type { ClipPace, ClipSupport, ClipTooSlow } from "./clip.js";
import type { SceneStory } from "./element.js";
import type { FilmWatch } from "./film-file.js";

export type ClipState =
  | "Asked"
  | "Checking"
  | "Failed"
  | "Making"
  | "Ready"
  | "Share"
  | "Unavailable"
  | "Waiting";

export interface ClipMaking {
  readonly made: number;
  readonly style: ClipStyle;
}

export interface ClipArt {
  readonly boxes: readonly PartBox[];
  readonly calm: boolean;
  readonly look: { readonly deck: Deck; readonly theme: Theme };
  readonly story: SceneStory | null;
  readonly svg: (frame: KeptFrame) => string;
}

const replayOrderOf = (story: SceneStory | null) =>
  story === null
    ? null
    : {
        notes: replayNotesOf(story.hand),
        principals: story.seats,
        record: story.hand.record,
        seats: replaySeatsOf(story.hand),
      };

const ReportedMemorySchema = Schema.Struct({ deviceMemory: Schema.Finite });

const deviceMemory = () =>
  Schema.decodeUnknownOption(ReportedMemorySchema)(globalThis.navigator).pipe(
    Option.map((reported) => reported.deviceMemory)
  );

const MAKING_LIMIT_SECONDS = 120;

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
  #fileStyle: ClipStyle | null = null;
  #making: AbortController | null = null;
  #makingStyle: ClipStyle;
  #made = 0;
  #owed = false;
  #dropped = false;
  #style: ClipStyle;
  #held = false;
  #waiting: (() => void)[] = [];
  readonly #holdHeard = new Set<(held: boolean) => void>();

  constructor(
    picture: MomentPicture,
    art: ClipArt,
    look: {
      readonly changed: (state: ClipState) => void;
      readonly style: ClipStyle;
    }
  ) {
    this.#picture = picture;
    this.#art = art;
    this.#changed = look.changed;
    this.#style = look.style;
    this.#makingStyle = look.style;
  }

  get offersDrift(): boolean {
    return (
      this.#support !== null &&
      this.#art.story !== null &&
      tellsTheHand(this.#picture.kind, this.#picture.tier) &&
      reachFor(deviceMemory()) === "Replay"
    );
  }

  get state(): ClipState {
    return this.#state;
  }

  get owed(): boolean {
    return this.#owed;
  }

  get making(): ClipMaking | null {
    return this.#making === null
      ? null
      : { made: this.#made, style: this.#makingStyle };
  }

  get title(): string {
    return this.#picture.title;
  }

  restyle(style: ClipStyle) {
    if (style === this.#style) {
      return;
    }

    this.#style = style;
    this.#stopMaking();

    if (this.#support === null || this.#fileStyle === style) {
      this.#tell();

      return;
    }

    this.#owed = true;
    this.#become(this.#file === null ? "Making" : "Ready");

    this.#make("Asked");
    this.#tell();
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
    if (
      this.#making === null &&
      this.#file === null &&
      this.#state !== "Failed"
    ) {
      this.#make("Quiet");
    }
  }

  hold(held: boolean) {
    if (held === this.#held) {
      return;
    }

    this.#held = held;

    if (!held) {
      const woken = this.#waiting;

      this.#waiting = [];

      for (const go of woken) {
        go();
      }
    }

    for (const heard of this.#holdHeard) {
      heard(held);
    }
  }

  abandon() {
    this.#stopMaking();

    if (
      this.#file === null &&
      (this.#state === "Making" || this.#state === "Asked")
    ) {
      this.#become("Waiting");
    }
  }

  keep() {
    const file = this.#file;

    if (this.#state === "Failed") {
      this.#owed = true;
      this.#become("Asked");
      this.#make("Asked");

      return;
    }

    if (file !== null) {
      this.#offer(file);

      return;
    }

    this.#owed = true;
    this.#pace = "Asked";
    this.#become("Asked");

    if (this.#making === null) {
      this.#make("Asked");
    }
  }

  drop() {
    this.#dropped = true;
    this.#stopMaking();
    this.#file = null;
    this.#holdHeard.clear();
    this.#waiting = [];
  }

  #stopMaking() {
    const making = this.#making;

    if (making !== null) {
      this.#making = null;
      making.abort();
    }
  }

  #offer(file: File) {
    Effect.runFork(
      offer(file).pipe(
        Effect.flatMap((kept) =>
          Effect.sync(() => {
            this.#offered(kept);
          })
        )
      )
    );
  }

  #offered(kept: Kept) {
    if (this.#dropped) {
      return;
    }

    if (kept === "NotAllowed") {
      this.#owed = true;
      this.#become("Share");
      this.#tell();

      return;
    }

    if (this.#making === null) {
      this.#owed = false;
    }

    this.#become("Ready");
    this.#tell();
  }

  #become(state: ClipState) {
    if (!this.#dropped && state !== this.#state) {
      this.#state = state;
      this.#changed(state);
    }
  }

  #tell() {
    if (!this.#dropped) {
      this.#changed(this.#state);
    }
  }

  readonly #unheld: Effect.Effect<void> = Effect.suspend(() =>
    this.#held
      ? Effect.callback<"Going">((resume) => {
          const go = () => {
            resume(Effect.succeed("Going"));
          };

          this.#waiting.push(go);

          return Effect.sync(() => {
            this.#waiting = this.#waiting.filter((waiter) => waiter !== go);
          });
        }).pipe(Effect.asVoid)
      : Effect.void
  );

  readonly #watch: FilmWatch = {
    heldBy: (heard) => {
      this.#holdHeard.add(heard);
      heard(this.#held);

      return () => {
        this.#holdHeard.delete(heard);
      };
    },
    made: (share) => {
      const made = Math.min(1, Math.max(0, share));

      if (Math.floor(made * 100) !== Math.floor(this.#made * 100)) {
        this.#made = made;
        this.#tell();
      }
    },
  };

  #overrun(): Effect.Effect<never, ClipUnavailable> {
    const worked = { seconds: 0 };

    return Effect.sync(() => {
      worked.seconds += this.#held ? 0 : 1;

      return worked.seconds;
    }).pipe(
      Effect.repeat({
        schedule: Schedule.spaced(Duration.seconds(1)),
        until: (seconds) => seconds >= MAKING_LIMIT_SECONDS,
      }),
      Effect.andThen(
        Effect.fail(
          new ClipUnavailable({
            detail: `still not made after ${MAKING_LIMIT_SECONDS} s of working time, turns not counted`,
            step: "finish the clip",
          })
        )
      )
    );
  }

  #make(pace: ClipPace) {
    const support = this.#support;

    if (support === null || this.#dropped) {
      return;
    }

    this.#pace = pace;
    this.#made = 0;
    this.#makingStyle = this.#style;

    if (pace === "Quiet" && this.#file === null) {
      this.#become("Making");
    }

    const making = new AbortController();

    this.#making = making;

    const order = {
      boxes: this.#art.boxes,
      budgetMs: null,
      frame: "Chat" as const,
      slot: this.#unheld.pipe(
        Effect.andThen(Effect.suspend(() => slotFor(this.#pace)))
      ),
      support,
      svg: this.#art.svg("Chat"),
      watch: this.#watch,
    };

    const replay = replayOrderOf(this.#art.story);
    const short = clipFile(this.#picture, this.#art.look, order);

    const vertical = (scale: number, style: ClipStyle) =>
      replay === null
        ? short
        : replayFile(this.#picture, this.#art.look, {
            ...order,
            ...replay,
            budgetMs: REPLAY_BUDGET_MS,
            calm: this.#art.calm,
            frame: "Story",
            scale,
            style,
            svg: this.#art.svg("Story"),
          });

    const scales = replayScales(deviceMemory()).toReversed();
    let cascade: Effect.Effect<File, ClipUnavailable | ClipTooSlow> = short;

    for (const scale of scales) {
      const fallback = cascade;

      cascade = vertical(scale, "Broadcast").pipe(
        Effect.catchTag("ClipTooSlow", () => fallback)
      );
    }

    if (this.#style === "Drift") {
      for (const scale of scales) {
        const fallback = cascade;

        cascade = vertical(scale, "Drift").pipe(
          Effect.catchTags({
            ClipTooSlow: () => fallback,
            ClipUnavailable: () => fallback,
          })
        );
      }
    }

    Effect.runFork(
      (replay !== null &&
      tellsTheHand(this.#picture.kind, this.#picture.tier) &&
      reachFor(deviceMemory()) === "Replay"
        ? cascade
        : short
      ).pipe(
        Effect.raceFirst(this.#overrun()),
        Effect.matchCause({
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
      if (this.#owed) {
        this.#become("Failed");
      } else if (this.#file === null) {
        this.#become("Unavailable");
      }

      this.#tell();

      return;
    }

    this.#file = file;
    this.#fileStyle = this.#makingStyle;

    if (this.#state === "Asked" && activationLasts()) {
      this.#offer(file);
    } else {
      this.#become(this.#owed ? "Share" : "Ready");
    }

    this.#tell();
  }
}
