import { Option } from "effect";

import type { Deck, Theme } from "../../features/model.js";
import { MOMENT_TAG, momentElement } from "../../features/moments/element.js";
import type {
  MomentHand,
  TonightCount,
} from "../../features/moments/element.js";
import { NewestHand } from "../../features/moments/newest-hand.js";
import type { MomentPicture } from "../../features/moments/picture.js";
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
import { adoptEarlyProperties } from "../early-properties.js";
import { nightOf } from "../tonight/night.js";
import type { Night } from "../tonight/night.js";
import { paintClipIt, paintPicture } from "./markup.js";
import { noiseFor, perform, seededNoise } from "./synth.js";
import type { Synth } from "./synth.js";

const STYLE = `
:host { position: absolute; inset: 0 0 var(--moment-floor, 34%) 0; pointer-events: none; z-index: 30; display: block; }
.card { position: absolute; left: 50%; top: 0; width: min(92%, 420px, calc(var(--moment-height, 520px) * 0.78)); transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
.card.small { width: min(64%, 270px, calc(var(--moment-height, 520px) * 0.6)); top: 12%; }
.card svg { display: block; width: 100%; height: auto; overflow: visible; }
.card .part { transform-box: fill-box; transform-origin: center; }
.wrap { transform-origin: 50% 40%; }
.clip-it { position: absolute; left: 50%; top: var(--clip-top, auto); bottom: var(--clip-bottom, 8px); transform: translateX(-50%); pointer-events: auto; font: 700 var(--text-2, 15px)/1 var(--font-body, sans-serif); color: var(--color-raised-ink, #1f1c31); background: var(--color-raised, #fffdf8); border: 0; border-radius: var(--radius-3, 10px); padding: 10px 14px; min-height: 44px; box-shadow: var(--shadow-sheet-1); display: flex; gap: 8px; align-items: center; }
.clip-it:active { transform: translate(-50%, 0) translate(var(--press-1, 1px 1.8px)); }
.clip-it svg { width: 16px; height: 16px; }
.clip-it[aria-pressed="true"] { color: var(--color-ink-muted, #716a79); }
.gone { display: none; }
`;

const CLIP_IT_MS = 9000;

const CLIP_IT_HEIGHT = 44;

const ENTRY_MS = 1400;

const STILL: Keyframe[] = [{ opacity: "1" }, { opacity: "1" }];

const FLOOR_GAP = 6;

const NOISE_SEED = 7;

const keyframesOf = (length: number, pose: (ms: number) => Pose): Keyframe[] =>
  samplesOf(length).map((ms) => {
    const at = pose(ms);

    return {
      offset: ms / Math.max(1, length),
      opacity: String(at.opacity),
      transform: transformOf(at),
    };
  });

