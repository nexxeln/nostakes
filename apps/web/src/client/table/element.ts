import { avatarFor, render } from "@nostakes/avatar";
import type { Expression } from "@nostakes/avatar";
import { REACTIONS } from "@nostakes/room";
import type { Reaction } from "@nostakes/room";
import { Option, Schema } from "effect";

import { PEEK_REFRESH_MS } from "../../features/signals.js";
import { raiseDetents, raiseLadder } from "../../features/table/sizing.js";
import type { Detent, RaiseSpot } from "../../features/table/sizing.js";
import {
  HappeningSchema,
  TABLE_TAG,
  TableIntents,
  TableSnapshotSchema,
} from "../../features/table/snapshot.js";
import type {
  Happening,
  HeroLegal,
  Hint,
  SeatSnapshot,
  TableEvent,
  TableIntent,
  TableSnapshot,
} from "../../features/table/snapshot.js";
import { Counter, formatChips } from "./counter.js";
import { cardEl, el, svgEl, toggle } from "./dom.js";
import { clamp, computeGeo, runLanes } from "./layout.js";
import type { Geo, Pt } from "./layout.js";
import { TableSound } from "./sound.js";
import { Spring } from "./spring.js";
import { tableCss } from "./styles.js";

const FOLD_DISTANCE = 120;

const LINE = 46;

const ACT_MS = 1900;

const MAX_BURST = 24;

const UNLOCK_AFTER_MS = 2500;

const DETENT_GAP = 0.07;

const DETENT_SNAP = 0.045;

type Tone = "" | "hot" | "quiet" | "win";

interface Status {
  readonly host: HTMLElement;
  readonly act: HTMLElement;
  until: number;
}

interface Tile {
  readonly seat: number;
  readonly index: number;
  readonly root: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly pic: HTMLDivElement;
  readonly ringSvg: SVGSVGElement;
  readonly ring: SVGRectElement;
  readonly name: HTMLDivElement;
  readonly note: HTMLDivElement;
  readonly shown: HTMLDivElement;
  readonly status: Status;
  readonly stack: Counter;
  readonly x: Spring;
  readonly y: Spring;
  readonly scale: Spring;
  readonly opacity: Spring;
  lastTransform: string;
  joyUntil: number;
  surpriseUntil: number;
}

interface Pile {
  readonly root: HTMLDivElement;
  readonly amount: HTMLDivElement;
  shown: number;
}

interface HandGesture {
  readonly id: number;
  readonly origin: EventTarget | null;
  readonly x0: number;
  readonly y0: number;
  readonly t0: number;
  dx: number;
  dy: number;
  mode: "press" | "drag";
  lastY: number;
  lastT: number;
  vy: number;
}

interface ChipGesture {
  readonly id: number;
  readonly y0: number;
  dy: number;
  mode: "press" | "size";
  value: number;
  detent: string | null;
}

interface KeySizing {
  typed: string;
  value: number;
  detent: string | null;
}

interface PlacedDetent extends Detent {
  readonly t: number;
}

interface Flight {
  readonly done: (finish: () => void, cancel?: () => void) => void;
}

const flightOf = (animation: Animation, cleanup: () => void): Flight => {
  animation.addEventListener("finish", cleanup, { once: true });
  animation.addEventListener("cancel", cleanup, { once: true });

  return {
    done: (finish, cancel) => {
      animation.addEventListener("finish", finish, { once: true });

      if (cancel !== undefined) {
        animation.addEventListener("cancel", cancel, { once: true });
      }
    },
  };
};

const countdown = (count: number, first: () => void, last: () => void) => {
  let left = count;

  return () => {
    if (left === count) {
      first();
    }

    left -= 1;

    if (left === 0) {
      last();
    }
  };
};

const lastEventId = (events: readonly TableEvent[]) => events.at(-1)?.id ?? -1;

const legalKey = (snapshot: TableSnapshot) =>
  JSON.stringify([snapshot.legal, snapshot.toAct, snapshot.handId]);

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const jitter = (index: number, spread: number) =>
  (((index * 7919) % 13) / 12 - 0.5) * spread;

const placeDetents = (detents: readonly Detent[], min: number, max: number) => {
  const placed: PlacedDetent[] = [];

  for (const detent of detents) {
    const t =
      max === min ? 1 : Math.log(detent.value / min) / Math.log(max / min);

    const previous = placed.at(-1);

    if (previous !== undefined && t - previous.t < DETENT_GAP) {
      if (detent.label === "All in") {
        placed[placed.length - 1] = { ...detent, t };
      }
    } else {
      placed.push({ ...detent, t });
    }
  }

  return placed;
};

const positionOf = (value: number, min: number, max: number) =>
  max === min ? 1 : clamp(Math.log(value / min) / Math.log(max / min), 0, 1);

const nearestOnLadder = (
  ladder: readonly number[],
  t: number,
  min: number,
  max: number
) => {
  let best = ladder[0] ?? min;
  let bestGap = Infinity;

  for (const amount of ladder) {
    const gap = Math.abs(positionOf(amount, min, max) - t);

    if (gap < bestGap) {
      best = amount;
      bestGap = gap;
    }
  }

  return best;
};

const isTyping = (event: KeyboardEvent) => {
  const [target] = event.composedPath();

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
};

const rubber = (value: number) =>
  Math.sign(value) * 22 * Math.log1p(Math.abs(value) / 22);

const ringRadius = (frame: Element, size: number) => {
  const radius = getComputedStyle(frame).borderTopLeftRadius;
  const amount = Number(radius.replace(/px|%/u, ""));

  if (Number.isNaN(amount)) {
    return size * 0.27;
  }

  return radius.endsWith("%") ? (size * amount) / 100 : amount;
};

const placeRing = (
  svg: SVGSVGElement,
  ring: SVGRectElement,
  size: number,
  radius: number
) => {
  const gap = 5;
  const width = size + 2 * gap;

  svg.style.left = `${-gap - 4}px`;
  svg.style.top = `${-gap - 4}px`;
  svg.setAttribute("width", `${width + 8}`);
  svg.setAttribute("height", `${width + 8}`);

  const corner = Math.min(radius + gap, width / 2);

  for (const [name, value] of [
    ["x", 4],
    ["y", 4],
    ["width", width],
    ["height", width],
    ["rx", corner],
    ["ry", corner],
  ] as const) {
    ring.setAttribute(name, String(value));
  }
};

const paintRing = (ring: SVGRectElement, fraction: number, pulse: number) => {
  ring.setAttribute("stroke-dasharray", `${(fraction * 100).toFixed(2)} 200`);
  toggle(ring.parentElement ?? ring, "low", fraction < 0.3);
  ring.style.opacity = pulse.toFixed(3);
};

const nudge = (node: HTMLElement) => {
  node.animate(
    [
      { translate: "0 0" },
      { translate: "-4px 0" },
      { translate: "4px 0" },
      { translate: "0 0" },
    ],
    { duration: 220 }
  );
};

const statusOn = (status: Status, text: string, tone: Tone, until: number) => {
  status.act.textContent = text;
  status.act.className = tone === "" ? "act" : `act ${tone}`;
  status.until = until;
  toggle(status.host, "acting", true);
};

const keyHint = (key: string, text: string) => {
  const span = el("span", "");

  el("kbd", "", span, key);
  span.append(text);

  return span;
};

const myTurn = (snapshot: TableSnapshot) =>
  snapshot.heroSeat !== null &&
  snapshot.toAct === snapshot.heroSeat &&
  snapshot.legal !== null;

const chipWords = (
  snapshot: TableSnapshot,
  legal: HeroLegal | null,
  me: SeatSnapshot | undefined
): readonly [string, string] => {
  if (legal === null || legal.show || legal.muck) {
    return snapshot.waiting === "" ? ["", ""] : [snapshot.waiting, "…"];
  }

  if (legal.check) {
    return ["Check", ""];
  }

  if (legal.call !== null) {
    const allIn = me !== undefined && legal.call >= me.stack;

    return [allIn ? "All in" : "Call", formatChips(legal.call)];
  }

  return ["", ""];
};

const setPile = (pile: Pile, amount: number) => {
  if (pile.shown === amount) {
    return;
  }

  pile.shown = amount;
  toggle(pile.root, "empty", amount <= 0);

  if (amount > 0) {
    pile.amount.textContent = formatChips(amount);
  }
};

const detentsFor = (spot: RaiseSpot): readonly PlacedDetent[] =>
  placeDetents(raiseDetents(spot), spot.min, spot.max);

const raiseHeading = (spot: RaiseSpot) => (spot.isBet ? "Bet" : "Raise to");

const raiseWord = (spot: RaiseSpot, allIn: boolean) => {
  if (allIn) {
    return "All in";
  }

  return spot.isBet ? "Bet" : "Raise";
};

interface Sizing {
  readonly min: number;
  readonly max: number;
  readonly detents: readonly PlacedDetent[];
  readonly ladder: readonly number[];
  readonly typing: boolean;
  readonly heading: (value: number) => string;
  readonly word: (value: number) => string;
  readonly amount: (value: number) => string;
  readonly commit: (value: number) => TableIntent;
  readonly lesson: Hint | null;
}

const runWord = (runs: number) => {
  if (runs === 1) {
    return "once";
  }

  return runs === 2 ? "twice" : `${runs} times`;
};

const raiseSizing = (spot: RaiseSpot): Sizing => ({
  amount: formatChips,
  commit: (to) => TableIntents.Raise.make({ to }),
  detents: detentsFor(spot),
  heading: (value) => (value >= spot.max ? "All in" : raiseHeading(spot)),
  ladder: raiseLadder(spot),
  lesson: "Raise",
  max: spot.max,
  min: spot.min,
  typing: true,
  word: (value) => raiseWord(spot, value >= spot.max),
});

const runSizing = (most: number): Sizing => {
  const counts = Array.from(
    { length: Math.max(1, most) },
    (_, index) => index + 1
  );

  return {
    amount: runWord,
    commit: (runs) => TableIntents.Runs.make({ runs }),
    detents: placeDetents(
      counts.map((runs) => ({ label: runWord(runs), value: runs })),
      1,
      Math.max(1, most)
    ),
    heading: () => "Run it",
    ladder: counts,
    lesson: null,
    max: Math.max(1, most),
    min: 1,
    typing: false,
    word: () => "Run it",
  };
};

const keyValue = (sizing: KeySizing) =>
  sizing.typed === "" ? sizing.value : Number(sizing.typed);

const keyNote = (
  spot: Sizing,
  keyed: boolean,
  low: boolean,
  high: boolean
): readonly (Node | string)[] => {
  if (!keyed) {
    return [];
  }

  if (low) {
    return [
      `Minimum ${formatChips(spot.min)} · `,
      keyHint("Enter", ` raises to ${formatChips(spot.min)}`),
    ];
  }

  if (high) {
    return [
      `You have ${formatChips(spot.max)} · `,
      keyHint("Enter", " goes all in"),
    ];
  }

  return [
    "Type an amount · ",
    keyHint("↑↓", " presets · "),
    keyHint("Enter", " · "),
    keyHint("Esc", ""),
  ];
};

const expireStatus = (status: Status, now: number) => {
  if (status.until > 0 && status.until <= now) {
    status.until = 0;
    status.host.classList.remove("acting");
  }
};

const tileScale = (state: {
  readonly winner: boolean;
  readonly active: boolean;
  readonly folded: boolean;
  readonly activeScale: number;
  readonly baseScale: number;
}) => {
  if (state.winner) {
    return 1.12;
  }

  if (state.active) {
    return state.activeScale;
  }

  return state.folded ? 0.8 : state.baseScale;
};

const dimmedOpacity = (folded: boolean) => (folded ? 0.45 : 0.72);

const selfScaleFor = (winning: boolean, mine: boolean) => {
  if (winning) {
    return 1.12;
  }

  return mine ? 1.08 : 1;
};

interface Placement {
  x: number;
  y: number;
  scale: number;
  fixed: boolean;
  axis: "x" | "y";
}

const pushApart = (
  a: Placement,
  b: Placement,
  tileSize: number,
  caption: number,
  keepIn: (box: Placement) => void
) => {
  const reach = (((a.scale + b.scale) * tileSize) / 2) * 0.9 + 4;
  const overlapX = reach - Math.abs(a.x - b.x);
  const overlapY = reach + caption - Math.abs(a.y - b.y);

  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }

  const movers = [a, b].filter((box) => !box.fixed);
  const share = movers.length === 2 ? 0.5 : 1;

  for (const mover of movers) {
    const other = mover === a ? b : a;

    if (mover.axis === "x") {
      mover.x += Math.sign(mover.x - other.x || 1) * overlapX * share;
    } else {
      mover.y += Math.sign(mover.y - other.y || 1) * overlapY * share;
    }

    keepIn(mover);
  }
};

