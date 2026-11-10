import { Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import { MOMENT_TAG } from "../../features/moments/element.js";
import type { MomentHand } from "../../features/moments/element.js";
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
import { noiseFor, perform } from "./synth.js";
import type { Synth } from "./synth.js";

const STYLE = `
:host { position: absolute; inset: 0 0 var(--moment-floor, 34%) 0; pointer-events: none; z-index: 30; display: block; }
.card { position: absolute; left: 50%; top: 0; width: min(92%, 420px, calc(var(--moment-height, 520px) * 0.78)); transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
.card.small { width: min(64%, 270px, calc(var(--moment-height, 520px) * 0.6)); top: 12%; }
.card svg { display: block; width: 100%; height: auto; overflow: visible; }
.card .part { transform-box: fill-box; transform-origin: center; }
.wrap { transform-origin: 50% 40%; }
.keep { position: absolute; right: 8px; top: 6px; pointer-events: auto; font: 700 var(--text-2, 15px)/1 var(--font-body, sans-serif); color: var(--color-raised-ink, #1f1c31); background: var(--color-raised, #fffdf8); border: 0; border-radius: var(--radius-3, 10px); padding: 8px 12px; box-shadow: var(--shadow-sheet-1); display: flex; gap: 6px; align-items: center; min-height: 36px; }
.keep:active { transform: translate(var(--press-1, 1px 1.8px)); }
.keep b { color: var(--color-accent-ink, #d63a00); }
.gone { display: none; }
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

const seededNoise = () => {
  let state = 7;

  return () => {
    state = (state * 16_807) % 2_147_483_647;

    return state / 2_147_483_647;
  };
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
  readonly #keep: HTMLButtonElement;
  readonly #motion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  #scene: MomentScene | null = null;
  #hand: MomentHand | null = null;
  #handKey = "";
  #shownId = "";
  #sound = false;
  #dealing = false;
  #synth: Synth | null = null;
  readonly #random = seededNoise();
  #holding: Animation | null = null;
  #keeping: Animation | null = null;

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
    this.#keep = document.createElement("button");
    this.#keep.className = "keep gone";
    this.#keep.type = "button";
    this.#keep.addEventListener("click", () => {
      this.#emitKeep();
    });
    this.#root.append(style, this.#card, this.#keep);
  }

  connectedCallback() {
    globalThis.addEventListener("pointerdown", this.#unlock, { passive: true });
  }

  disconnectedCallback() {
    globalThis.removeEventListener("pointerdown", this.#unlock);
    this.#holding?.cancel();
    this.#keeping?.cancel();
  }

  get hand(): MomentHand | null {
    return this.#hand;
  }

  set hand(next: MomentHand | null) {
    this.#hand = next;

    if (next === null || handKey(next) === this.#handKey) {
      return;
    }

    this.#handKey = handKey(next);
    idle(() => {
      this.#consider(next);
    });
  }

  #consider(hand: MomentHand) {
    if (this.#hand !== hand) {
      return;
    }

    const found = shownMomentOf(hand);

    if (Option.isSome(found)) {
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
    }

    this.#dealing = next;
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
    this.#keeping?.cancel();
    this.#fit();
    this.#card.className = small ? "card small" : "card";
    this.#card.innerHTML = `<div class="wrap">${pictureSvg(picture, {
      deck: scene.deck,
      fonts: "",
      frame: "Table",
      theme: scene.theme,
    })}</div>`;
    this.#keep.className = "keep gone";
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
    this.#card.className = "card gone";

    if (this.#shownId !== scene.id) {
      return;
    }

    this.#keep.className = "keep";
    this.#keep.innerHTML = `Keep <b>${scene.picture.title}</b>`;
    this.#keeping = this.#keep.animate(STILL, { duration: KEEP_MS });
    this.#keeping.onfinish = () => {
      this.#keep.className = "keep gone";
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

  #emitKeep() {
    const scene = this.#scene;

    if (scene !== null) {
      this.dispatchEvent(
        new CustomEvent("keep", {
          bubbles: true,
          composed: true,
          detail: scene.picture,
        })
      );
    }
  }
}

export const defineMoment = () => {
  if (customElements.get(MOMENT_TAG) === undefined) {
    customElements.define(MOMENT_TAG, NostakesMoment);
  }
};
