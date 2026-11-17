import { Clock, Duration, Effect, Option, Schedule, Schema } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import {
  AUTO_CLIP_TIER,
  AUTO_CLIPS_PER_NIGHT,
  CLIP_BUDGET_MS,
  clipScales,
} from "../../features/moments/clip-reach.js";
import { MomentHandSchema } from "../../features/moments/element.js";
import type { MomentHand } from "../../features/moments/element.js";
import { sceneOf } from "../../features/moments/scene.js";
import type { MomentScene } from "../../features/moments/scene.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { ClipUnavailable } from "../moments/clip-layers.js";
import { clipSupport, momentClip, slotFor } from "../moments/clip.js";
import type { ClipPace, ClipSupport, ClipTooSlow } from "../moments/clip.js";
import type { FilmWatch } from "../moments/film-file.js";
import { drawn } from "../pictures/keeper.js";
import { KEPT_FOR_MS, liveMomentStore, MomentStore } from "./store.js";
import type { FileKind, KeptFile, KeptMoment } from "./store.js";

export type ClipStatus =
  | { readonly tag: "Failed" }
  | { readonly tag: "Idle" }
  | { readonly made: number; readonly tag: "Making" }
  | { readonly tag: "Queued" }
  | { readonly file: File; readonly tag: "Ready" }
  | { readonly tag: "Unavailable" };

export type PictureKind = "Chat" | "Slip" | "Story";

export interface NightMoment {
  readonly asked: boolean;
  readonly auto: boolean;
  readonly clip: ClipStatus;
  readonly hand: number;
  readonly pictures: Readonly<Partial<Record<PictureKind, File>>>;
  readonly scene: MomentScene;
  readonly source: MomentHand;
}

export interface NightLook {
  readonly calm: boolean;
  readonly deck: Deck;
  readonly theme: Theme;
}

const SourceSchema = Schema.fromJsonString(
  Schema.toCodecJson(MomentHandSchema)
);

const encodeSource = Schema.encodeSync(SourceSchema);

const decodeSource = Schema.decodeUnknownOption(SourceSchema);

const ReportedMemorySchema = Schema.Struct({ deviceMemory: Schema.Finite });

const deviceMemory = () =>
  Schema.decodeUnknownOption(ReportedMemorySchema)(globalThis.navigator).pipe(
    Option.map((reported) => reported.deviceMemory)
  );

const MAKING_LIMIT_SECONDS = 120;

const kept = <A, E>(effect: Effect.Effect<A, E, MomentStore>) =>
  effect.pipe(Effect.provide(liveMomentStore));

const stamped = <A, E>(
  use: (store: MomentStore["Service"], at: number) => Effect.Effect<A, E>
) =>
  MomentStore.use((store) =>
    Clock.currentTimeMillis.pipe(Effect.flatMap((at) => use(store, at)))
  );

const NOTHING_KEPT = {
  files: [] satisfies readonly KeptFile[],
  moments: [] satisfies readonly KeptMoment[],
};

const PICTURE_KINDS: readonly PictureKind[] = ["Chat", "Slip", "Story"];

const KIND_OF_PICTURE: Readonly<Record<PictureKind, FileKind>> = {
  Chat: "Chat",
  Slip: "Slip",
  Story: "Story",
};

export class Night {
  readonly room: string;
  #moments: NightMoment[] = [];
  readonly #heard = new Set<() => void>();
  #look: NightLook = { calm: false, deck: "TwoColour", theme: "Light" };
  #support: Option.Option<ClipSupport> | null = null;
  #loaded = false;
  #making: { readonly hand: number; readonly stop: AbortController } | null =
    null;
  #held = false;
  #waiting: (() => void)[] = [];
  readonly #holdHeard = new Set<(held: boolean) => void>();
  #pending: MomentHand[] = [];
  readonly #drawing = new Set<string>();

  constructor(room: string) {
    this.room = room;
    Effect.runFork(this.#load());
  }

  get moments(): readonly NightMoment[] {
    return this.#moments;
  }

  get ready(): number {
    return this.#moments.filter((moment) => moment.clip.tag === "Ready").length;
  }

  get making(): number {
    return this.#moments.filter(
      (moment) => moment.clip.tag === "Making" || moment.clip.tag === "Queued"
    ).length;
  }

  listen(heard: () => void): () => void {
    this.#heard.add(heard);
    heard();

    return () => {
      this.#heard.delete(heard);
    };
  }

  look(look: NightLook) {
    this.#look = look;
  }

  saw(hand: MomentHand) {
    if (!this.#loaded) {
      this.#pending.push(hand);

      return;
    }

    if (
      this.#moments.some((moment) => moment.hand === hand.lastHand.handNumber)
    ) {
      return;
    }

    const found = sceneOf(hand);

    if (Option.isNone(found)) {
      return;
    }

    const scene = found.value;
    const autos = this.#moments.filter((moment) => moment.auto).length;

    const auto =
      scene.picture.tier >= AUTO_CLIP_TIER && autos < AUTO_CLIPS_PER_NIGHT;

    this.#moments = [
      {
        asked: false,
        auto,
        clip: { tag: auto ? "Queued" : "Idle" },
        hand: hand.lastHand.handNumber,
        pictures: {},
        scene,
        source: hand,
      },
      ...this.#moments,
    ];