const separate = <B extends Placement>(
  boxes: readonly B[],
  geo: Geo
): readonly B[] => {
  const tileSize = geo.tile;
  const placed = boxes.map((box) => ({ ...box }));

  const keepIn = (box: Placement) => {
    const half = (tileSize * box.scale) / 2 + (box.fixed ? 14 : 8);

    box.x = clamp(box.x, half, geo.w - half);
    box.y = clamp(
      box.y,
      geo.zone.top + half,
      geo.zone.bottom - geo.caption - half + (box.fixed ? 30 : 0)
    );
  };

  for (const box of placed) {
    keepIn(box);
  }

  for (let round = 0; round < 4; round += 1) {
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        const a = placed[first];
        const b = placed[second];

        if (a !== undefined && b !== undefined && !(a.fixed && b.fixed)) {
          pushApart(a, b, tileSize, geo.caption, keepIn);
        }
      }
    }
  }

  return placed;
};

const bettingKeys = (legal: HeroLegal, me: SeatSnapshot | undefined) => {
  const callWord =
    me !== undefined && legal.call !== null && legal.call >= me.stack
      ? "All in"
      : "Call";

  const passive = legal.check ? [keyHint("C", "Check")] : [];

  const calling =
    !legal.check && legal.call !== null ? [keyHint("C", callWord)] : [];

  const raising =
    legal.raise === null
      ? []
      : [keyHint("R", legal.raise.isBet ? "Bet" : "Raise")];

  return [keyHint("F", "Fold"), ...passive, ...calling, ...raising];
};

const keyParts = (
  vote: number,
  legal: HeroLegal | null,
  me: SeatSnapshot | undefined
) => {
  if (vote > 0) {
    return Array.from({ length: Math.min(vote, 9) }, (_, index) =>
      keyHint(String(index + 1), runWord(index + 1))
    );
  }

  if (legal === null) {
    return [];
  }

  if (legal.show || legal.muck) {
    return [
      ...(legal.show ? [keyHint("S", "Show")] : []),
      ...(legal.muck ? [keyHint("F", "Muck")] : []),
    ];
  }

  return bettingKeys(legal, me);
};

const REACTION_GLYPHS: Record<Reaction, string> = {
  Clap: "👏",
  Cry: "😢",
  Fire: "🔥",
  Laugh: "😂",
  Wow: "😮",
};

const PEEK_SETTLE_MS = 120;

const REACTION_RISE_MS = 1800;

const REACTION_KEY = "e";

const isShortcutOrTyping = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey || isTyping(event);

const expressionFor = (mood: {
  readonly folded: boolean;
  readonly happy: boolean;
  readonly gutted: boolean;
  readonly thinking: boolean;
  readonly lookingDown: boolean;
}): Expression => {
  if (mood.happy) {
    return "Happy";
  }

  if (mood.gutted) {
    return "Gutted";
  }

  if (mood.folded) {
    return "Folded";
  }

  if (mood.lookingDown) {
    return "LookingDown";
  }

  return mood.thinking ? "Thinking" : "Resting";
};

const paintFace = (
  pic: HTMLElement,
  avatar: string,
  expression: Expression,
  size: number
) => {
  const pixels = Math.max(24, Math.round(size));
  const key = `${avatar}|${expression}|${pixels}`;

  if (pic.dataset.face !== key) {
    pic.dataset.face = key;
    pic.innerHTML = render(avatarFor(avatar), { expression, size: pixels });
  }
};

const renderNote = (host: HTMLElement, node: HTMLElement, note: string) => {
  if (node.textContent !== note) {
    node.textContent = note;
  }

  toggle(host, "noted", note !== "");
};

export class NostakesTable extends HTMLElement {
  #snap: TableSnapshot | null = null;
  readonly #root: ShadowRoot;
  readonly #room: HTMLDivElement;
  readonly #sound = new TableSound();
  #geo: Geo | null = null;
  #tiles = new Map<number, Tile>();
  #order = "";
  #piles = new Map<number, Pile>();
  readonly #pending = new Map<string, number>();
  #lastEventId = -1;
  #handId = -1;
  #legalKey = "";
  #clockKey = "";
  #clockAt = 0;
  #frameId = 0;
  #last = 0;
  #observer: ResizeObserver | null = null;
  #themeWatch: MutationObserver | null = null;
  #felt!: HTMLDivElement;
  #strip!: HTMLDivElement;
  #potRoot!: HTMLDivElement;
  #pot!: Counter;
  #potSide!: HTMLDivElement;
  #slots: HTMLDivElement[] = [];
  #runs!: HTMLDivElement;
  #boardShown: readonly string[] = [];
  #self!: HTMLDivElement;
  #selfFrame!: HTMLDivElement;
  #selfPic!: HTMLDivElement;
  #selfStatus!: Status;
  #selfStack!: Counter;
  #selfNote!: HTMLDivElement;
  #selfRing!: SVGRectElement;
  #selfRingSvg!: SVGSVGElement;
  readonly #selfScale = new Spring(1, 160, 0.6);
  #dealer!: HTMLDivElement;
  #hand!: HTMLDivElement;
  #handCards: HTMLDivElement[] = [];
  #handLabel!: HTMLDivElement;
  #chip!: HTMLButtonElement;
  #chipA!: HTMLDivElement;
  #chipB!: HTMLDivElement;
  #rail!: HTMLDivElement;
  #railTrack!: HTMLDivElement;
  #railFill!: HTMLDivElement;
  #railLine!: HTMLDivElement;
  #readout!: HTMLDivElement;
  #readKind!: HTMLDivElement;
  #readValue!: HTMLDivElement;
  #readNote!: HTMLDivElement;
  #cancel!: HTMLDivElement;
  #detentEls: HTMLDivElement[] = [];
  readonly #fx!: HTMLDivElement;
  readonly #hints = new Map<Hint, HTMLDivElement>();
  #ghost!: HTMLDivElement;
  #ghostAnim: Animation | null = null;
  #keysEl!: HTMLDivElement;
  #handKeysEl!: HTMLDivElement;
  #peekOn = false;
  #peekChangedAt = 0;
  #peekShared = false;
  #peekSharedAt = 0;
  #lastReactionId: number | null = null;
  #picker!: HTMLDivElement;
  #pickerOpen = false;
  #pressPeek = false;
  #hoverPeek = false;
  #keyPeek = false;
  #keySize: KeySizing | null = null;
  #handG: HandGesture | null = null;
  #chipG: ChipGesture | null = null;
  #locked = false;
  #lockedAt = 0;
  #winner = -1;
  #heroWinUntil = 0;
  #heroGuttedUntil = 0;
  #hushBeat = 0;
  #lastTick = -1;
  readonly #taught = new Set<Hint>();
  readonly #fine = globalThis.matchMedia("(hover: hover) and (pointer: fine)");
  readonly #touch = globalThis.matchMedia("(any-pointer: coarse)");
  readonly #motion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    el("style", "", this.#root, tableCss);
    this.#room = el("div", "room", this.#root);
    this.#buildMiddle();
    this.#buildSelf();
    this.#buildHand();
    this.#fx = el("div", "fx", this.#room);
    this.#buildPicker();
    this.#buildRail();
    this.#buildChip();
    this.#buildHints();
    this.#room.addEventListener("pointerdown", (event) => {
      this.#sound.unlock();

