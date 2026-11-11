import { Effect, Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import { MOMENT_TAG, momentElement } from "../../features/moments/element.js";
import type { MomentHand } from "../../features/moments/element.js";
import { NewestHand } from "../../features/moments/newest-hand.js";
import type { MomentPicture } from "../../features/moments/picture.js";
import { pictureSvg } from "../../features/moments/picture.js";
import { shownMomentOf } from "../../features/moments/scene.js";
import { BUZZES, FAMILIES, momentScore } from "../../features/moments/score.js";
import {
  cardPose,
  partPose,
  planFor,
  samplesOf,
  transformOf,
} from "../../features/moments/timeline.js";
import type { Plan, Pose } from "../../features/moments/timeline.js";
import { KEPT_FRAMES } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { Keeper } from "../pictures/keeper.js";
import { measureParts } from "./clip-measure.js";
import type { PartBox } from "./clip-measure.js";
import type { Clipper, ClipState } from "./clipper.js";
import { paintPicture } from "./markup.js";
import { noiseFor, perform, seededNoise } from "./synth.js";
import type { Synth } from "./synth.js";

const STYLE = `
:host { position: absolute; inset: 0 0 var(--moment-floor, 34%) 0; pointer-events: none; z-index: 30; display: block; }
.card { position: absolute; left: 50%; top: 0; width: min(92%, 420px, calc(var(--moment-height, 520px) * 0.78)); transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
.card.small { width: min(64%, 270px, calc(var(--moment-height, 520px) * 0.6)); top: 12%; }
.card svg { display: block; width: 100%; height: auto; overflow: visible; }
.card .part { transform-box: fill-box; transform-origin: center; }
.wrap { transform-origin: 50% 40%; }
.keeping { position: absolute; right: 8px; top: 6px; display: flex; gap: 6px; pointer-events: none; }
.keeping button { pointer-events: auto; font: 700 var(--text-2, 15px)/1 var(--font-body, sans-serif); color: var(--color-raised-ink, #1f1c31); background: var(--color-raised, #fffdf8); border: 0; border-radius: var(--radius-3, 10px); padding: 8px 12px; box-shadow: var(--shadow-sheet-1); display: flex; gap: 6px; align-items: center; min-height: 36px; }
.keeping button:active { transform: translate(var(--press-1, 1px 1.8px)); }
.keeping b { color: var(--color-accent-ink, #d63a00); }
.keeping .story, .keeping .clip { color: var(--color-ink-muted, #716a79); font-weight: 600; padding: 8px 10px; }
.gone, .keeping .gone { display: none; }
`;

const KEEP_MS = 25_000;

const ENTRY_MS = 1400;

const STILL: Keyframe[] = [{ opacity: "1" }, { opacity: "1" }];

const FLOOR_GAP = 6;

const keyframesOf = (length: number, pose: (ms: number) => Pose): Keyframe[] =>
  samplesOf(length).map((ms) => {
    const at = pose(ms);

    return {
      offset: ms / Math.max(1, length),
      opacity: String(at.opacity),
      transform: transformOf(at),
    };
  });

const NOISE_SEED = 7;

const CLIP_LABELS: Readonly<Record<ClipState, string>> = {
  Asked: "Clip…",
  Checking: "Clip",
  Making: "Clip",
  Ready: "Clip",
  Share: "Share clip",
  Unavailable: "Clip",
  Waiting: "Clip",
};

export interface MomentScene {
  readonly deck: Deck;
  readonly id: string;
  readonly picture: MomentPicture;
  readonly theme: Theme;
}

const handKey = (hand: MomentHand) =>
  [
    hand.lastHand.handNumber,
    hand.record.length,
    hand.callouts,
    hand.theme,
    hand.deck,
  ].join(":");

const idle = (work: () => void) => {
  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(work, { timeout: 400 });
  } else {
    requestAnimationFrame(work);
  }
};