interface ShownScene {
  readonly deck: Deck;
  readonly hand: number;
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
  readonly #clipIt: HTMLButtonElement;
  readonly #motion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  #scene: ShownScene | null = null;
  readonly #newest = new NewestHand<MomentHand>(handKey, idle, (hand) => {
    this.#consider(hand);
  });
  #shownId = "";
  #sound = false;
  #dealing = false;
  #room = "";
  #night: Night | null = null;
  #unlisten: (() => void) | null = null;
  #synth: Synth | null = null;
  readonly #random = seededNoise(NOISE_SEED);
  #holding: Animation | null = null;
  #offering: Animation | null = null;
  #told = "";

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
    this.#clipIt = document.createElement("button");
    this.#clipIt.type = "button";
    this.#clipIt.className = "clip-it gone";
    this.#clipIt.addEventListener("click", () => {
      this.#askClip();
    });
    this.#root.append(style, this.#card, this.#clipIt);
    adoptEarlyProperties(this, momentElement.properties);
  }

  connectedCallback() {
    globalThis.addEventListener("pointerdown", this.#unlock, { passive: true });
    this.#attach();
  }

  disconnectedCallback() {
    globalThis.removeEventListener("pointerdown", this.#unlock);
    this.#holding?.cancel();
    this.#offering?.cancel();
    this.#unlisten?.();
    this.#unlisten = null;
  }

  get room(): string {
    return this.#room;
  }

  set room(next: string) {
    if (next === this.#room) {
      return;
    }

    this.#room = next;
    this.#unlisten?.();
    this.#unlisten = null;
    this.#night = null;
    this.#attach();
  }

  #attach() {
    if (
      this.#room.length === 0 ||
      !this.isConnected ||
      this.#unlisten !== null
    ) {
      return;
    }

    const night = nightOf(this.#room);

    this.#night = night;
    night.hold(this.#dealing);
    this.#unlisten = night.listen(() => {
      this.#tellCount(night);
      this.#renderClipIt();
    });

    const { hand } = this.#newest;

    if (hand !== null) {
      night.saw(hand);
    }
  }

  #tellCount(night: Night) {
    const count: TonightCount = { making: night.making, ready: night.ready };
    const told = `${count.ready}:${count.making}`;

    if (told !== this.#told) {
      this.#told = told;
      this.dispatchEvent(new CustomEvent("tonight", { detail: count }));
    }
  }

  get hand(): MomentHand | null {
    return this.#newest.hand;
  }

  set hand(next: MomentHand | null) {
    this.#newest.set(next);
  }

  #consider(hand: MomentHand) {
    this.#night?.look({
      calm: this.#motion.matches,
      deck: hand.deck,
      theme: hand.theme,
    });
    this.#night?.saw(hand);

    const found = shownMomentOf(hand);

    if (Option.isSome(found)) {
      this.#present({
        deck: hand.deck,
        hand: hand.lastHand.handNumber,
        id: found.value.id,
        picture: found.value.picture,
        theme: hand.theme,
      });
    }
  }

  #present(scene: ShownScene) {
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
      this.#closeClipIt();
    }

    this.#night?.hold(next);
    this.#dealing = next;
  }

  #askClip() {
    const scene = this.#scene;

    if (scene === null || this.#night === null) {
      return;
    }

    this.#night.ask(scene.hand);
    this.dataset.asked = String(scene.hand);
    this.#renderClipIt();
  }

  #renderClipIt() {
    const scene = this.#scene;
    const night = this.#night;

    if (
      scene === null ||
      night === null ||
      this.#clipIt.classList.contains("gone")
    ) {
      return;
    }

    const moment = night.moments.find((each) => each.hand === scene.hand);
    const clip = moment?.clip.tag ?? "Idle";

    const taken =
      moment?.asked === true || moment?.auto === true || clip !== "Idle";

    if (clip === "Unavailable") {
      this.#closeClipIt();

      return;
    }

    this.#clipIt.setAttribute("aria-pressed", String(taken));
    paintClipIt(this.#clipIt, taken);
  }

  #offerClipIt() {
    this.#offering?.cancel();

    if (this.#dealing || this.#night?.clipsAvailable === false) {
      return;
    }

    this.#clipIt.className = "clip-it";
    this.#renderClipIt();
    this.#placeClipIt();
    this.#offering = this.#clipIt.animate(STILL, { duration: CLIP_IT_MS });
    this.#offering.onfinish = () => {
      this.#closeClipIt();
    };
  }

  #placeClipIt() {
    requestAnimationFrame(() => {
      const card = this.#card.getBoundingClientRect();
      const host = this.getBoundingClientRect();
      const room = host.height - CLIP_IT_HEIGHT - FLOOR_GAP;
      const below = card.bottom - host.top + FLOOR_GAP;

      if (card.height > 0 && below <= room) {
        this.#clipIt.style.setProperty("--clip-top", `${below}px`);
        this.#clipIt.style.setProperty("--clip-bottom", "auto");
      } else {
        this.#clipIt.style.removeProperty("--clip-top");
        this.#clipIt.style.removeProperty("--clip-bottom");
      }
    });
  }

  #closeClipIt() {
    this.#offering?.cancel();
    this.#offering = null;
    this.#clipIt.className = "clip-it gone";
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

  #show(scene: ShownScene) {
    const { picture } = scene;
    const family = FAMILIES[picture.kind];
    const plan = planFor(family, picture.tier);
    const small = picture.tier === 1 && family !== "Groan";
    const length = plan.hold + plan.leave;
    const still = this.#motion.matches;

    this.#holding?.cancel();
    this.#fit();
    this.#card.className = small ? "card small" : "card";
    paintPicture(this.#card, picture, {
      deck: scene.deck,
      fonts: "",
      frame: "Table",
      theme: scene.theme,
    });
    this.#play(picture);
    this.#offerClipIt();

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
      this.#animateParts(picture, plan);
    }

    if (holding !== null) {
      holding.onfinish = () => {
        this.#settle(scene);
      };
    }

    this.#holding = holding;
  }

  #animateParts(picture: MomentPicture, plan: Plan) {
    const family = FAMILIES[picture.kind];
    const entry = Math.min(plan.hold, ENTRY_MS);

    for (const part of this.#card.querySelectorAll<SVGGElement>(
      "[data-part]"
    )) {
      const role = part.dataset.part ?? "";
      const index = Number(part.dataset.index ?? "0");

      part.animate(
        keyframesOf(entry, (ms) =>
          partPose(role, index, ms, family, picture.tier)
        ),
        { duration: entry, fill: "both" }
      );
    }
  }

  #settle(scene: ShownScene) {
    this.#card.className = "card gone";

    if (this.#shownId !== scene.id) {
      this.#closeClipIt();
    }
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