      if (
        this.#pickerOpen &&
        !event
          .composedPath()
          .some(
            (target) => target === this.#picker || target === this.#selfFrame
          )
      ) {
        this.#closePicker();
      }
    });
    this.#adoptEarlyProperties();
  }

  #adoptEarlyProperties() {
    const early = {
      snapshot: Object.getOwnPropertyDescriptor(this, "snapshot"),
      sound: Object.getOwnPropertyDescriptor(this, "sound"),
    };

    Reflect.deleteProperty(this, "snapshot");
    Reflect.deleteProperty(this, "sound");

    if (early.sound !== undefined) {
      this.sound = Option.getOrElse(
        Schema.decodeUnknownOption(Schema.Boolean)(early.sound.value),
        () => this.sound
      );
    }

    if (early.snapshot !== undefined) {
      this.snapshot = Option.getOrNull(
        Schema.decodeUnknownOption(TableSnapshotSchema)(early.snapshot.value)
      );
    }
  }

  get #reduced(): boolean {
    return this.#motion.matches;
  }

  get sound(): boolean {
    return this.#sound.on;
  }

  set sound(on: boolean) {
    this.#sound.on = on;
  }

  get snapshot(): TableSnapshot | null {
    return this.#snap;
  }

  set snapshot(next: TableSnapshot | null) {
    if (next === null) {
      return;
    }

    const previous = this.#snap;

    this.#snap = next;
    this.#ensureTiles(next);

    if (next.handId !== this.#handId) {
      const first = this.#handId === -1;

      this.#handId = next.handId;
      this.#resetHand();

      if (first) {
        this.#lastEventId = lastEventId(next.events);
      }
    }

    const key = legalKey(next);

    if (key !== this.#legalKey) {
      this.#legalKey = key;
      this.#locked = false;
    }

    if (next.clock !== null && next.clock.key !== this.#clockKey) {
      this.#clockKey = next.clock.key;
      this.#clockAt = performance.now();
    }

    this.#playFresh(next.events);
    this.#playReactions(next.reactions);
    this.#render();

    if (myTurn(next) && (previous === null || !myTurn(previous))) {
      this.#onHeroTurn();
    }
  }

  connectedCallback() {
    this.#observer = new ResizeObserver(() => {
      this.#layout(false);
    });
    this.#observer.observe(this);
    this.#themeWatch = new MutationObserver(() => {
      this.#layout(true);
    });
    this.#themeWatch.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
    });
    this.#motion.addEventListener("change", this.#onScheme);
    globalThis
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", this.#onScheme);
    this.#layout(true);
    this.#last = performance.now();
    this.#frameId = requestAnimationFrame(this.#loop);
    globalThis.addEventListener("keydown", this.#onKeyDown);
    globalThis.addEventListener("keyup", this.#onKeyUp);
    globalThis.addEventListener("blur", this.#onBlur);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#frameId);
    this.#observer?.disconnect();
    this.#themeWatch?.disconnect();
    this.#motion.removeEventListener("change", this.#onScheme);
    globalThis
      .matchMedia("(prefers-color-scheme: dark)")
      .removeEventListener("change", this.#onScheme);
    globalThis.removeEventListener("keydown", this.#onKeyDown);
    globalThis.removeEventListener("keyup", this.#onKeyUp);
    globalThis.removeEventListener("blur", this.#onBlur);
  }

  readonly #onScheme = () => {
    this.#layout(true);
  };

  readonly #loop = (now: number) => {
    this.#frameId = requestAnimationFrame(this.#loop);
    this.#frame(now);
  };

  #emit(intent: TableIntent) {
    this.dispatchEvent(
      new CustomEvent("intent", {
        bubbles: true,
        composed: true,
        detail: intent,
      })
    );
  }

  #act(intent: TableIntent) {
    this.#locked = true;
    this.#lockedAt = performance.now();
    this.#emit(intent);
  }

  #buildMiddle() {
    this.#felt = el("div", "felt", this.#room);
    this.#strip = el("div", "strip", this.#room);
    this.#potRoot = el("div", "pot zero", this.#room);
    el("div", "k", this.#potRoot, "pot");
    this.#pot = new Counter(el("div", "v", this.#potRoot, "0"));
    this.#potSide = el("div", "side", this.#potRoot);
    this.#slots = Array.from({ length: 5 }, () => {
      const slot = el("div", "slot", this.#room);

      slot.addEventListener("click", () => {
        if (slot.classList.contains("hunt")) {
          this.#emit(TableIntents.HuntRabbit.make({}));
        }
      });

      return slot;
    });
    this.#runs = el("div", "runs", this.#room);
  }

  #buildSelf() {
    this.#self = el("div", "self gone", this.#room);
    this.#selfFrame = el("div", "frame", this.#self);
    this.#selfPic = el("div", "pic", this.#selfFrame);

    const label = el("div", "label", this.#self);

    el("div", "name", label, "You");

    const line = el("div", "line", label);

    this.#selfStack = new Counter(el("div", "st", line, "0"));
    this.#selfNote = el("div", "note", line);
    this.#selfStatus = {
      act: el("div", "act", line),
      host: this.#self,
      until: 0,
    };
    this.#selfRingSvg = svgEl("svg", this.#self);
    this.#selfRingSvg.classList.add("ring");
    this.#selfRing = svgEl("rect", this.#selfRingSvg);
    this.#selfRing.setAttribute("pathLength", "100");
    this.#dealer = el("div", "dealer gone", this.#room, "D");
  }

  #buildPicker() {
    this.#picker = el("div", "reactions gone", this.#room);
    this.#picker.setAttribute("role", "toolbar");
    this.#picker.setAttribute("aria-label", "React");

    for (const [index, reaction] of REACTIONS.entries()) {
      const choice = el(
        "button",
        "reaction-choice",
        this.#picker,
        REACTION_GLYPHS[reaction]
      );

      choice.type = "button";
      choice.title = `${reaction} (${index + 1})`;
      choice.setAttribute("aria-label", reaction);
      choice.addEventListener("click", () => {
        this.#react(reaction);
      });
    }

    this.#selfFrame.addEventListener("click", () => {
      if (this.#pickerOpen) {
        this.#closePicker();
      } else {
        this.#openPicker();
      }
    });
  }

  #openPicker() {
    this.#pickerOpen = true;
    toggle(this.#picker, "gone", false);
  }

  #closePicker() {
    this.#pickerOpen = false;
    toggle(this.#picker, "gone", true);
  }

  #react(reaction: Reaction) {
    this.#closePicker();
    this.#emit(TableIntents.React.make({ reaction }));
  }

  #playReactions(reactions: TableSnapshot["reactions"]) {
    const newest = Math.max(0, ...reactions.map(({ id }) => id));

    if (this.#lastReactionId === null) {
      this.#lastReactionId = newest;

      return;
    }

    const last = this.#lastReactionId;

    for (const shown of reactions) {
      if (shown.id > last) {
        this.#rise(shown);
      }
    }

    this.#lastReactionId = Math.max(last, newest);
  }

  #rise(shown: TableSnapshot["reactions"][number]) {
    const geo = this.#geo;

    if (geo === null) {
      return;
    }

    const from =
      shown.seat === null
        ? { x: geo.pot.x, y: geo.pot.y }
        : this.#tilePoint(shown.seat);

    const node = el(
      "div",
      "reaction",
      this.#fx,
      REACTION_GLYPHS[shown.reaction]
    );

    node.dataset.reaction = shown.reaction;
    node.style.left = `${from.x}px`;
    node.style.top = `${from.y}px`;

    const keyframes = this.#reduced
      ? [
          { opacity: 0 },
          { offset: 0.15, opacity: 1 },
          { offset: 0.8, opacity: 1 },
          { opacity: 0 },
        ]
      : [
          {
            easing: "ease-out",
            opacity: 0,
            transform: "translate(-50%, -50%) scale(0.6)",
          },
          {
            easing: "ease-out",
            offset: 0.15,
            opacity: 1,
            transform: "translate(-50%, -120%) scale(1)",
          },
          {
            easing: "ease-in",
            offset: 0.7,
            opacity: 1,
            transform: "translate(-50%, -260%) scale(1)",
          },
          { opacity: 0, transform: "translate(-50%, -320%) scale(1)" },
        ];

    const flight = node.animate(keyframes, {
      duration: REACTION_RISE_MS,
      easing: "linear",
      fill: "forwards",
    });

    flight.addEventListener("finish", () => {
      node.remove();
    });
  }

  #sharePeek(now: number) {
    const settled = now - this.#peekChangedAt >= PEEK_SETTLE_MS;

    if (this.#peekOn && !this.#peekShared && settled) {
      this.#peekShared = true;
      this.#peekSharedAt = now;
      this.#emit(TableIntents.Peek.make({ looking: true }));
    } else if (
      this.#peekOn &&
      this.#peekShared &&
      now - this.#peekSharedAt >= PEEK_REFRESH_MS
    ) {
      this.#peekSharedAt = now;
      this.#emit(TableIntents.Peek.make({ looking: true }));
    } else if (!this.#peekOn && this.#peekShared) {
      this.#peekShared = false;
      this.#emit(TableIntents.Peek.make({ looking: false }));
    }
  }

  #buildHand() {
    this.#hand = el("div", "hand gone", this.#room);
    this.#handCards = [
      el("div", "hc", this.#hand),
      el("div", "hc", this.#hand),
    ];
    this.#handLabel = el("div", "hand-label", this.#hand);
    this.#hand.addEventListener("pointerdown", this.#onHandDown);
    this.#hand.addEventListener("pointerenter", this.#onHandEnter);
    this.#hand.addEventListener("pointerleave", this.#onHandLeave);
    this.#hand.addEventListener("pointermove", this.#onHandMove);
    this.#hand.addEventListener("pointerup", this.#onHandEnd);
    this.#hand.addEventListener("pointercancel", this.#onHandEnd);
  }

  #buildRail() {
    this.#rail = el("div", "rail", this.#room);
    el("div", "scrim", this.#rail);
    this.#railTrack = el("div", "track", this.#rail);
    this.#railFill = el("div", "fill", this.#rail);
    this.#railLine = el("div", "line", this.#rail);
    this.#readout = el("div", "readout", this.#rail);
    this.#readKind = el("div", "k", this.#readout);
    this.#readValue = el("div", "v", this.#readout);
    this.#readNote = el("div", "note", this.#readout);
    this.#cancel = el("div", "cancel", this.#rail, "release here to cancel");
  }

  #buildChip() {
    this.#chip = el("button", "chipctl idle gone", this.#room);
    this.#chip.type = "button";
    el("div", "disc", this.#chip);

    const label = el("div", "lbl", this.#chip);

    this.#chipA = el("div", "a", label);
    this.#chipB = el("div", "b", label);
    this.#chip.addEventListener("pointerdown", this.#onChipDown);
    this.#chip.addEventListener("pointermove", this.#onChipMove);
    this.#chip.addEventListener("pointerup", this.#onChipEnd);
    this.#chip.addEventListener("pointercancel", this.#onChipEnd);
    this.#chip.addEventListener("click", this.#onChipClick);
    this.#keysEl = el("div", "keys start", this.#room);
    this.#handKeysEl = el("div", "keys hand-keys", this.#room);
    this.#handKeysEl.append(keyHint("Space", "or hover to peek"));
  }

  #buildHints() {
    const fine = this.#fine.matches && !this.#touch.matches;

    for (const [name, text] of [
      ["Peek", fine ? "Hover your cards to peek" : "Hold your cards to peek"],
      [
        "Fold",
        fine ? "Drag your cards up to fold" : "Flick your cards up to fold",
      ],
      ["Raise", "Drag the chip up to raise"],
    ] as const) {
      this.#hints.set(name, el("div", "hint", this.#room, text));
    }

    this.#ghost = el("div", "ghost", this.#room);
  }

  #ensureTiles(snapshot: TableSnapshot) {
    const hero = snapshot.heroSeat;
    const others = snapshot.seats.filter(({ seat }) => seat !== hero);

    const ordered =
      hero === null
        ? others
        : [
            ...others.filter(({ seat }) => seat > hero),
            ...others.filter(({ seat }) => seat < hero),
          ];

    const order = ordered
      .map(({ seat, status }) => `${seat}:${status === "Empty" ? "e" : "o"}`)
      .join(",");

    if (order === this.#order) {
      return;
    }

    for (const tile of this.#tiles.values()) {
      tile.root.remove();
    }

    for (const pile of this.#piles.values()) {
      pile.root.remove();
    }

    this.#tiles = new Map();
    this.#piles = new Map();
    this.#order = order;

    for (const [index, info] of ordered.entries()) {
      this.#tiles.set(info.seat, this.#makeTile(info, index));
    }

    for (const info of snapshot.seats) {
      const root = el("div", "pile empty");

      this.#room.insertBefore(root, this.#fx);
      el("div", "dot", root);
      this.#piles.set(info.seat, {
        amount: el("div", "amt", root, "0"),
        root,
        shown: 0,
      });
    }

    this.#layout(true);
  }

  #makeTile(info: SeatSnapshot, index: number): Tile {
    const root = el("div", info.status === "Empty" ? "tile empty" : "tile");

    this.#room.insertBefore(root, this.#fx);

    const frame = el("div", "frame", root);
    const pic = el("div", "pic", frame, info.status === "Empty" ? "Sit" : "");
    const label = el("div", "label", root);
    const name = el("div", "name", label, info.name);
    const line = el("div", "line", label);
    const stack = new Counter(el("div", "st", line));
    const act = el("div", "act", line);
    const note = el("div", "note", line);
    const ringSvg = svgEl("svg", root);

    ringSvg.classList.add("ring");

    const ring = svgEl("rect", ringSvg);

    ring.setAttribute("pathLength", "100");

    const shown = el("div", "shown", root);

    if (info.status !== "Empty") {
      root.addEventListener("click", () => {
        if (this.#snap?.hostTools === true) {
          this.#emit(TableIntents.Pick.make({ seat: info.seat }));
        }
      });
    }

    if (info.status === "Empty") {
      const sit = () => {
        this.#emit(TableIntents.Sit.make({ seat: info.seat }));
      };

      root.setAttribute("role", "button");
      root.setAttribute("aria-label", `Take seat ${info.seat + 1}`);
      root.tabIndex = 0;
      root.addEventListener("click", sit);
      root.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          sit();
        }
      });
    }

    return {
      frame,
      index,
      joyUntil: 0,
      lastTransform: "",
      name,
      note,
      opacity: new Spring(1, 80, 1),
      pic,
      ring,
      ringSvg,
      root,
      scale: new Spring(1, 170, 0.62),
      seat: info.seat,
      shown,
      stack,
      status: { act, host: root, until: 0 },
      surpriseUntil: 0,
      x: new Spring(0, 140, 0.78),
      y: new Spring(0, 140, 0.78),
    };
  }

  #layout(force: boolean) {
    const w = this.clientWidth;
    const h = this.clientHeight;

    if (w === 0 || h === 0) {
      return;
    }

    const count = Math.max(1, this.#tiles.size);

    const same =
      this.#geo !== null &&
      this.#geo.w === w &&
      this.#geo.h === h &&
      this.#geo.seats.length === count;

    if (same && !force) {
      return;
    }

    const geo = computeGeo(w, h, count);

    this.#geo = geo;
    this.#room.style.setProperty("--t", `${geo.tile}px`);
    this.#room.style.setProperty("--cw", `${geo.cardW}px`);
    toggle(this.#room, "in-strip", geo.boardInStrip);
    Object.assign(this.#felt.style, {
      height: `${geo.table.ry * 2}px`,
      left: `${geo.table.x - geo.table.rx}px`,
      top: `${geo.table.y - geo.table.ry}px`,
      width: `${geo.table.rx * 2}px`,
    });
    this.#layoutTiles(geo);
    this.#layoutMiddle(geo);
    this.#layoutHero(geo);
    this.#layoutRail(geo);

    for (const [seat, pile] of this.#piles) {
      const point = this.#pilePoint(seat);

      pile.root.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    }

    if (this.#snap !== null) {
      this.#renderBoard(false);
      this.#render();
    }
  }

  #layoutTiles(geo: Geo) {
    for (const tile of this.#tiles.values()) {
      const spot = geo.seats[tile.index];

      if (spot !== undefined) {
        tile.x.settle(spot.x);
        tile.y.settle(spot.y);
        tile.root.classList.remove("left", "right", "top");
        tile.root.classList.add(spot.side);
      }

      placeRing(
        tile.ringSvg,
        tile.ring,
        geo.tile,
        ringRadius(tile.frame, geo.tile)
      );
    }
  }

  #layoutMiddle(geo: Geo) {
    Object.assign(this.#strip.style, {
      height: `${geo.strip.h}px`,
      left: `${geo.strip.x}px`,
      top: `${geo.strip.y}px`,
      width: `${geo.strip.w}px`,
    });
    this.#potRoot.style.left = `${geo.pot.x}px`;
    this.#potRoot.style.top = `${geo.pot.y}px`;

    for (const [index, point] of geo.board.entries()) {
      const slot = this.#slots[index];

      if (slot !== undefined) {
        Object.assign(slot.style, {
          height: `${geo.cardW * 1.4 + 2}px`,
          left: `${point.x}px`,
          top: `${point.y}px`,
          width: `${geo.cardW + 2}px`,
        });
      }
    }

    this.#boardShown = [];

    for (const slot of this.#slots) {
      slot.replaceChildren();
    }
  }

  #layoutHero(geo: Geo) {
    const { size } = geo.self;

    Object.assign(this.#picker.style, {
      left: `${geo.self.x}px`,
      top: `${geo.self.y - size / 2}px`,
    });

    Object.assign(this.#self.style, {
      height: `${size}px`,
      left: `${geo.self.x - size / 2}px`,
      top: `${geo.self.y - size / 2}px`,
      width: `${size}px`,
    });
    this.#self.style.setProperty("--t", `${size}px`);
    placeRing(
      this.#selfRingSvg,
      this.#selfRing,
      size,
      ringRadius(this.#selfFrame, size)
    );

    const cardW = geo.handCardW;
    const spread = cardW * 0.5;

    this.#hand.style.setProperty("--spread", `${spread}px`);
    Object.assign(this.#hand.style, {
      height: `${cardW * 1.4}px`,
      left: `${geo.hand.x - (cardW + spread) / 2}px`,
      top: `${geo.hand.y - (cardW * 1.4) / 2}px`,
      width: `${cardW + spread}px`,
    });

    for (const holder of this.#handCards) {
      holder.replaceChildren();
      delete holder.dataset.card;
    }

    const chipSize = geo.chip.size;

    this.#chip.style.setProperty("--c", `${chipSize}px`);
    Object.assign(this.#chip.style, {
      left: `${geo.chip.x - chipSize / 2}px`,
      top: `${geo.chip.y - chipSize / 2}px`,
    });
    Object.assign(this.#keysEl.style, {
      left: `${geo.chip.x - geo.chip.size / 2}px`,
      top: `${geo.keys.y}px`,
    });
    Object.assign(this.#handKeysEl.style, {
      left: `${geo.handKeys.x}px`,
      top: `${geo.handKeys.y}px`,
    });
  }

  #layoutRail(geo: Geo) {
    Object.assign(this.#railTrack.style, {
      height: `${geo.chip.y - geo.railTop}px`,
      left: `${geo.chip.x}px`,
      top: `${geo.railTop}px`,
    });
    Object.assign(this.#railFill.style, {
      height: "0px",
      left: `${geo.chip.x}px`,
      top: `${geo.chip.y}px`,
    });
    Object.assign(this.#railLine.style, {
      left: `${geo.chip.x - 70}px`,
      top: `${geo.chip.y - LINE}px`,
      width: "140px",
    });
    Object.assign(this.#readout.style, {
      left: `${geo.readout.x}px`,
      top: `${geo.readout.y}px`,
    });
    toggle(this.#readout, "end", geo.readout.align === "right");
    Object.assign(this.#cancel.style, {
      left: `${geo.chip.x - 30}px`,
      top: `${geo.chip.y + geo.chip.size / 2 + 6}px`,
    });
  }

  #heroPoint(): Pt {
    const geo = this.#geo;

    return geo === null ? { x: 0, y: 0 } : { x: geo.self.x, y: geo.self.y };
  }

  #tilePoint(seat: number): Pt {
    const geo = this.#geo;

    if (geo === null) {
      return { x: 0, y: 0 };
    }

    if (seat === this.#snap?.heroSeat) {
      return this.#heroPoint();
    }

    const tile = this.#tiles.get(seat);

    return tile === undefined ? geo.interior : { x: tile.x.x, y: tile.y.x };
  }

  #pilePoint(seat: number): Pt {
    const geo = this.#geo;

    if (geo === null) {
      return { x: 0, y: 0 };
    }

    if (seat === this.#snap?.heroSeat) {
      return geo.heroBet;
    }

    const tile = this.#tiles.get(seat);

    return (
      (tile === undefined ? undefined : geo.seats[tile.index]?.bet) ??
      geo.interior
    );
  }

  #chipSource(seat: number): Pt {
    const geo = this.#geo;

    if (geo !== null && seat === this.#snap?.heroSeat) {
      return { x: geo.chip.x, y: geo.chip.y };
    }

    const point = this.#tilePoint(seat);

    return { x: point.x, y: point.y + (geo?.tile ?? 0) * 0.3 };
  }

  #hold(key: string) {
    this.#pending.set(key, (this.#pending.get(key) ?? 0) + 1);
  }

  #release(key: string) {
    const left = (this.#pending.get(key) ?? 1) - 1;

    if (left <= 0) {
      this.#pending.delete(key);
    } else {
      this.#pending.set(key, left);
    }

    this.#render();
  }

  #held(key: string) {
    return (this.#pending.get(key) ?? 0) > 0;
  }

  #resetHand() {
    this.#fx.replaceChildren();
    this.#pending.clear();
    this.#winner = -1;
    this.#heroWinUntil = 0;
    this.#hand.classList.remove("open", "armed", "peek");
    this.#hand.style.transform = "";
    this.#handLabel.classList.remove("on");

    for (const tile of this.#tiles.values()) {
      tile.shown.replaceChildren();
      tile.status.until = 0;
      tile.root.classList.remove("acting");
    }

    this.#selfStatus.until = 0;
    this.#self.classList.remove("acting");
    this.#boardShown = [];

    for (const slot of this.#slots) {
      slot.replaceChildren();
    }

    this.#runs.replaceChildren();
    delete this.#runs.dataset.key;

    for (const holder of this.#handCards) {
      holder.replaceChildren();
      delete holder.dataset.card;
    }

    for (const pile of this.#piles.values()) {
      pile.shown = 0;
      pile.root.classList.add("empty");
    }
  }

  #seat(seat: number | null): SeatSnapshot | undefined {
    return seat === null
      ? undefined
      : this.#snap?.seats.find((info) => info.seat === seat);
  }

  #canAct() {
    const snapshot = this.#snap;

    if (this.#locked && performance.now() - this.#lockedAt > UNLOCK_AFTER_MS) {
      this.#locked = false;
    }

    return snapshot !== null && myTurn(snapshot) && !this.#locked;
  }

  #playFresh(events: readonly TableEvent[]) {
    const fresh = events.filter(({ id }) => id > this.#lastEventId);

    if (fresh.length === 0) {
      return;
    }

    this.#lastEventId = lastEventId(fresh);

    if (fresh.length > MAX_BURST) {
      return;
    }

    for (const { happening } of fresh) {
      this.#onEvent(happening);
    }
  }

  #render() {
    const snapshot = this.#snap;
    const geo = this.#geo;

    if (snapshot === null || geo === null) {
      return;
    }

    const now = performance.now();

    this.#renderSeats(snapshot, geo, now);
    this.#renderPot(snapshot, now);
    this.#renderBoard(true);
    this.#renderHero(snapshot, geo, now);
    this.#renderDealer(snapshot, geo);
    this.#updateHints();
  }

  #renderSeats(snapshot: TableSnapshot, geo: Geo, now: number) {
    for (const info of snapshot.seats) {
      const pile = this.#piles.get(info.seat);

      if (pile !== undefined && !this.#held(`bet:${info.seat}`)) {
        setPile(pile, info.bet);
      }

      const tile = this.#tiles.get(info.seat);

      if (tile !== undefined) {
        this.#renderTile(tile, info, geo, now);
      }
    }
  }

  #renderTile(tile: Tile, info: SeatSnapshot, geo: Geo, now: number) {
    if (!this.#held(`stack:${info.seat}`)) {
      tile.stack.set(info.stack, now);
    }

    if (tile.name.textContent !== info.name) {
      tile.name.textContent = info.name;
    }

    toggle(
      tile.root,
      "folded",
      info.status === "Folded" || info.status === "Out"
    );
    toggle(tile.root, "away", info.away);
    renderNote(tile.root, tile.note, info.note);
    this.#renderPickable(tile, info);

    if (info.shown.length > 0 && tile.shown.childElementCount === 0) {
      for (const [index, card] of info.shown.entries()) {
        const node = cardEl(card, Math.round(geo.tile * 0.36), true);
        const tilt = index === 0 ? -1 : 1;

        tile.shown.append(node);
        node.animate(
          [
            {
              opacity: 0,
              transform: `translateY(30px) rotate(${tilt * 8}deg) scale(.6)`,
            },
            {
              opacity: 1,
              transform: `translateY(0) rotate(${tilt * 5}deg) scale(1)`,
            },
          ],
          {
            delay: index * 90,
            duration: this.#reduced ? 120 : 420,
            easing: "cubic-bezier(.2,1.3,.4,1)",
            fill: "both",
          }
        );
      }
    } else if (info.shown.length === 0 && tile.shown.childElementCount > 0) {
      tile.shown.replaceChildren();
    }
  }

  #renderPot(snapshot: TableSnapshot, now: number) {
    const [main = 0, ...sides] = snapshot.pots;

    if (!this.#held("pot")) {
      this.#pot.set(main, now);
    }

    const side =
      sides.length === 0
        ? ""
        : sides.map((amount) => `side ${formatChips(amount)}`).join(" · ");

    if (this.#potSide.textContent !== side) {
      this.#potSide.textContent = side;
    }

    toggle(
      this.#potRoot,
      "zero",
      sum(snapshot.pots) <= 0 && !this.#held("pot")
    );
  }

  #renderHero(snapshot: TableSnapshot, geo: Geo, now: number) {
    const me = this.#seat(snapshot.heroSeat);
    const seated = me !== undefined;

    toggle(this.#self, "gone", !seated);
    toggle(this.#chip, "gone", !seated);

    if (me !== undefined) {
      this.#renderSelf(me, now);
    }

    const dealt =
      me === undefined
        ? 0
        : me.cardsHeld - (this.#pending.get(`deal:${me.seat}`) ?? 0);

    const showable = snapshot.afterHand.showable.length > 0;

    const holding =
      me !== undefined && dealt > 0 && (me.status !== "Folded" || showable);

    toggle(this.#hand, "gone", !holding);

    for (const [index, holder] of this.#handCards.entries()) {
      const card = snapshot.heroCards[index];
      const want = index < dealt && card !== undefined ? card : "";

      if ((holder.dataset.card ?? "") !== want) {
        holder.dataset.card = want;
        holder.replaceChildren();

        if (want !== "") {
          holder.append(cardEl(want, geo.handCardW));
        }
      }

      toggle(holder, "up", want !== "" && me?.shown.includes(want) === true);
    }

    renderNote(this.#self, this.#selfNote, me?.note ?? "");
    this.#renderAfterHand(snapshot, holding);

    this.#renderChip(snapshot, me);
    this.#renderShowdown(snapshot);
    this.#renderKeys(this.#canAct() ? snapshot.legal : null, me, holding);
  }

  #renderPickable(tile: Tile, info: SeatSnapshot) {
    const pickable = this.#snap?.hostTools === true && info.status !== "Empty";

    if (pickable === tile.root.classList.contains("pickable")) {
      return;
    }

    toggle(tile.root, "pickable", pickable);

    if (pickable) {
      tile.root.setAttribute("role", "button");
      tile.root.setAttribute("aria-label", `Host tools for ${info.name}`);
    } else {
      tile.root.removeAttribute("role");
      tile.root.removeAttribute("aria-label");
    }
  }

  #renderSelf(me: SeatSnapshot, now: number) {
    if (!this.#held(`stack:${me.seat}`)) {
      this.#selfStack.set(me.stack, now);
    }

    toggle(this.#self, "folded", me.status === "Folded" || me.status === "Out");
  }

  #renderAfterHand(snapshot: TableSnapshot, holding: boolean) {
    const { bothOnly, showable } = snapshot.afterHand;
    const offering = holding && showable.length > 0 && snapshot.legal === null;

    toggle(this.#hand, "offering", offering);

    if (offering) {
      this.#handLabel.textContent =
        bothOnly || showable.length === 1
          ? "Tap to show"
          : "Tap a card to show it";
      this.#handLabel.classList.add("on");
    }
  }

  #showAfterHand(target: EventTarget | null) {
    const snapshot = this.#snap;

    if (snapshot === null || !this.#hand.classList.contains("offering")) {
      return false;
    }

    const { bothOnly, showable } = snapshot.afterHand;
    const holder = target instanceof Element ? target.closest(".hc") : null;

    const tapped =
      holder instanceof HTMLElement ? (holder.dataset.card ?? "") : "";

    const cards = bothOnly || !showable.includes(tapped) ? showable : [tapped];

    this.#emit(TableIntents.ShowCards.make({ cards }));

    return true;
  }

  #renderChip(snapshot: TableSnapshot, me: SeatSnapshot | undefined) {
    const legal = this.#canAct() ? snapshot.legal : null;
    const voting = this.#canVote();
    const live = voting || (legal !== null && !legal.show && !legal.muck);

    toggle(this.#chip, "live", live);
    toggle(this.#chip, "idle", !live);

    if (this.#chipG?.mode === "size" || this.#keySize !== null) {
      return;
    }

    const [first, second] = voting
      ? (["Run it", "once"] as const)
      : chipWords(snapshot, legal, me);

    this.#chipA.textContent = first;
    this.#chipB.textContent = second;
    this.#chip.setAttribute(
      "aria-label",
      `${first} ${second}`.trim() || "Your chips"
    );
  }

  #renderShowdown(snapshot: TableSnapshot) {
    const legal = this.#canAct() ? snapshot.legal : null;
    const showing = legal !== null && legal.show;

    toggle(this.#hand, "beckon", showing);

    if (showing) {
      this.#handLabel.textContent = legal.muck
        ? "Tap to show, flick to muck"
        : "Tap to show";
      this.#handLabel.classList.add("on");
    } else if (
      !this.#hand.classList.contains("open") &&
      !this.#hand.classList.contains("armed") &&
      !this.#hand.classList.contains("offering")
    ) {
      this.#handLabel.classList.remove("on");
    }
  }

  #renderDealer(snapshot: TableSnapshot, geo: Geo) {
    const button = snapshot.buttonSeat;

    toggle(this.#dealer, "gone", button === null);

    if (button === null) {
      return;
    }

    const heroButton = button === snapshot.heroSeat;
    const size = heroButton ? geo.self.size : geo.tile;
    const frame = heroButton ? this.#selfFrame : this.#tiles.get(button)?.frame;

    const reach =
      frame !== undefined && ringRadius(frame, size) >= size / 2 - 1
        ? 0.36
        : 0.42;

    const tile = this.#tiles.get(button);

    const seatSpot = tile === undefined ? undefined : geo.seats[tile.index];
    const centre = heroButton ? this.#heroPoint() : seatSpot;

    const point =
      centre === undefined
        ? { x: -40, y: -40 }
        : { x: centre.x + size * reach, y: centre.y - size * reach };

    this.#dealer.style.transform = `translate(${point.x - 11}px, ${point.y - 11}px)`;
  }

  #renderBoard(animate: boolean) {
    const snapshot = this.#snap;
    const geo = this.#geo;

    if (snapshot === null || geo === null) {
      return;
    }

    const dealt = snapshot.boards[0] ?? [];
    const board = [...dealt, ...snapshot.rabbit].slice(0, 5);

    if (
      board.length < this.#boardShown.length ||
      board.some(
        (card, index) =>
          index < this.#boardShown.length && this.#boardShown[index] !== card
      )
    ) {
      this.#boardShown = [];

      for (const slot of this.#slots) {
        slot.replaceChildren();
      }
    }

    const start = this.#boardShown.length;

    for (let index = start; index < board.length; index += 1) {
      const slot = this.#slots[index];
      const card = board[index];

      if (slot !== undefined && card !== undefined) {
        const node = cardEl(card, geo.cardW, true);

        toggle(node, "rabbit", index >= dealt.length);
        slot.append(node);

        if (animate) {
          this.#dealToBoard(node, index, index - start, geo);
        }
      }
    }

    this.#boardShown = [...board];
    this.#renderHunt(snapshot, board.length);
    this.#renderRuns(snapshot, geo);
  }

  #renderHunt(snapshot: TableSnapshot, filled: number) {
    const hunting = snapshot.afterHand.rabbit && snapshot.rabbit.length === 0;

    for (const [index, slot] of this.#slots.entries()) {
      const open = hunting && index >= filled;

      toggle(slot, "hunt", open);

      if (open && index === filled) {
        slot.dataset.hint = "Rabbit";
      } else {
        delete slot.dataset.hint;
      }

      if (open) {
        slot.setAttribute("role", "button");
        slot.setAttribute("aria-label", "Hunt the rabbit");
      } else {
        slot.removeAttribute("role");
        slot.removeAttribute("aria-label");
      }
    }
  }

  #renderRuns(snapshot: TableSnapshot, geo: Geo) {
    const [first = [], ...extra] = snapshot.boards;
    const key = JSON.stringify([extra, Math.round(geo.w), Math.round(geo.h)]);

    if (this.#runs.dataset.key === key) {
      return;
    }

    const fresh = this.#runs.dataset.runs !== JSON.stringify(extra);

    this.#runs.dataset.key = key;
    this.#runs.dataset.runs = JSON.stringify(extra);
    this.#runs.replaceChildren();

    const lanes = runLanes(geo, extra.length);

    for (const [row, board] of extra.entries()) {
      const lane = lanes[row];

      for (const [index, card] of board.entries()) {
        if (lane !== undefined) {
          const node = cardEl(card, lane.cardW, true);
          const dealt = first[index] !== card;

          node.classList.add("run");
          toggle(node, "shared", !dealt);
          node.style.left = `${lane.x + index * (lane.cardW + lane.gap)}px`;
          node.style.top = `${lane.y}px`;
          this.#runs.append(node);

          if (fresh && dealt) {
            node.animate(
              [
                { opacity: 0, translate: "0 -8px" },
                { opacity: 1, translate: "0 0" },
              ],
              {
                delay: index * 120,
                duration: this.#reduced ? 120 : 360,
                fill: "backwards",
              }
            );
            this.#sound.card((index * 120) / 1000);
          }
        }
      }
    }
  }

  #dealToBoard(node: HTMLDivElement, index: number, order: number, geo: Geo) {
    if (this.#reduced) {
      node.animate([{ opacity: 0 }, { opacity: 1 }], {
        delay: order * 60,
        duration: 160,
        fill: "backwards",
      });
      this.#sound.card();

      return;
    }

    const delay = order * 150;
    const spot = geo.board[index] ?? geo.deck;
    const from = { x: geo.deck.x - spot.x, y: geo.deck.y - spot.y };
    const face = node.querySelector<HTMLElement>(".face");
    const back = node.querySelector<HTMLElement>(".back");

    const flip = {
      delay,
      duration: 560,
      easing: "cubic-bezier(.3,.7,.3,1)",
      fill: "backwards",
    } as const;

    node.animate(
      [
        {
          opacity: 0,
          transform: `translate(${from.x}px, ${from.y}px) scale(.55)`,
        },
        {
          offset: 0.55,
          opacity: 1,
          transform: `translate(${from.x * 0.3}px, ${from.y * 0.3 - 10}px) scale(.9)`,
        },
        { opacity: 1, transform: "none" },
      ],
      {
        delay,
        duration: 380,
        easing: "cubic-bezier(.2,.8,.3,1)",
        fill: "backwards",
      }
    );
    face?.animate(
      [
        { transform: "rotateY(180deg)" },
        { offset: 0.45, transform: "rotateY(180deg)" },
        { transform: "none" },
      ],
      flip
    );
    back?.animate(
      [
        { transform: "none" },
        { offset: 0.45, transform: "none" },
        { transform: "rotateY(180deg)" },
      ],
      flip
    );
    this.#sound.card(delay / 1000);
    this.#sound.flip(delay / 1000 + 0.3);
  }

  #onEvent(happening: Happening) {
    const geo = this.#geo;
    const snapshot = this.#snap;

    if (geo === null || snapshot === null) {
      return;
    }

    HappeningSchema.match(happening, {
      Bet: ({ added, allIn, seat, to }) => {
        this.#onBet(seat, to, added, allIn);
      },
      Call: ({ added, allIn, seat }) => {
        this.#betFlight(seat, added, allIn ? 7 : 3);
        this.#tag(
          seat,
          allIn ? `All in ${formatChips(added)}` : `Call ${formatChips(added)}`,
          allIn ? "hot" : ""
        );
      },
      Check: ({ seat }) => {
        this.#tag(seat, "Check", "");
        this.#nod(seat);
        this.#sound.knock();
      },
      Collect: () => {
        this.#collect();
      },
      Deal: ({ cards, seat }) => {
        this.#deal(seat, cards, geo);
      },
      Fold: ({ seat }) => {
        this.#onFold(seat, geo);
      },
      Muck: ({ seat }) => {
        this.#tag(seat, "Muck", "quiet");
        this.#throwCards(seat, geo);
      },
      Post: ({ amount, label, seat }) => {
        this.#betFlight(seat, amount, 2);
        this.#tag(seat, label, "quiet");
      },
      Return: ({ amount, seat }) => {
        this.#returnFlight(seat, amount);
      },
      Say: ({ seat, text }) => {
        this.#tag(seat, text, "");
      },
      Show: ({ label, seat }) => {
        this.#onShow(seat, label);
      },
      Start: () => {
        this.#lastTick = -1;
      },
      Win: ({ amount, seat }) => {
        this.#award(seat, amount);
      },
    });
  }

  #onBet(seat: number, to: number, added: number, allIn: boolean) {
    const facing = Math.max(
      0,
      ...[...this.#piles.entries()].flatMap(([other, pile]) =>
        other === seat ? [] : [pile.shown]
      )
    );

    const word = facing > 0 ? "Raise to" : "Bet";

    const text = allIn
      ? `All in ${formatChips(to)}`
      : `${word} ${formatChips(to)}`;

    this.#betFlight(seat, added, allIn ? 7 : 5);
    this.#tag(seat, text, allIn ? "hot" : "");

    if (seat === this.#snap?.heroSeat) {
      this.#selfScale.kick(3);
      this.#sound.buzz([15]);
    } else {
      const tile = this.#tiles.get(seat);

      tile?.scale.kick(allIn ? 3.5 : 2);
      this.#leanIn(seat, allIn ? 1.6 : 1);
    }

    if (allIn) {
      const now = performance.now();

      for (const other of this.#tiles.values()) {
        if (other.seat !== seat) {
          other.surpriseUntil = now + 1600;
        }
      }

      this.#sound.buzz([20, 50, 30]);
    }
  }

  #onFold(seat: number, geo: Geo) {
    if (seat === this.#snap?.heroSeat) {
      this.#muckHero(geo);
      this.#tag(seat, "Fold", "quiet");

      return;
    }

    this.#tag(seat, "Fold", "quiet");
    this.#throwCards(seat, geo);
  }

  #onShow(seat: number, label: string) {
    if (seat === this.#snap?.heroSeat) {
      this.#hand.classList.add("open");
      this.#hand.classList.remove("peek");

      if (label !== "") {
        this.#handLabel.textContent = label;
        this.#handLabel.classList.add("on");
      }
    } else if (label !== "") {
      this.#tag(seat, label, "", Infinity);
    }

    this.#sound.flip();
  }

  #throwCards(seat: number, geo: Geo) {
    const tile = this.#tiles.get(seat);

    if (tile === undefined) {
      return;
    }

    for (let index = 0; index < 2; index += 1) {
      const card = el("div", "fly fcard");

      card.append(cardEl(null, 30));
      this.#fly(
        card,
        { x: tile.x.x + geo.tile * 0.36, y: tile.y.x + geo.tile * 0.5 },
        geo.deck,
        {
          arc: -40,
          delay: index * 50,
          duration: 380,
          fade: true,
          scaleTo: 0.6,
          spin: -160,
        }
      );
    }

    this.#sound.card();
  }

  #deal(seat: number, cards: number, geo: Geo) {
    const hero = seat === this.#snap?.heroSeat;
    const tile = this.#tiles.get(seat);

    const target = hero
      ? geo.hand
      : {
          x: (tile?.x.x ?? 0) + geo.tile * 0.36,
          y: (tile?.y.x ?? 0) + geo.tile * 0.5,
        };

    for (let index = 0; index < cards; index += 1) {
      const card = el("div", "fly fcard");

      this.#hold(`deal:${seat}`);
      card.append(cardEl(null, 30));
      this.#fly(card, geo.deck, target, {
        arc: -30,
        delay: index * 120,
        duration: 300,
        fade: !hero,
        scaleTo: hero ? 2.2 : 0.7,
        spin: 200,
      }).done(
        () => {
          this.#release(`deal:${seat}`);
        },
        () => {
          this.#release(`deal:${seat}`);
        }
      );
      this.#sound.card(index * 0.12);
    }
  }

  #tag(seat: number, text: string, tone: Tone, keepMs = ACT_MS) {
    const status =
      seat === this.#snap?.heroSeat
        ? this.#selfStatus
        : this.#tiles.get(seat)?.status;

    if (status !== undefined) {
      statusOn(status, text, tone, performance.now() + keepMs);
    }
  }

  #nod(seat: number) {
    this.#tiles
      .get(seat)
      ?.pic.animate(
        [{ translate: "0 0" }, { translate: "0 4%" }, { translate: "0 0" }],
        { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
  }

  #leanIn(seat: number, strength: number) {
    this.#tiles
      .get(seat)
      ?.pic.animate(
        [
          { scale: "1" },
          { scale: String(1 + 0.05 * strength) },
          { scale: "1" },
        ],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
  }

  #fly(
    node: HTMLElement,
    from: Pt,
    to: Pt,
    options: {
      readonly duration?: number;
      readonly delay?: number;
      readonly arc?: number;
      readonly spin?: number;
      readonly fade?: boolean;
      readonly scaleTo?: number;
      readonly scaleFrom?: number;
    }
  ): Flight {
    this.#fx.append(node);

    const scaleFrom = options.scaleFrom ?? 1;
    const scaleTo = options.scaleTo ?? 1;

    if (this.#reduced) {
      const quick = node.animate(
        [
          {
            opacity: 0,
            transform: `translate(${from.x}px, ${from.y}px) scale(${scaleFrom})`,
          },
          {
            opacity: options.fade === true ? 0 : 1,
            transform: `translate(${to.x}px, ${to.y}px) scale(${scaleTo})`,
          },
        ],
        {
          delay: Math.min(60, options.delay ?? 0),
          duration: 160,
          easing: "linear",
          fill: "both",
        }
      );

      return flightOf(quick, () => {
        node.remove();
      });
    }

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + (options.arc ?? -40);
    const steps = 8;

    const frames: Keyframe[] = Array.from({ length: steps + 1 }, (_, index) => {
      const u = index / steps;
      const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * midX + u * u * to.x;
      const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * midY + u * u * to.y;
      const scale = scaleFrom + (scaleTo - scaleFrom) * u;

      return {
        offset: u,
        opacity: options.fade === true ? 1 - u * u : 1,
        transform: `translate(${x}px, ${y}px) rotate(${(options.spin ?? 0) * u}deg) scale(${scale})`,
      };
    });

    const flight = node.animate(frames, {
      delay: options.delay ?? 0,
      duration: options.duration ?? 420,
      easing: "cubic-bezier(.25,.75,.3,1)",
      fill: "both",
    });

    return flightOf(flight, () => {
      node.remove();
    });
  }

  #flyChips(count: number, from: Pt, to: Pt, spread: number, done: () => void) {
    const land = countdown(
      count,
      () => {
        this.#sound.chips(Math.min(6, count + 1));
      },
      done
    );

    for (let index = 0; index < count; index += 1) {
      const chip = el("div", "fly fchip");

      this.#fly(
        chip,
        from,
        { x: to.x + jitter(index, spread), y: to.y },
        {
          arc: -30 - jitter(index + 3, 20) - 10,
          delay: index * 45,
          duration: 380,
          spin: 120,
        }
      ).done(land);
    }
  }

  #betFlight(seat: number, added: number, count: number) {
    const pile = this.#piles.get(seat);

    if (added <= 0 || pile === undefined) {
      return;
    }

    this.#hold(`bet:${seat}`);
    this.#flyChips(
      count,
      this.#chipSource(seat),
      this.#pilePoint(seat),
      6,
      () => {
        this.#release(`bet:${seat}`);
        pile.root.animate(
          [
            { transform: `${pile.root.style.transform} scale(1.15)` },
            { transform: pile.root.style.transform },
          ],
          { duration: 220, easing: "ease-out" }
        );
      }
    );
  }

  #returnFlight(seat: number, amount: number) {
    if (amount > 0) {
      this.#hold(`stack:${seat}`);
      this.#flyChips(
        3,
        this.#pilePoint(seat),
        this.#chipSource(seat),
        6,
        () => {
          this.#release(`stack:${seat}`);
        }
      );
    }
  }

  #collect() {
    const geo = this.#geo;

    if (geo === null) {
      return;
    }

    const filled = [...this.#piles].filter(([, pile]) => pile.shown > 0);
    const chipsPerPile = 4;

    this.#hold("pot");

    if (filled.length === 0) {
      this.#release("pot");

      return;
    }

    const land = countdown(
      filled.length * chipsPerPile,
      () => {
        this.#sound.chips(5, 0, 0.8);
      },
      () => {
        this.#release("pot");
      }
    );

    for (const [seat, pile] of filled) {
      const from = this.#pilePoint(seat);

      pile.shown = 0;
      pile.root.classList.add("empty");

      for (let index = 0; index < chipsPerPile; index += 1) {
        this.#fly(
          el("div", "fly fchip"),
          from,
          { x: geo.pot.x, y: geo.pot.y - 14 },
          {
            arc: -20,
            delay: index * 40 + jitter(index + seat, 60) + 30,
            duration: 460,
          }
        ).done(land);
      }
    }
  }

  #award(seat: number, amount: number) {
    const geo = this.#geo;
    const snapshot = this.#snap;

    if (geo === null || snapshot === null) {
      return;
    }

    if ([...this.#piles.values()].some(({ shown }) => shown > 0)) {
      this.#collect();
    }

    const hero = seat === snapshot.heroSeat;
    const face = this.#tilePoint(seat);
    const reach = (hero ? geo.self.size : geo.tile) / 2 + geo.caption * 0.62;
    const to = { x: face.x, y: face.y + reach };
    const count = hero ? 16 : 9;

    const land = countdown(
      count,
      () => {
        this.#sound.chips(4);
      },
      () => {
        this.#release(`stack:${seat}`);
      }
    );

    this.#winner = seat;
    this.#hold(`stack:${seat}`);
    this.#pot.set(0, performance.now());

    for (let index = 0; index < count; index += 1) {
      const chip = el("div", "fly fchip");

      this.#fly(
        chip,
        { x: geo.pot.x + jitter(index, 16), y: geo.pot.y - 10 },
        { x: to.x + jitter(index + 5, 7), y: to.y + jitter(index + 9, 5) },
        {
          arc: hero ? 80 : -60,
          delay: index * (hero ? 42 : 36),
          duration: hero ? 720 : 560,
          fade: true,
          scaleTo: 0.7,
          spin: 300,
        }
      ).done(land);
    }

    this.#gutLosers(seat);

    if (hero) {
      this.#heroWins(amount, geo);
    } else {
      const tile = this.#tiles.get(seat);

      if (tile !== undefined) {
        tile.joyUntil = performance.now() + 2400;
        tile.scale.kick(2);
      }

      this.#tag(seat, `+${formatChips(amount)}`, "win", 3600);
      this.#sound.chips(10, 0.2, 0.7);
    }
  }

  #gutLosers(winner: number) {
    const snapshot = this.#snap;
    const now = performance.now();

    if (snapshot === null) {
      return;
    }

    for (const info of snapshot.seats) {
      const lost = info.seat !== winner && info.shown.length > 0;
      const tile = this.#tiles.get(info.seat);

      if (lost && info.seat === snapshot.heroSeat) {
        this.#heroGuttedUntil = now + 2600;
      } else if (lost && tile !== undefined) {
        tile.surpriseUntil = now + 2600;
      }
    }
  }

  #heroWins(amount: number, geo: Geo) {
    const now = performance.now();
    const banner = el("div", "banner", this.#fx);

    this.#tag(
      this.#snap?.heroSeat ?? -1,
      `+${formatChips(amount)}`,
      "win",
      3600
    );
    this.#handLabel.classList.remove("on");
    this.#heroWinUntil = now + 4200;
    this.#sound.win();
    this.#sound.buzz([30, 40, 30, 40, 70]);
    this.#selfScale.kick(6);
    banner.style.left = `${geo.banner.x}px`;
    banner.style.top = `${geo.banner.y}px`;
    el("div", "k", banner, "You win");
    el("div", "v", banner, formatChips(amount));

    const showing = banner.animate(
      [
        { opacity: 0, transform: "translate(-50%, -30%) scale(.9)" },
        {
          offset: 0.12,
          opacity: 1,
          transform: "translate(-50%, -50%) scale(1)",
        },
        {
          offset: 0.85,
          opacity: 1,
          transform: "translate(-50%, -50%) scale(1)",
        },
        { opacity: 0, transform: "translate(-50%, -62%) scale(1)" },
      ],
      { duration: 3400, easing: "ease-out", fill: "both" }
    );

    flightOf(showing, () => {
      banner.remove();
    });
  }

  #muckHero(geo: Geo) {
    const host = this.getBoundingClientRect();

    for (const [index, holder] of this.#handCards.entries()) {
      const box = holder.getBoundingClientRect();

      if (box.width === 0) {
        return;
      }

      const from = {
        x: box.left - host.left + box.width / 2,
        y: box.top - host.top + box.height / 2,
      };

      const card = el("div", "fly");
      const face = cardEl(null, geo.handCardW);

      face.style.margin = `${-geo.handCardW * 0.7}px 0 0 ${-geo.handCardW / 2}px`;
      card.append(face);
      this.#fly(card, from, geo.deck, {
        arc: -30,
        delay: index * 40,
        duration: 420,
        fade: true,
        scaleTo: 0.35,
        spin: index === 0 ? -40 : 40,
      });
    }

    this.#hand.style.transform = "";
    this.#hand.classList.remove("armed", "peek");
    this.#sound.card();
    this.#sound.buzz([12]);
  }

  readonly #onHandDown = (event: PointerEvent) => {
    const snapshot = this.#snap;

    if (snapshot === null || this.#hand.classList.contains("gone")) {
      return;
    }

    this.#sound.unlock();

    if (this.#canAct() && snapshot.legal?.show === true) {
      this.#act(TableIntents.Show.make({}));

      return;
    }

    if (this.#hand.classList.contains("open")) {
      return;
    }

    this.#hand.setPointerCapture(event.pointerId);
    this.#handG = {
      dx: 0,
      dy: 0,
      id: event.pointerId,
      lastT: event.timeStamp,
      lastY: event.clientY,
      mode: "press",
      origin: event.target,
      t0: event.timeStamp,
      vy: 0,
      x0: event.clientX,
      y0: event.clientY,
    };
    this.#hand.style.transition = "none";
    this.#pressPeek = true;
    this.#syncPeek();
  };

  readonly #onHandEnter = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      this.#hoverPeek = true;
      this.#syncPeek();
    }
  };

  readonly #onHandLeave = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      this.#hoverPeek = false;
      this.#syncPeek();
    }
  };

  #canThrowAway() {
    const legal = this.#snap?.legal;

    return (
      this.#canAct() &&
      legal !== undefined &&
      legal !== null &&
      (legal.fold || legal.muck)
    );
  }

  readonly #onHandMove = (event: PointerEvent) => {
    const gesture = this.#handG;

    if (gesture === null || gesture.id !== event.pointerId) {
      return;
    }

    gesture.dx = event.clientX - gesture.x0;
    gesture.dy = event.clientY - gesture.y0;

    const dt = Math.max(1, event.timeStamp - gesture.lastT);

    gesture.vy =
      gesture.vy * 0.6 + ((event.clientY - gesture.lastY) / dt) * 0.4;
    gesture.lastY = event.clientY;
    gesture.lastT = event.timeStamp;

    if (
      gesture.mode === "press" &&
      (gesture.dy < -14 || Math.abs(gesture.dx) > 22)
    ) {
      gesture.mode = "drag";
      this.#hand.classList.add("dragging");
      this.#pressPeek = false;
      this.#syncPeek();
      this.#updateHints();
    }

    if (gesture.mode === "drag") {
      this.#dragHand(gesture);
    }
  };

  #dragHand(gesture: HandGesture) {
    const away = this.#canThrowAway();
    const ty = away && gesture.dy < 0 ? gesture.dy : rubber(gesture.dy);
    const tx = rubber(gesture.dx);
    const armed = away && gesture.dy < -FOLD_DISTANCE;
    const word = this.#snap?.legal?.fold === true ? "fold" : "muck";

    this.#hand.style.transform = `translate(${tx}px, ${ty}px) rotate(${tx * 0.08}deg)`;

    if (armed !== this.#hand.classList.contains("armed")) {
      this.#hand.classList.toggle("armed", armed);

      if (armed) {
        this.#sound.buzz([8]);
      }
    }

    if (away) {
      const resting = word === "fold" ? "Fold" : "Muck";

      this.#handLabel.textContent = armed ? `Release to ${word}` : resting;
      toggle(this.#handLabel, "on", gesture.dy < -30);
    }
  }

  readonly #onHandEnd = (event: PointerEvent) => {
    const gesture = this.#handG;

    if (gesture === null || gesture.id !== event.pointerId) {
      return;
    }

    this.#handG = null;
    this.#hand.classList.remove("dragging");

    const fling =
      gesture.mode === "drag" && gesture.dy < -50 && gesture.vy < -0.9;

    const thrown =
      gesture.mode === "drag" && (gesture.dy < -FOLD_DISTANCE || fling);

    if (event.type === "pointerup" && this.#canThrowAway() && thrown) {
      this.#throwAway();

      return;
    }

    const quick =
      gesture.mode === "press" && event.timeStamp - gesture.t0 <= 250;

    if (
      event.type === "pointerup" &&
      quick &&
      this.#showAfterHand(gesture.origin)
    ) {
      this.#pressPeek = false;
      this.#syncPeek();

      return;
    }

    if (gesture.mode === "press" && !quick) {
      this.#learn("Peek");
    }

    this.#pressPeek = false;
    this.#syncPeek();
    this.#hand.classList.remove("armed");
    this.#handLabel.classList.remove("on");
    this.#hand.style.transition = "transform .45s cubic-bezier(.2,1.5,.4,1)";
    this.#hand.style.transform = "";
  };

  #throwAway() {
    const legal = this.#snap?.legal;

    this.#learn("Fold");
    this.#act(
      legal?.fold === true
        ? TableIntents.Fold.make({})
        : TableIntents.Muck.make({})
    );
  }

  #syncPeek() {
    const me = this.#seat(this.#snap?.heroSeat ?? null);

    const holding =
      me !== undefined &&
      me.status !== "Folded" &&
      !this.#hand.classList.contains("gone") &&
      !this.#hand.classList.contains("open");

    const dragging = this.#handG?.mode === "drag";

    this.#setPeek(
      holding &&
        !dragging &&
        (this.#pressPeek || this.#hoverPeek || this.#keyPeek)
    );
  }

  #setPeek(on: boolean) {
    if (this.#peekOn === on) {
      return;
    }

    this.#peekOn = on;
    this.#peekChangedAt = performance.now();
    toggle(this.#hand, "peek", on);

    if (on) {
      this.#sound.flip();
      this.#sound.buzz([6]);
    }
  }

  readonly #onBlur = () => {
    this.#keyPeek = false;
    this.#hoverPeek = false;
    this.#syncPeek();
  };

  readonly #onKeyUp = (event: KeyboardEvent) => {
    if (event.key === " ") {
      this.#keyPeek = false;
      this.#syncPeek();
      this.#learn("Peek");
    }
  };

  #reactionKey(event: KeyboardEvent) {
    if (this.#pickerOpen) {
      const chosen = REACTIONS[Number(event.key) - 1];

      if (event.key === "Escape" || event.key.toLowerCase() === REACTION_KEY) {
        this.#closePicker();
      } else if (chosen !== undefined) {
        this.#react(chosen);
      }

      return true;
    }

    if (event.key.toLowerCase() === REACTION_KEY && !event.repeat) {
      this.#openPicker();

      return true;
    }

    return false;
  }

  readonly #onKeyDown = (event: KeyboardEvent) => {
    if (isShortcutOrTyping(event)) {
      return;
    }

    if (this.#snap !== null && this.#reactionKey(event)) {
      event.preventDefault();

      return;
    }

    if (this.#snap?.heroSeat === null) {
      return;
    }

    if (event.key === " ") {
      event.preventDefault();

      if (!event.repeat) {
        this.#sound.unlock();
        this.#keyPeek = true;
        this.#syncPeek();
      }

      return;
    }

    if (event.key === "Escape") {
      this.#endKeySize();

      return;
    }

    if (this.#canVote()) {
      this.#voteKey(event);

      return;
    }

    if (this.#canAct() && /^[fckr0-9]$/u.test(event.key.toLowerCase())) {
      this.#learn("Keys");
    }

    const legal = this.#snap?.legal;

    if (legal === undefined || legal === null || !this.#canAct()) {
      return;
    }

    this.#sound.unlock();

    if (legal.show || legal.muck) {
      this.#showdownKey(event, legal);
    } else if (this.#keySize === null) {
      this.#bettingKey(event, legal);
    } else {
      event.preventDefault();
      this.#keySizeKey(event.key);
    }
  };

  #voteKey(event: KeyboardEvent) {
    const most = this.#snap?.runVote ?? 1;
    const runs = event.key === "Enter" ? 1 : Number(event.key);

    if (Number.isInteger(runs) && runs >= 1 && runs <= most) {
      event.preventDefault();
      this.#sound.unlock();
      this.#act(TableIntents.Runs.make({ runs }));
    }
  }

  #showdownKey(event: KeyboardEvent, legal: HeroLegal) {
    const key = event.key.toLowerCase();

    if (legal.show && (key === "enter" || key === "s")) {
      event.preventDefault();
      this.#act(TableIntents.Show.make({}));
    } else if (legal.muck && key === "f") {
      event.preventDefault();
      this.#act(TableIntents.Muck.make({}));
    }
  }

  #bettingKey(event: KeyboardEvent, legal: HeroLegal) {
    const key = event.key.toLowerCase();

    if (key === "f") {
      this.#learn("Fold");
      this.#act(TableIntents.Fold.make({}));
    } else if (key === "c" || key === "k") {
      if (!legal.check && legal.call === null) {
        nudge(this.#chip);

        return;
      }

      this.#chip.animate([{ scale: "0.92" }, { scale: "1" }], {
        duration: 220,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
      this.#act(
        legal.check ? TableIntents.Check.make({}) : TableIntents.Call.make({})
      );
    } else if (key === "r" || /^[0-9]$/u.test(key)) {
      if (legal.raise === null) {
        nudge(this.#chip);

        return;
      }

      event.preventDefault();
      this.#startKeySize(/^[0-9]$/u.test(key) ? key : "");
    }
  }

  #canVote() {
    return (
      this.#snap?.runVote !== null &&
      this.#snap?.runVote !== undefined &&
      !this.#locked
    );
  }

  #sizing(): Sizing | null {
    const snapshot = this.#snap;

    if (snapshot === null) {
      return null;
    }

    if (snapshot.runVote !== null) {
      return runSizing(snapshot.runVote);
    }

    const raise = snapshot.legal?.raise;
    const me = this.#seat(snapshot.heroSeat);

    if (raise === undefined || raise === null || me === undefined) {
      return null;
    }

    const toCall = snapshot.legal?.call ?? 0;

    return raiseSizing({
      bigBlind: snapshot.bigBlind,
      callTo: me.bet + toCall,
      isBet: raise.isBet,
      max: raise.max,
      min: raise.min,
      potTotal: sum(snapshot.pots) + sum(snapshot.seats.map(({ bet }) => bet)),
      toCall,
    });
  }

  #startKeySize(typed: string) {
    const spot = this.#sizing();

    if (spot === null) {
      return;
    }

    this.#keySize = { detent: null, typed, value: spot.min };
    this.#chip.style.transition = "transform .18s cubic-bezier(.2,.8,.2,1)";
    this.#openRail(spot);
    this.#rail.classList.add("keyed");
    this.#paintKeySize(spot);
    this.#updateHints();
  }

  #keySizeKey(key: string) {
    const sizing = this.#keySize;
    const spot = this.#sizing();

    if (sizing === null || spot === null) {
      return;
    }

    if (key === "Enter") {
      const value = clamp(keyValue(sizing), spot.min, spot.max);

      this.#endKeySize();
      this.#commit(spot, value);

      return;
    }

    if (/^[0-9]$/u.test(key)) {
      sizing.typed =
        sizing.typed.length < 9
          ? `${sizing.typed === "0" ? "" : sizing.typed}${key}`
          : sizing.typed;
    } else if (key === "Backspace") {
      sizing.typed = sizing.typed.slice(0, -1);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      this.#stepDetent(sizing, spot, key === "ArrowUp");
    } else if (key.toLowerCase() === "r") {
      sizing.typed = "";
      sizing.value = spot.min;
      sizing.detent = null;
    } else {
      return;
    }

    this.#paintKeySize(spot);
  }

  #stepDetent(sizing: KeySizing, spot: Sizing, up: boolean) {
    const current = keyValue(sizing);
    const { detents } = spot;

    const pick = up
      ? detents.find(({ value }) => value > current)
      : detents.toReversed().find(({ value }) => value < current);

    const fallback = up ? spot.max : spot.min;

    sizing.typed = "";
    sizing.value = pick?.value ?? fallback;
    sizing.detent = pick?.label ?? null;
    this.#sound.tick(true);
  }

  #paintKeySize(spot: Sizing) {
    const geo = this.#geo;
    const sizing = this.#keySize;

    if (geo === null || sizing === null) {
      return;
    }

    const typed = keyValue(sizing);
    const value = clamp(typed, spot.min, spot.max);

    const detent =
      sizing.typed === ""
        ? sizing.detent
        : (spot.detents.find((entry) => entry.value === value)?.label ?? null);

    const length = geo.chip.y - LINE - geo.railTop;

    this.#paintSize(spot, {
      detent,
      lift: LINE + positionOf(value, spot.min, spot.max) * length,
      typed,
      value,
    });
  }

  #endKeySize() {
    if (this.#keySize === null) {
      return;
    }

    this.#keySize = null;
    this.#rail.classList.remove("keyed");
    this.#closeRail();
    this.#chip.style.transition = "transform .4s cubic-bezier(.2,1.4,.4,1)";
    this.#chip.style.transform = "";
    this.#render();
  }

  #renderKeys(
    legal: HeroLegal | null,
    me: SeatSnapshot | undefined,
    holding: boolean
  ) {
    const sizing = this.#keySize !== null || this.#chipG !== null;
    const parts: HTMLSpanElement[] = [];

    toggle(
      this.#handKeysEl,
      "on",
      holding &&
        !sizing &&
        !this.#learned("Peek") &&
        !this.#hand.classList.contains("open") &&
        legal?.show !== true
    );

    parts.push(
      ...keyParts(this.#canVote() ? (this.#snap?.runVote ?? 0) : 0, legal, me)
    );

    const signature = parts.map((part) => part.textContent).join("|");

    if (this.#keysEl.dataset.keys !== signature) {
      this.#keysEl.dataset.keys = signature;
      this.#keysEl.replaceChildren(...parts);
    }

    toggle(
      this.#keysEl,
      "on",
      parts.length > 0 && !sizing && !this.#learned("Keys")
    );
  }

  readonly #onChipDown = (event: PointerEvent) => {
    this.#sound.unlock();

    const legal = this.#snap?.legal;

    const betting =
      this.#canAct() &&
      legal !== undefined &&
      legal !== null &&
      !legal.show &&
      !legal.muck;

    if (!betting && !this.#canVote()) {
      nudge(this.#chip);

      return;
    }

    this.#chip.setPointerCapture(event.pointerId);
    this.#chipG = {
      detent: null,
      dy: 0,
      id: event.pointerId,
      mode: "press",
      value: 0,
      y0: event.clientY,
    };
    this.#chip.style.transition = "none";
    this.#chip.animate([{ scale: "1" }, { scale: "0.94" }], {
      duration: 90,
      fill: "forwards",
    });
  };

  readonly #onChipMove = (event: PointerEvent) => {
    const gesture = this.#chipG;

    if (gesture === null || gesture.id !== event.pointerId) {
      return;
    }

    gesture.dy = gesture.y0 - event.clientY;

    const spot = this.#sizing();

    if (gesture.mode === "press" && gesture.dy > 16 && spot !== null) {
      gesture.mode = "size";
      this.#openRail(spot);
      this.#updateHints();
    }

    if (gesture.mode !== "size") {
      return;
    }

    if ((!this.#canAct() && !this.#canVote()) || spot === null) {
      this.#chipG = null;
      this.#closeRail();
      this.#chip.style.transform = "";
      this.#render();

      return;
    }

    this.#sizeTo(gesture, spot);
  };

  readonly #onChipEnd = (event: PointerEvent) => {
    const gesture = this.#chipG;

    if (gesture === null || gesture.id !== event.pointerId) {
      return;
    }

    this.#chipG = null;

    for (const animation of this.#chip.getAnimations()) {
      animation.cancel();
    }

    const spot = this.#sizing();

    const released =
      event.type === "pointerup" && (this.#canAct() || this.#canVote());

    if (released && gesture.mode === "press" && Math.abs(gesture.dy) < 14) {
      this.#tapChip();
    } else if (
      released &&
      gesture.mode === "size" &&
      gesture.dy > LINE &&
      spot !== null
    ) {
      this.#commit(spot, gesture.value);
    }

    this.#closeRail();
    this.#chip.style.transition = "transform .4s cubic-bezier(.2,1.4,.4,1)";
    this.#chip.style.transform = "";
    this.#render();
  };

  readonly #onChipClick = (event: MouseEvent) => {
    if (event.detail === 0) {
      this.#tapChip();
    }
  };

  #tapChip() {
    const legal = this.#snap?.legal;

    if (this.#canVote()) {
      this.#act(TableIntents.Runs.make({ runs: 1 }));
    } else if (!this.#canAct() || legal === undefined || legal === null) {
      nudge(this.#chip);
    } else if (legal.check) {
      this.#act(TableIntents.Check.make({}));
    } else if (legal.call !== null) {
      this.#act(TableIntents.Call.make({}));
    }
  }

  #commit(spot: Sizing, value: number) {
    if (spot.lesson !== null) {
      this.#learn(spot.lesson);
    }

    this.#act(spot.commit(clamp(value, spot.min, spot.max)));
  }

  #openRail(spot: Sizing) {
    const geo = this.#geo;

    if (geo === null) {
      return;
    }

    this.#rail.classList.add("on");
    this.#keysEl.classList.remove("on");
    this.#handKeysEl.classList.remove("on");

    for (const detent of this.#detentEls) {
      detent.remove();
    }

    const length = geo.chip.y - LINE - geo.railTop;

    this.#detentEls = spot.detents.map((detent) => {
      const node = el("div", "det", this.#rail, `${detent.label} `);

      if (spot.typing) {
        el("b", "", node, spot.amount(detent.value));
      }

      node.style.right = `${geo.w - geo.chip.x + 6}px`;
      node.style.top = `${geo.chip.y - LINE - detent.t * length}px`;
      node.dataset.label = detent.label;

      return node;
    });
  }

  #closeRail() {
    this.#rail.classList.remove("on");
    this.#railFill.style.height = "0px";
  }

  #sizeTo(gesture: ChipGesture, spot: Sizing) {
    const geo = this.#geo;

    if (geo === null) {
      return;
    }

    const length = geo.chip.y - LINE - geo.railTop;
    const lift = clamp(gesture.dy, 0, length + LINE);
    const t = clamp((gesture.dy - LINE) / length, 0, 1);

    const hit = spot.detents.findLast(
      (detent) => Math.abs(detent.t - t) < DETENT_SNAP
    );

    const value =
      hit?.value ?? nearestOnLadder(spot.ladder, t, spot.min, spot.max);

    const detent = hit?.label ?? null;

    if (detent !== null && detent !== gesture.detent) {
      this.#sound.buzz([7]);
    }

    if (value !== gesture.value) {
      this.#sound.tick(detent !== null);
    }

    Object.assign(gesture, { detent, value });
    this.#paintSize(spot, { detent, lift, typed: value, value });
  }

  #paintSize(
    spot: Sizing,
    paint: {
      readonly value: number;
      readonly detent: string | null;
      readonly lift: number;
      readonly typed: number;
    }
  ) {
    const geo = this.#geo;

    if (geo === null) {
      return;
    }

    const above = paint.lift > LINE || this.#keySize !== null;
    const keyed = this.#keySize !== null;
    const low = paint.typed < spot.min;
    const high = paint.typed > spot.max;

    this.#chip.style.transform = `translateY(${-paint.lift}px)`;
    Object.assign(this.#railFill.style, {
      height: `${paint.lift}px`,
      top: `${geo.chip.y - paint.lift}px`,
    });

    for (const node of this.#detentEls) {
      toggle(node, "hit", node.dataset.label === paint.detent);
    }

    this.#readout.style.opacity = above ? "1" : "0";
    this.#cancel.style.opacity = above ? "0" : "1";
    this.#readKind.textContent = spot.heading(paint.value);
    this.#readValue.textContent = spot.amount(
      keyed ? paint.typed : paint.value
    );
    toggle(this.#readout, "off", keyed && (low || high));
    this.#readNote.replaceChildren(...keyNote(spot, keyed, low, high));
    this.#chipA.textContent = above ? spot.word(paint.value) : "";
    this.#chipB.textContent = above ? spot.amount(paint.value) : "";
  }

  #learn(hint: Hint) {
    if (this.#taught.has(hint) || this.#snap?.learned.includes(hint) === true) {
      return;
    }

    this.#taught.add(hint);
    this.#emit(TableIntents.Learned.make({ hint }));
    this.#updateHints();
  }

  #learned(hint: Hint) {
    return (
      this.#taught.has(hint) || this.#snap?.learned.includes(hint) === true
    );
  }

  #showHint(hint: Hint, on: boolean, point: Pt) {
    const node = this.#hints.get(hint);

    if (node === undefined) {
      return;
    }

    toggle(node, "on", on);

    if (on) {
      node.style.left = `${point.x}px`;
      node.style.top = `${point.y}px`;
    }
  }

  #bettingTurn() {
    const legal = this.#snap?.legal ?? null;

    return this.#canAct() && legal !== null && !legal.show && !legal.muck;
  }

  #busy() {
    return (
      this.#chipG !== null || this.#handG !== null || this.#keySize !== null
    );
  }

  #holdsCards() {
    const me = this.#seat(this.#snap?.heroSeat ?? null);

    return (
      !this.#hand.classList.contains("gone") &&
      me !== undefined &&
      me.status !== "Folded"
    );
  }

  #peekHintDue() {
    return (
      this.#holdsCards() &&
      !this.#learned("Peek") &&
      !this.#peekOn &&
      !this.#hand.classList.contains("open") &&
      !this.#hand.classList.contains("offering")
    );
  }

  #updateHints() {
    const snapshot = this.#snap;
    const geo = this.#geo;

    if (snapshot === null || geo === null) {
      return;
    }

    const { legal } = snapshot;
    const betting = this.#bettingTurn();
    const busy = this.#busy();

    const peekOn = this.#peekHintDue() && !betting;

    const raiseOn = betting && legal?.raise !== null && !this.#learned("Raise");

    const foldOn =
      betting && !this.#learned("Fold") && this.#learned("Peek") && !raiseOn;

    this.#showHint("Peek", peekOn && !busy, geo.handKeys);
    this.#showHint("Fold", foldOn && !busy, geo.handKeys);

    if ((peekOn || foldOn) && !busy) {
      this.#handKeysEl.classList.remove("on");
    }

    this.#showHint("Raise", raiseOn && !busy, {
      x: clamp(geo.chip.x - 40, 110, geo.w - 110),
      y: clamp(
        geo.strip.y + geo.strip.h + 12,
        geo.chip.y - geo.chip.size / 2 - 92,
        geo.chip.y - geo.chip.size / 2 - 24
      ),
    });
    this.#ghostHint(raiseOn && !busy && !this.#reduced, geo);
  }

  #ghostHint(on: boolean, geo: Geo) {
    if (on) {
      this.#ghost.style.left = `${geo.chip.x}px`;
      this.#ghost.style.top = `${geo.chip.y}px`;
    }

    if (on && this.#ghostAnim === null) {
      this.#ghostAnim = this.#ghost.animate(
        [
          { opacity: 0, transform: "translateY(0) scale(.8)" },
          { offset: 0.15, opacity: 1, transform: "translateY(0) scale(1)" },
          { offset: 0.7, opacity: 1, transform: "translateY(-110px) scale(1)" },
          { opacity: 0, transform: "translateY(-130px) scale(.9)" },
        ],
        {
          delay: 300,
          duration: 1600,
          easing: "cubic-bezier(.4,0,.2,1)",
          iterations: Infinity,
        }
      );
    } else if (!on && this.#ghostAnim !== null) {
      this.#ghostAnim.cancel();
      this.#ghostAnim = null;
    }
  }

  #onHeroTurn() {
    this.#sound.turn();
    this.#sound.buzz([12, 70, 12]);

    if (this.#reduced) {
      return;
    }

    this.#selfScale.kick(2);
    this.#hand.animate(
      [{ translate: "0 0" }, { translate: "0 -10px" }, { translate: "0 0" }],
      {
        duration: 480,
        easing: "cubic-bezier(.3,1.4,.5,1)",
      }
    );
  }

  #frame(now: number) {
    const dt = Math.min(0.05, (now - this.#last) / 1000);

    this.#last = now;

    const snapshot = this.#snap;
    const geo = this.#geo;

    if (snapshot === null || geo === null) {
      return;
    }

    const clock = this.#clockFraction(snapshot, now);

    this.#frameTiles(snapshot, geo, dt, now, clock);
    this.#frameSelf(snapshot, dt, now, clock);
    expireStatus(this.#selfStatus, now);

    for (const tile of this.#tiles.values()) {
      expireStatus(tile.status, now);
      tile.stack.tick(now);
    }

    this.#selfStack.tick(now);
    this.#pot.tick(now);
    this.#sharePeek(now);
  }

  #clockFraction(snapshot: TableSnapshot, now: number) {
    const { clock } = snapshot;

    if (clock === null) {
      return { elapsed: 0, fraction: 1, tanking: false };
    }

    const remaining = Math.max(0, clock.remainingMs - (now - this.#clockAt));
    const elapsed = clock.totalMs - remaining;

    const tanking =
      clock.seat !== snapshot.heroSeat &&
      clock.seat === snapshot.toAct &&
      elapsed > 3500;

    if (tanking && now - this.#hushBeat > 1150) {
      this.#hushBeat = now;
      this.#sound.heartbeat();
    }

    if (
      clock.seat === snapshot.heroSeat &&
      snapshot.toAct === snapshot.heroSeat
    ) {
      const seconds = Math.ceil(remaining / 1000);

      if (seconds <= 5 && seconds > 0 && seconds !== this.#lastTick) {
        this.#lastTick = seconds;
        this.#sound.tick(true);
        this.#sound.buzz([5]);
      }
    }

    return {
      elapsed,
      fraction: clamp(remaining / Math.max(1, clock.totalMs), 0, 1),
      tanking,
    };
  }

  #frameTiles(
    snapshot: TableSnapshot,
    geo: Geo,
    dt: number,
    now: number,
    clock: { readonly fraction: number; readonly tanking: boolean }
  ) {
    const { tile } = geo;
    const activeScale = Math.min(1.26, 176 / tile);

    const someoneElse =
      snapshot.toAct !== null && snapshot.toAct !== snapshot.heroSeat;

    const boxes = this.#targets(
      snapshot,
      geo,
      activeScale,
      someoneElse,
      clock.tanking
    );

    for (const box of boxes) {
      const info = this.#seat(box.tile.seat);
      const active = snapshot.toAct === box.tile.seat;
      const target = box.tile;

      target.x.target = box.x;
      target.y.target = box.y;
      target.scale.target = box.scale;
      target.opacity.target = box.opacity;

      for (const spring of [target.x, target.y, target.scale, target.opacity]) {
        if (this.#reduced) {
          spring.settle(spring.target);
        } else {
          spring.step(dt);
        }
      }

      const transform = `translate3d(${(target.x.x - tile / 2).toFixed(2)}px, ${(target.y.x - tile / 2).toFixed(2)}px, 0) scale(${target.scale.x.toFixed(4)})`;

      if (transform !== target.lastTransform) {
        target.root.style.transform = transform;
        target.lastTransform = transform;
      }

      target.root.style.opacity = target.opacity.x.toFixed(3);
      toggle(target.root, "active", active);
      toggle(
        target.root,
        "unlit",
        snapshot.toAct !== null && !active && this.#winner !== target.seat
      );

      const onClock =
        snapshot.clock !== null &&
        snapshot.clock.seat === target.seat &&
        active &&
        info !== undefined;

      if (info !== undefined && info.status !== "Empty") {
        paintFace(
          target.pic,
          info.avatar,
          expressionFor({
            folded: info.status === "Folded" || info.status === "Out",
            gutted: target.surpriseUntil > now,
            happy: target.joyUntil > now,
            lookingDown: info.peeking,
            thinking: active,
          }),
          geo.tile
        );
      }

      toggle(target.root, "on-clock", onClock);

      if (onClock) {
        const pulse =
          clock.tanking && !this.#reduced
            ? 0.7 + Math.sin((now / 1000) * Math.PI * 1.6) * 0.3
            : 1;

        paintRing(target.ring, clock.fraction, pulse);
      }
    }
  }

  #targets(
    snapshot: TableSnapshot,
    geo: Geo,
    activeScale: number,
    someoneElse: boolean,
    tanking: boolean
  ) {
    const tileSize = geo.tile;

    const boxes = [...this.#tiles.values()].flatMap((tile) => {
      const info = this.#seat(tile.seat);
      const spot = geo.seats[tile.index];

      if (info === undefined || spot === undefined) {
        return [];
      }

      const active = snapshot.toAct === tile.seat;
      const folded = info.status === "Folded";
      const shrink = folded ? 0.07 : 0;
      const lean = active ? 0.05 : 0;
      const baseScale = someoneElse ? 0.95 : 1;

      const scale = tileScale({
        active,
        activeScale,
        baseScale,
        folded,
        winner: this.#winner === tile.seat,
      });

      const dimmed = tanking && !active ? dimmedOpacity(folded) : 1;

      return [
        {
          axis: spot.side === "top" ? ("x" as const) : ("y" as const),
          fixed: active,
          opacity: folded && !tanking ? 0.85 : dimmed,
          scale,
          tile,
          x: spot.x + spot.nx * tileSize * (lean - shrink),
          y: spot.y + spot.ny * tileSize * (lean * 0.8 - shrink),
        },
      ];
    });

    return separate(boxes, geo);
  }

  #frameSelf(
    snapshot: TableSnapshot,
    dt: number,
    now: number,
    clock: { readonly fraction: number }
  ) {
    const mine =
      snapshot.toAct !== null && snapshot.toAct === snapshot.heroSeat;

    const target = selfScaleFor(this.#heroWinUntil > now, mine);

    this.#selfScale.target = target;

    if (this.#reduced) {
      this.#selfScale.settle(target);
    } else {
      this.#selfScale.step(dt);
    }

    this.#self.style.transform = `scale(${this.#selfScale.x.toFixed(4)})`;
    toggle(
      this.#self,
      "unlit",
      snapshot.toAct !== null && !mine && this.#winner !== snapshot.heroSeat
    );
    toggle(this.#self, "peeking", this.#peekOn);

    const me = this.#seat(snapshot.heroSeat);

    if (me !== undefined) {
      paintFace(
        this.#selfPic,
        me.avatar,
        expressionFor({
          folded: me.status === "Folded" || me.status === "Out",
          gutted: this.#heroGuttedUntil > now,
          happy: this.#heroWinUntil > now,
          lookingDown: this.#peekOn || me.peeking,
          thinking: false,
        }),
        this.#geo?.self.size ?? 0
      );
    }

    const onClock =
      snapshot.clock !== null &&
      snapshot.clock.seat === snapshot.heroSeat &&
      mine;

    toggle(this.#self, "on-clock", onClock);

    if (onClock) {
      paintRing(this.#selfRing, clock.fraction, 1);
    }
  }
}

export const defineTable = () => {
  if (customElements.get(TABLE_TAG) === undefined) {
    customElements.define(TABLE_TAG, NostakesTable);
  }
};