class NostakesMoment extends HTMLElement {
  readonly #root: ShadowRoot;
  readonly #card: HTMLDivElement;
  readonly #keeping: HTMLDivElement;
  readonly #keep: HTMLButtonElement;
  readonly #story: HTMLButtonElement;
  readonly #clip: HTMLButtonElement;
  #keeper: Keeper | null = null;
  #clipper: Clipper | null = null;
  #clipLive = false;
  #sceneHand = -1;
  readonly #motion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  #scene: MomentScene | null = null;
  readonly #newest = new NewestHand<MomentHand>(handKey, idle, (hand) => {
    this.#consider(hand);
  });
  #shownId = "";
  #sound = false;
  #dealing = false;
  #synth: Synth | null = null;
  readonly #random = seededNoise(NOISE_SEED);
  #holding: Animation | null = null;
  #offered: Animation | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");

    style.textContent = STYLE;
    this.#card = document.createElement("div");
    this.#card.className = "card gone";
    this.#card.addEventListener("click", () => {
      this.#leave();
    });
    this.#keeping = document.createElement("div");
    this.#keeping.className = "keeping gone";
    this.#keep = this.#keepButton("keep", "Chat");
    this.#story = this.#keepButton("story", "Story");
    this.#story.textContent = "Story";
    this.#story.title = "A tall picture for a story";
    this.#clip = document.createElement("button");
    this.#clip.className = "clip gone";
    this.#clip.type = "button";
    this.#clip.textContent = CLIP_LABELS.Waiting;
    this.#clip.title = "A short clip of the moment with its sound";
    this.#clip.addEventListener("click", () => {
      this.#clipper?.keep();
    });
    this.#keeping.append(this.#keep, this.#story, this.#clip);
    this.#root.append(style, this.#card, this.#keeping);
    adoptEarlyProperties(this, momentElement.properties);
  }

  connectedCallback() {
    globalThis.addEventListener("pointerdown", this.#unlock, { passive: true });
  }

  disconnectedCallback() {
    globalThis.removeEventListener("pointerdown", this.#unlock);
    this.#holding?.cancel();
    this.#offered?.cancel();
    this.#keeper?.drop();
    this.#dropClip();
  }

  #keepButton(name: string, frame: KeptFrame) {
    const button = document.createElement("button");

    button.className = name;
    button.type = "button";
    button.addEventListener("click", () => {
      this.#keepAs(frame);
    });

    return button;
  }

  #keepAs(frame: KeptFrame) {
    const keeper = this.#keeper;

    if (keeper !== null) {
      this.dataset.keeping = frame;
      keeper.keep(frame);
    }
  }

  get hand(): MomentHand | null {
    return this.#newest.hand;
  }

  set hand(next: MomentHand | null) {
    if (next === null || next.lastHand.handNumber !== this.#sceneHand) {
      this.#clipLive = false;
      this.#clipper?.abandon();
    }

    this.#newest.set(next);
  }

  #consider(hand: MomentHand) {
    const found = shownMomentOf(hand);

    if (Option.isSome(found)) {
      this.#sceneHand = hand.lastHand.handNumber;
      this.present({
        deck: hand.deck,
        id: found.value.id,
        picture: found.value.picture,
        theme: hand.theme,
      });
    }
  }

  present(scene: MomentScene) {
    if (scene.id === this.#shownId) {
      return;
    }

    this.#scene = scene;
    this.#shownId = scene.id;
    this.dataset.moment = scene.id;
    this.#keeper?.drop();
    delete this.dataset.drawn;
    this.#keeper = new Keeper(
      {
        svg: (frame, fonts) =>
          pictureSvg(scene.picture, {
            deck: scene.deck,
            fonts,
            frame,
            theme: scene.theme,
          }),
        title: scene.picture.title,
      },
      (frames) => {
        this.dataset.drawn = frames.join(" ");
      }
    );
    this.#keeper.prepare(KEPT_FRAMES);
    this.#dropClip();
    this.#clipLive = true;
    this.#show(scene);
  }

  get sound(): boolean {
    return this.#sound;
  }

  set sound(next: boolean) {
    this.#sound = next;
  }

  get dealing(): boolean {
    return this.#dealing;
  }

  set dealing(next: boolean) {
    if (next && !this.#dealing) {
      this.#leave();
      this.#clipper?.abandon();
    }

    if (!next && this.#dealing && this.#clipLive) {
      this.#clipper?.prepare();
    }

    this.#dealing = next;
  }

  #dropClip() {
    this.#clipper?.drop();
    this.#clipper = null;
    this.#clip.className = "clip gone";
    delete this.dataset.clip;
  }

  #offerClip(scene: MomentScene, boxes: readonly PartBox[]) {
    idle(() => {
      Effect.runFork(
        Effect.promise(() => import("./clipper.js")).pipe(
          Effect.flatMap(({ Clipper: Made }) =>
            Effect.sync(() => {
              this.#adoptClipper(
                scene,
                () =>
                  new Made(
                    scene.picture,
                    {
                      boxes,
                      svg: pictureSvg(scene.picture, {
                        deck: scene.deck,
                        fonts: "",
                        frame: "Chat",
                        theme: scene.theme,
                      }),
                    },
                    (state) => {
                      this.#showClip(state);
                    }
                  )
              );
            })
          )
        )
      );
    });
  }

  #adoptClipper(scene: MomentScene, made: () => Clipper) {
    if (this.#shownId !== scene.id || this.#clipper !== null) {
      return;
    }

    const clipper = made();

    this.#clipper = clipper;
    clipper.start(this.#clipLive && !this.#dealing);
  }

  #showClip(state: ClipState) {
    this.dataset.clip = state;
    this.#clip.className =
      state === "Unavailable" || state === "Checking" ? "clip gone" : "clip";
    this.#clip.textContent = CLIP_LABELS[state];
    this.#clip.disabled = state === "Asked";
    this.#clip.setAttribute("aria-busy", String(state === "Asked"));
  }

  readonly #unlock = () => {
    if (!this.#sound || !("AudioContext" in globalThis)) {
      return;
    }

    if (this.#synth === null) {
      const ctx = new AudioContext();
      const out = ctx.createGain();

      out.gain.value = 0.9;
      out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
      this.#synth = { ctx, noise: noiseFor(ctx, this.#random), out };
    }

    const { ctx } = this.#synth;

    if (ctx instanceof AudioContext && ctx.state !== "running") {
      void ctx.resume();
    }
  };

  #play(picture: MomentPicture) {
    if (!this.#sound) {
      return;
    }

    if ("vibrate" in globalThis.navigator) {
      globalThis.navigator.vibrate([...BUZZES[FAMILIES[picture.kind]]]);
    }

    const synth = this.#synth;

    if (
      synth !== null &&
      synth.ctx instanceof AudioContext &&
      synth.ctx.state === "running"
    ) {
      perform(
        synth,
        momentScore(picture.kind, picture.tier),
        synth.ctx.currentTime + 0.02,
        this.#random
      );
    }
  }

  #fit() {
    const stage = this.parentElement;

    const strip = stage
      ?.querySelector("nostakes-table")
      ?.shadowRoot?.querySelector(".strip");

    if (stage === null || strip === null || strip === undefined) {
      return;
    }

    const room = stage.getBoundingClientRect();
    const board = strip.getBoundingClientRect();

    this.style.setProperty(
      "--moment-floor",
      `${Math.max(0, room.bottom - board.top + FLOOR_GAP)}px`
    );
    this.style.setProperty(
      "--moment-height",
      `${Math.max(0, board.top - room.top - FLOOR_GAP)}px`
    );
  }

  #show(scene: MomentScene) {
    const { picture } = scene;
    const family = FAMILIES[picture.kind];
    const plan = planFor(family, picture.tier);
    const small = picture.tier === 1 && family !== "Groan";
    const length = plan.hold + plan.leave;
    const still = this.#motion.matches;

    this.#holding?.cancel();
    this.#offered?.cancel();
    this.#fit();
    this.#card.className = small ? "card small" : "card";
    paintPicture(this.#card, picture, {
      deck: scene.deck,
      fonts: "",
      frame: "Table",
      theme: scene.theme,
    });
    this.#keeping.className = "keeping gone";
    this.#play(picture);

    const holding =
      this.#card
        .querySelector(".wrap")
        ?.animate(
          still
            ? STILL
            : keyframesOf(length, (ms) => cardPose(family, ms, plan)),
          { duration: still ? plan.hold : length, fill: "forwards" }
        ) ?? null;

    if (!still) {
      this.#animateParts(scene, plan);
    }

    if (holding !== null) {
      holding.onfinish = () => {
        this.#settle(scene);
      };
    }

    this.#holding = holding;
  }

  #animateParts(scene: MomentScene, plan: Plan) {
    const { kind, tier } = scene.picture;
    const family = FAMILIES[kind];
    const entry = Math.min(plan.hold, ENTRY_MS);

    for (const part of this.#card.querySelectorAll<SVGGElement>(
      "[data-part]"
    )) {
      const role = part.dataset.part ?? "";
      const index = Number(part.dataset.index ?? "0");

      part.animate(
        keyframesOf(entry, (ms) => partPose(role, index, ms, family, tier)),
        { duration: entry, fill: "both" }
      );
    }
  }

  #settle(scene: MomentScene) {
    const drawn = this.#card.querySelector("svg");

    const boxes =
      drawn === null || this.#shownId !== scene.id ? [] : measureParts(drawn);

    this.#card.className = "card gone";

    if (this.#shownId !== scene.id) {
      return;
    }

    if (boxes.length > 0 && this.#clipper === null) {
      this.#offerClip(scene, boxes);
    }

    this.#keeping.className = "keeping";
    const title = document.createElement("b");

    title.textContent = scene.picture.title;
    this.#keep.replaceChildren("Keep ", title);
    this.#offered = this.#keeping.animate(STILL, { duration: KEEP_MS });
    this.#offered.onfinish = () => {
      this.#keeping.className = "keeping gone";
      this.#clipLive = false;
      this.#clipper?.abandon();
    };
  }

  #leave() {
    const scene = this.#scene;

    if (scene === null || this.#card.classList.contains("gone")) {
      return;
    }

    this.#holding?.cancel();
    this.#settle(scene);
  }
}

export const defineMoment = () => {
  if (customElements.get(MOMENT_TAG) === undefined) {
    customElements.define(MOMENT_TAG, NostakesMoment);
  }
};