    this.#remember(hand, false);
    this.#tell();
    this.#next();
  }

  ask(hand: number) {
    const found = this.#moments.find((moment) => moment.hand === hand);

    if (
      found === undefined ||
      found.clip.tag === "Ready" ||
      found.clip.tag === "Making"
    ) {
      return;
    }

    this.#update(hand, (moment) => ({
      ...moment,
      asked: true,
      clip: {
        tag:
          this.#support !== null && Option.isNone(this.#support)
            ? "Unavailable"
            : "Queued",
      },
    }));

    this.#remember(found.source, true);
    this.#next();
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

  drawPictures(
    hand: number,
    kinds: readonly PictureKind[],
    svg: (kind: PictureKind, fonts: string) => string
  ) {
    const found = this.#moments.find((moment) => moment.hand === hand);

    if (found === undefined) {
      return;
    }

    const missing = kinds.filter(
      (kind) =>
        found.pictures[kind] === undefined &&
        !this.#drawing.has(`${hand}:${kind}`)
    );

    for (const kind of missing) {
      this.#drawing.add(`${hand}:${kind}`);
    }

    Effect.runFork(
      Effect.forEach(
        missing,
        (kind) =>
          drawn(
            {
              svg: (_frame: KeptFrame, fonts: string) => svg(kind, fonts),
              title: `${found.scene.picture.title}${kind === "Slip" ? " slip" : ""}`,
            },
            kind === "Story" ? "Story" : "Chat"
          ).pipe(
            Effect.flatMap((file) =>
              Effect.sync(() => {
                this.#update(hand, (moment) => ({
                  ...moment,
                  pictures: { ...moment.pictures, [kind]: file },
                }));

                return file;
              })
            ),
            Effect.flatMap((file) =>
              kept(
                stamped((store, at) =>
                  store.keepFile({
                    at,
                    blob: file,
                    hand,
                    kind: KIND_OF_PICTURE[kind],
                    name: file.name,
                    room: this.room,
                  })
                )
              )
            ),
            Effect.ignore
          ),
        { discard: true }
      )
    );
  }

  #remember(hand: MomentHand, asked: boolean) {
    Effect.runFork(
      kept(
        stamped((store, at) =>
          store.keep({
            asked,
            at,
            hand: hand.lastHand.handNumber,
            room: this.room,
            source: encodeSource(hand),
          })
        )
      ).pipe(Effect.ignore)
    );
  }

  #load() {
    const { room } = this;

    return kept(
      Effect.gen(function* read() {
        const store = yield* MomentStore;

        yield* store.forget((yield* Clock.currentTimeMillis) - KEPT_FOR_MS);

        return {
          files: yield* store.files(room),
          moments: yield* store.moments(room),
        };
      })
    ).pipe(
      Effect.orElseSucceed(() => NOTHING_KEPT),
      Effect.flatMap((found) =>
        Effect.sync(() => {
          this.#restored(found.moments, found.files);
        })
      )
    );
  }

  #restored(rows: readonly KeptMoment[], files: readonly KeptFile[]) {
    const autosLeft = { count: AUTO_CLIPS_PER_NIGHT };

    const restored = rows
      .toSorted((left, right) => left.hand - right.hand)
      .flatMap((row) =>
        decodeSource(row.source).pipe(
          Option.flatMap((source) =>
            sceneOf(source).pipe(
              Option.map((scene) => ({ row, scene, source }))
            )
          ),
          Option.toArray
        )
      )
      .map(({ row, scene, source }): NightMoment => {
        const own = files.filter((file) => file.hand === row.hand);
        const clip = own.find((file) => file.kind === "Clip");

        const auto =
          scene.picture.tier >= AUTO_CLIP_TIER && autosLeft.count > 0;

        if (auto) {
          autosLeft.count -= 1;
        }

        const pictures: Partial<Record<PictureKind, File>> = {};

        for (const kind of PICTURE_KINDS) {
          const file = own.find((each) => each.kind === kind);

          if (file !== undefined) {
            pictures[kind] = asFile(file);
          }
        }

        return {
          asked: row.asked,
          auto,
          clip:
            clip === undefined
              ? { tag: row.asked || auto ? "Queued" : "Idle" }
              : { file: asFile(clip), tag: "Ready" },
          hand: row.hand,
          pictures,
          scene,
          source,
        };
      });

    this.#moments = restored.toReversed();
    this.#loaded = true;

    const pending = this.#pending;

    this.#pending = [];
    this.#tell();

    for (const hand of pending) {
      this.saw(hand);
    }

    this.#next();
  }

  #update(hand: number, change: (moment: NightMoment) => NightMoment) {
    this.#moments = this.#moments.map((moment) =>
      moment.hand === hand ? change(moment) : moment
    );
    this.#tell();
  }

  #tell() {
    for (const heard of this.#heard) {
      heard();
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

  #watchFor(hand: number): FilmWatch {
    return {
      heldBy: (heard) => {
        this.#holdHeard.add(heard);
        heard(this.#held);

        return () => {
          this.#holdHeard.delete(heard);
        };
      },
      made: (share) => {
        const made = Math.min(1, Math.max(0, share));
        const found = this.#moments.find((moment) => moment.hand === hand);

        if (
          found !== undefined &&
          (found.clip.tag !== "Making" ||
            Math.floor(made * 100) !== Math.floor(found.clip.made * 100))
        ) {
          this.#update(hand, (moment) => ({
            ...moment,
            clip: { made, tag: "Making" },
          }));
        }
      },
    };
  }

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

  #next() {
    if (!this.#loaded || this.#making !== null) {
      return;
    }

    if (this.#support === null) {
      this.#support = Option.none();
      Effect.runFork(
        clipSupport("Story").pipe(
          Effect.flatMap((found) =>
            Effect.sync(() => {
              this.#support =
                clipScales(deviceMemory()).length === 0 ? Option.none() : found;
              this.#supported();
            })
          )
        )
      );

      return;
    }

    if (Option.isNone(this.#support)) {
      return;
    }

    const queued = this.#moments.filter(
      (moment) => moment.clip.tag === "Queued"
    );

    const chosen = queued.find((moment) => moment.asked) ?? queued.at(-1);

    if (chosen !== undefined) {
      this.#make(chosen, this.#support.value);
    }
  }

  #supported() {
    if (this.#support !== null && Option.isNone(this.#support)) {
      this.#moments = this.#moments.map((moment) =>
        moment.clip.tag === "Queued" || moment.clip.tag === "Idle"
          ? { ...moment, clip: { tag: "Unavailable" } }
          : moment
      );
      this.#tell();

      return;
    }

    this.#next();
  }

  get clipsAvailable(): boolean {
    return this.#support === null || Option.isSome(this.#support);
  }

  #make(moment: NightMoment, support: ClipSupport) {
    const stop = new AbortController();
    const pace: ClipPace = moment.asked ? "Asked" : "Quiet";
    const { hand } = moment;

    this.#making = { hand, stop };
    this.#update(hand, (each) => ({
      ...each,
      clip: { made: 0, tag: "Making" },
    }));

    const order = (scale: number) => ({
      budgetMs: CLIP_BUDGET_MS,
      frame: "Story" as const,
      scale,
      slot: this.#unheld.pipe(
        Effect.andThen(Effect.suspend(() => slotFor(pace)))
      ),
      support,
      watch: this.#watchFor(hand),
    });

    const scales = clipScales(deviceMemory());
    const [firstScale = 1, ...lighter] = scales;

    let cascade: Effect.Effect<File, ClipUnavailable | ClipTooSlow> =
      momentClip(moment.scene, this.#look, order(firstScale));

    for (const scale of lighter) {
      const before = cascade;

      cascade = before.pipe(
        Effect.catchTag("ClipTooSlow", () =>
          momentClip(moment.scene, this.#look, order(scale))
        )
      );
    }

    Effect.runFork(
      cascade.pipe(
        Effect.raceFirst(this.#overrun()),
        Effect.matchCause({
          onFailure: () => {
            this.#finished(hand, stop, null);
          },
          onSuccess: (file) => {
            this.#finished(hand, stop, file);
          },
        })
      ),
      { signal: stop.signal }
    );
  }

  #finished(hand: number, stop: AbortController, file: File | null) {
    if (this.#making?.stop !== stop) {
      return;
    }

    if (file === null) {
      this.#made(hand, null);

      return;
    }

    Effect.runFork(
      kept(
        stamped((store, at) =>
          store.keepFile({
            at,
            blob: file,
            hand,
            kind: "Clip",
            name: file.name,
            room: this.room,
          })
        )
      ).pipe(
        Effect.ignore,
        Effect.andThen(
          Effect.sync(() => {
            this.#made(hand, file);
          })
        )
      )
    );
  }

  #made(hand: number, file: File | null) {
    this.#making = null;
    this.#update(hand, (moment) => ({
      ...moment,
      clip: file === null ? { tag: "Failed" } : { file, tag: "Ready" },
    }));
    this.#next();
  }

  retry(hand: number) {
    const found = this.#moments.find((moment) => moment.hand === hand);

    if (found?.clip.tag === "Failed") {
      this.#update(hand, (moment) => ({
        ...moment,
        asked: true,
        clip: { tag: "Queued" },
      }));
      this.#next();
    }
  }
}

const asFile = (stored: KeptFile) => {
  if (stored.blob instanceof File) {
    return stored.blob;
  }

  const type =
    stored.kind === "Clip" || stored.kind === "Reel"
      ? "video/mp4"
      : "image/png";

  return new File([stored.blob], stored.name, { type });
};

const nights = new Map<string, Night>();

export const nightOf = (room: string): Night => {
  const known = nights.get(room);

  if (known !== undefined) {
    return known;
  }

  const night = new Night(room);

  nights.set(room, night);

  return night;
};
