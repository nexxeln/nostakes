import { render } from "@nostakes/avatar";
import type { Avatar, Expression } from "@nostakes/avatar";
import { Effect } from "effect";

import "../../src/client/tokens.css";
import "../../src/client/app.css";
import "../../src/client/wordmark.css";
import { defineTable } from "../../src/client/table/element.js";
import { fairParagraph, fairSymbol } from "../../src/features/fairness-text.js";
import { CAST, RING } from "../../src/features/landing/cast.js";
import type { CastName } from "../../src/features/landing/cast.js";
import { BAD_BEAT } from "../../src/features/landing/night.js";
import { INVITE_PREVIEW } from "../../src/features/link-preview.js";
import { FairMarks } from "../../src/features/model.js";
import { pictureSvg } from "../../src/features/moments/picture.js";
import { settleUpSvg } from "../../src/features/pictures/settle-up.js";
import {
  TABLE_TAG,
  TableIntentSchema,
} from "../../src/features/table/snapshot.js";
import type {
  TableIntent,
  TableSnapshot,
} from "../../src/features/table/snapshot.js";
import {
  BOUNCY,
  POP,
  SOFT,
  clamp,
  eased,
  hashed,
  mixed,
  sprung,
} from "./motion.ts";
import type { SpringLook } from "./motion.ts";
import {
  DEFAULT_FELT,
  GESTURE_RAISE_FALLBACK,
  LITTLE_TOLD,
  SMALL_NIGHT,
  badBeatTold,
  fillTold,
  gestureStory,
  rulesTold,
} from "./scenes.ts";
import type { Cue } from "./scenes.ts";
import {
  BEAT_MS,
  CAPTIONS,
  FPS,
  HIT_BEAT,
  LITTLE_THINGS,
  OUTRO_BEAT,
  RULE_STAMPS,
  beatOfMs,
  littleStart,
} from "./timeline.ts";
import type { LittleScene } from "./timeline.ts";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Size {
  readonly w: number;
  readonly h: number;
}

interface Framing {
  readonly view: Size;
  readonly window: Box;
  readonly caption: Box;
  readonly pictureCaption: Box;
  readonly picture: Box;
  readonly native: Size;
  readonly captionPx: number;
  readonly align: "Centre" | "Start";
  readonly tall: boolean;
}

const FRAMINGS: Readonly<Record<"tall" | "wide", Framing>> = {
  tall: {
    align: "Centre",
    caption: { h: 196, w: 440, x: 30, y: 112 },
    captionPx: 54,
    native: { h: 620, w: 420 },
    picture: { h: 480, w: 384, x: 78, y: 258 },
    pictureCaption: { h: 140, w: 440, x: 30, y: 112 },
    tall: true,
    view: { h: 960, w: 540 },
    window: { h: 420, w: 440, x: 30, y: 318 },
  },
  wide: {
    align: "Start",
    caption: { h: 460, w: 330, x: 44, y: 40 },
    captionPx: 58,
    native: { h: 385, w: 660 },
    picture: { h: 490, w: 392, x: 70, y: 25 },
    pictureCaption: { h: 460, w: 400, x: 510, y: 40 },
    tall: false,
    view: { h: 540, w: 960 },
    window: { h: 476, w: 520, x: 400, y: 32 },
  },
};

const params = new URLSearchParams(globalThis.location.search);

const FRAMING = params.get("frame") === "tall" ? FRAMINGS.tall : FRAMINGS.wide;

const ROOM_CODE = "K7QF2M";

const ROOM_LINK = `nostakes.club/r/${ROOM_CODE}`;

const STAGE_CSS = `
html, body { margin: 0; width: ${FRAMING.view.w}px; height: ${FRAMING.view.h}px; overflow: hidden; background: var(--color-page); }
body { font-family: var(--font-body); font-weight: var(--weight-body); color: var(--color-ink); }
#stage { position: fixed; inset: 0; overflow: hidden; background: var(--color-page); }
.lv-layer { position: absolute; inset: 0; pointer-events: none; isolation: isolate; }
.lv-sheet { pointer-events: auto; position: absolute; border-radius: var(--radius-4); background: var(--color-raised); box-shadow: var(--shadow-sheet-3); overflow: hidden; will-change: transform; }
.lv-sheet.lv-bare { background: transparent; box-shadow: none; overflow: visible; }
.lv-backing { position: absolute; border-radius: var(--radius-4); box-shadow: var(--shadow-sheet-2); }
.lv-lens { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.lv-lens > nostakes-table { position: absolute; inset: 0; display: block; }
.lv-cap { position: absolute; display: flex; flex-wrap: wrap; align-content: center; gap: 0.04em 0.24em; }
.lv-cap.lv-centre { justify-content: center; text-align: center; }
.lv-cap.lv-start { justify-content: flex-start; text-align: left; }
.lv-word { display: inline-block; font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); line-height: 1.02; color: var(--color-ink); transform-origin: 50% 85%; }
.lv-stamp { position: absolute; left: 0; top: 0; padding: 0.3em 0.7em 0.36em; border-radius: var(--radius-3); box-shadow: var(--shadow-sheet-2); font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); color: var(--house-ink); white-space: nowrap; }
.lv-bit { position: absolute; left: 0; top: 0; box-shadow: var(--shadow-sheet-1); }
.lv-finger { pointer-events: none; position: absolute; z-index: 10; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: rgb(31 28 49 / 0.16); box-shadow: 0 0 0 2.5px rgb(255 253 248 / 0.95), 0 0 0 4px rgb(31 28 49 / 0.22); opacity: 0; }
.lv-chat { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 18px 18px 20px; gap: 12px; }
.lv-chat-head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; box-shadow: inset 0 -1px 0 var(--color-line); font-weight: var(--weight-strong); font-size: 15px; }
.lv-chat-faces { display: flex; }
.lv-chat-faces .lv-tile-face { width: 26px; height: 26px; margin-right: -7px; }
.lv-chat-head small { color: var(--color-ink-muted); font-weight: var(--weight-body); margin-left: auto; font-size: 13px; }
.lv-msg { display: flex; align-items: flex-end; gap: 9px; transform-origin: 0 100%; }
.lv-msg .lv-tile-face { width: 34px; height: 34px; flex: none; }
.lv-msg-body { display: flex; flex-direction: column; gap: 3px; }
.lv-msg-name { font-size: 12px; color: var(--color-ink-muted); font-weight: var(--weight-strong); padding-left: 3px; }
.lv-slip { padding: 9px 14px 10px; border-radius: var(--radius-3); background: var(--color-page); box-shadow: var(--shadow-sheet-1); font-size: 17px; font-weight: var(--weight-strong); }
.lv-link-card { width: 232px; border-radius: var(--radius-3); background: var(--color-page); box-shadow: var(--shadow-sheet-2); overflow: hidden; }
.lv-link-card img { display: block; width: 100%; aspect-ratio: 1200 / 630; }
.lv-link-card .lv-link-words { padding: 8px 11px 10px; display: flex; flex-direction: column; gap: 2px; }
.lv-link-card b { font-family: var(--font-display); font-weight: var(--weight-display); letter-spacing: var(--tracking-display); font-size: 15px; }
.lv-link-card span { font-size: 12px; color: var(--color-ink-muted); }
.lv-link-card .lv-link-url { color: var(--color-accent-ink); font-weight: var(--weight-strong); }
.lv-tile-face { position: relative; display: inline-block; line-height: 0; border-radius: var(--radius-face); background: var(--color-face); box-shadow: var(--shadow-sheet-1); }
.lv-tile-face svg { position: absolute; left: 0; top: -5%; width: 100%; height: 100%; overflow: visible; }
.lv-picture svg { display: block; width: 100%; height: 100%; }
.lv-end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; }
.lv-end .brand { margin: 0; transform-origin: 50% 60%; }
.lv-end-line { font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); color: var(--color-ink); }
.lv-end-sub { font-weight: var(--weight-strong); color: var(--color-ink-muted); }
.lv-end-cast { display: flex; justify-content: center; }
.lv-fair { position: absolute; inset: 0; display: flex; flex-direction: column; }
.lv-fair .room-header { padding: 6px 12px 0; margin: 0; }
.lv-fair-mark { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 0 20px; }
.lv-tick { display: grid; place-items: center; width: 1.5em; height: 1.5em; border-radius: var(--radius-4); background: var(--color-page); box-shadow: var(--shadow-sheet-2); font-family: var(--font-display); font-weight: var(--weight-display); color: var(--color-ink); line-height: 1; }
.lv-fair-words { font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); color: var(--color-ink); text-align: center; line-height: 1.05; }
.lv-home { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 16px; padding: 20px; }
.lv-home .brand { margin: 0; }
.lv-home .room-list { margin: 0; padding: 0; list-style: none; }
`;

const HOUSE = {
  blue: "var(--house-blue)",
  green: "var(--house-green)",
  pink: "var(--house-pink)",
  red: "var(--house-red)",
  yellow: "var(--house-yellow)",
} as const;

type HouseColour = keyof typeof HOUSE;

const CONFETTI: readonly HouseColour[] = [
  "yellow",
  "blue",
  "green",
  "pink",
  "yellow",
  "blue",
];

interface TableHost extends HTMLElement {
  snapshot: TableSnapshot | null;
  sound: boolean;
}

const isTableHost = (node: Element): node is TableHost =>
  node.tagName.toLowerCase() === TABLE_TAG;

const isTableIntent = (event: Event): event is CustomEvent<TableIntent> =>
  event instanceof CustomEvent;

const el = (tag: string, className = "", text = "") => {
  const node = document.createElement(tag);

  node.className = className;

  if (text !== "") {
    node.textContent = text;
  }

  return node;
};

const faceTile = (
  avatar: Avatar,
  expression: Expression,
  px: number
): HTMLElement => {
  const tile = el("span", "lv-tile-face");

  tile.style.width = `${px}px`;
  tile.style.height = `${px}px`;
  tile.innerHTML = render(avatar, {
    expression,
    size: Math.round(px * 2),
    theme: "Light",
  });

  return tile;
};

const place = (node: HTMLElement, box: Box) => {
  node.style.left = `${box.x}px`;
  node.style.top = `${box.y}px`;
  node.style.width = `${box.w}px`;
  node.style.height = `${box.h}px`;
};

const secondsSince = (beat: number, from: number) =>
  ((beat - from) * BEAT_MS) / 1000;

type Entry = "Rise" | "Drop" | "Left" | "Right" | "Pop" | "None";

interface Enter {
  readonly entry: Entry;
  readonly rest: number;
  readonly look?: SpringLook;
}

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly scale: number;
}

type Tick = (beat: number) => void;

interface Layer {
  readonly lead: number;
  readonly from: number;
  readonly until: number;
  readonly node: HTMLElement;
  readonly box: Box;
  readonly enter: Enter;
  readonly tick: Tick;
  readonly started: { done: boolean };
  readonly start: () => void;
  readonly exit?: ((beat: number) => Pose | null) | undefined;
}

const offsetOf = (entry: Entry, box: Box): Pose => {
  const far = FRAMING.view;

  if (entry === "Rise") {
    return { rot: 7, scale: 1, x: 30, y: far.h - box.y + 30 };
  }

  if (entry === "Drop") {
    return { rot: -6, scale: 1, x: -20, y: -(box.y + box.h + 30) };
  }

  if (entry === "Left") {
    return { rot: -8, scale: 1, x: -(box.x + box.w + 40), y: 40 };
  }

  if (entry === "Right") {
    return { rot: 8, scale: 1, x: far.w - box.x + 40, y: 40 };
  }

  if (entry === "Pop") {
    return { rot: -4, scale: 0, x: 0, y: 0 };
  }

  return { rot: 0, scale: 1, x: 0, y: 0 };
};

const posed = (layer: Layer, beat: number) => {
  const along = sprung(
    secondsSince(beat, layer.from),
    layer.enter.look ?? BOUNCY
  );

  const away = offsetOf(layer.enter.entry, layer.box);
  const gone = layer.exit?.(beat) ?? null;
  const x = away.x * (1 - along) + (gone?.x ?? 0);
  const y = away.y * (1 - along) + (gone?.y ?? 0);
  const rot = layer.enter.rest + away.rot * (1 - along) + (gone?.rot ?? 0);
  const scale = mixed(away.scale, 1, along) * (gone?.scale ?? 1);

  layer.node.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
};

const peeledAway =
  (from: number) =>
  (beat: number): Pose | null => {
    if (beat < from) {
      return null;
    }

    const along = eased((beat - from) / 0.8);

    return {
      rot: 16 * along,
      scale: 1 - 0.1 * along,
      x: FRAMING.view.w * 0.9 * along,
      y: FRAMING.view.h * (FRAMING.tall ? 0.12 : -0.2) * along,
    };
  };

type Who = CastName | "You";

type Target =
  | { readonly kind: "Whole" }
  | { readonly kind: "Seats"; readonly who: readonly Who[] }
  | {
      readonly kind: "Parts";
      readonly selectors: readonly string[];
      readonly text?: RegExp;
      readonly who?: readonly Who[];
    };

interface Aim {
  readonly at: number;
  readonly target: Target;
  readonly fill: number;
  readonly lift?: number;
}

const seats = (...who: Who[]): Target => ({ kind: "Seats", who });

const parts = (
  selectors: readonly string[],
  extra: { readonly text?: RegExp; readonly who?: readonly Who[] } = {}
): Target => ({ kind: "Parts", selectors, ...extra });

const WHOLE: Target = { kind: "Whole" };

const aim = (at: number, target: Target, fill: number, lift = 0): Aim => ({
  at,
  fill,
  lift,
  target,
});

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const unionOf = (rects: readonly Rect[]): Rect | null => {
  const [first, ...rest] = rects;

  if (first === undefined) {
    return null;
  }

  let all = first;

  for (const rect of rest) {
    all = {
      bottom: Math.max(all.bottom, rect.bottom),
      left: Math.min(all.left, rect.left),
      right: Math.max(all.right, rect.right),
      top: Math.min(all.top, rect.top),
    };
  }

  return all;
};

interface Camera {
  x: number;
  y: number;
  scale: number;
  ready: boolean;
}

interface Remembered {
  box: Rect | null;
}

interface TableRig {
  readonly table: TableHost;
  readonly lens: HTMLElement;
  readonly native: Size;
  readonly camera: Camera;
  readonly last: Remembered;
}

const rootOf = (rig: TableRig) => rig.table.shadowRoot;

const nodesFor = (rig: TableRig, who: Who) => {
  const root = rootOf(rig);

  if (root === null) {
    return [];
  }

  if (who === "You") {
    return [...root.querySelectorAll(".self")];
  }

  return [...root.querySelectorAll(".tile")].filter(
    (tile) => tile.querySelector(".name")?.textContent?.trim() === who
  );
};

const visible = (node: Element) => {
  const rect = node.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0 ? [rect] : [];
};

const targetRect = (rig: TableRig, target: Target): Rect | null => {
  if (target.kind === "Whole") {
    return { bottom: rig.native.h, left: 0, right: rig.native.w, top: 0 };
  }

  const root = rootOf(rig);
  const host = rig.table.getBoundingClientRect();
  const { scale } = rig.camera;

  const seatRects = (target.who ?? []).flatMap((who) =>
    nodesFor(rig, who).flatMap(visible)
  );

  const partRects =
    target.kind === "Parts"
      ? target.selectors.flatMap((selector) =>
          [...(root?.querySelectorAll(selector) ?? [])]
            .filter(
              (node) =>
                target.text === undefined ||
                target.text.test(node.textContent ?? "")
            )
            .flatMap(visible)
        )
      : [];

  const page = unionOf([...seatRects, ...partRects]);

  return page === null
    ? null
    : {
        bottom: (page.bottom - host.top) / scale,
        left: (page.left - host.left) / scale,
        right: (page.right - host.left) / scale,
        top: (page.top - host.top) / scale,
      };
};

const OVERSCAN = 80;

const MOST_ZOOM = 5;

const CAMERA_RATE = 3.2;

const DRIFT_PER_BEAT = 0.012;

const fitOf = (rig: TableRig, win: Size) =>
  Math.min(win.w / rig.native.w, win.h / rig.native.h);

const steer = (
  rig: TableRig,
  aims: readonly Aim[],
  beat: number,
  win: Size
) => {
  const active = aims.findLast((each) => each.at <= beat) ??
    aims[0] ?? { at: 0, fill: 1, target: WHOLE };

  const found = targetRect(rig, active.target);
  const box = found ?? rig.last.box ?? targetRect(rig, WHOLE);

  if (found !== null) {
    rig.last.box = found;
  }

  if (box === null) {
    return;
  }

  const fit = fitOf(rig, win);
  const lift = active.lift ?? 0;
  const width = Math.max(40, box.right - box.left);
  const height = Math.max(40, box.bottom - box.top + Math.abs(lift));

  const wanted = clamp(
    active.fill *
      Math.min(win.w / width, win.h / height) *
      (1 + DRIFT_PER_BEAT * Math.max(0, beat - active.at)),
    fit,
    fit * MOST_ZOOM
  );

  const centre = {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom - lift) / 2,
  };

  const { camera } = rig;

  if (camera.ready) {
    const step = 1 - Math.exp(-CAMERA_RATE / FPS);

    camera.x = mixed(camera.x, centre.x, step);
    camera.y = mixed(camera.y, centre.y, step);
    camera.scale = Math.exp(
      mixed(Math.log(camera.scale), Math.log(wanted), step)
    );
  } else {
    camera.x = centre.x;
    camera.y = centre.y;
    camera.scale = wanted;
    camera.ready = true;
  }

  const along = (size: number, room: number, focus: number) =>
    size <= room
      ? (room - size) / 2
      : clamp(
          room / 2 - focus * camera.scale,
          room - size - OVERSCAN,
          OVERSCAN
        );

  const x = along(rig.native.w * camera.scale, win.w, camera.x);
  const y = along(rig.native.h * camera.scale, win.h, camera.y);

  rig.lens.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${camera.scale.toFixed(4)})`;
};

const tableRig = (holder: HTMLElement, native = FRAMING.native): TableRig => {
  const lens = el("div", "lv-lens");
  const table = document.createElement(TABLE_TAG);

  if (!isTableHost(table)) {
    throw new Error("The launch stage needs the table element.");
  }

  table.sound = false;
  lens.style.width = `${native.w}px`;
  lens.style.height = `${native.h}px`;
  lens.append(table);
  holder.append(lens);

  return {
    camera: { ready: false, scale: 1, x: 0, y: 0 },
    last: { box: null },
    lens,
    native,
    table,
  };
};

const cueRunner = (rig: TableRig, cues: readonly Cue[], from: number) => {
  const [first] = cues;
  let next = 0;

  if (first !== undefined && first[0] <= 0) {
    const [, opening] = first;

    rig.table.snapshot = opening;
    next = 1;
  }

  return (beat: number) => {
    while (next < cues.length) {
      const [at, snapshot] = cues[next] ?? [Number.POSITIVE_INFINITY, null];

      if (snapshot === null || from + at > beat) {
        break;
      }

      rig.table.snapshot = snapshot;
      next += 1;
    }
  };
};

type Align = "Centre" | "Start";

const ALIGN_CLASS: Readonly<Record<Align, string>> = {
  Centre: "lv-centre",
  Start: "lv-start",
};

const wordsCaption = (
  text: string,
  box: Box,
  options: {
    readonly from: number;
    readonly px: number;
    readonly spacing: number;
    readonly align: Align;
  }
) => {
  const cap = el("div", `lv-cap ${ALIGN_CLASS[options.align]}`);

  place(cap, box);
  cap.style.fontSize = `${options.px}px`;

  const nodes = text.split(" ").map((word) => {
    const node = el("span", "lv-word", word);

    cap.append(node);

    return node;
  });

  return {
    node: cap,
    tick: (beat: number, leaving: number) => {
      for (const [index, node] of nodes.entries()) {
        const along = sprung(
          secondsSince(beat, options.from + index * options.spacing),
          POP
        );

        const out = eased((beat - leaving - index * 0.04) / 0.3);

        node.style.opacity = along <= 0 ? "0" : String(1 - out);
        node.style.transform = `translateY(${((1 - along) * 0.45 - out * 0.25).toFixed(3)}em) scale(${(0.5 + 0.5 * along).toFixed(4)}) rotate(${((1 - along) * (index % 2 === 0 ? -7 : 7)).toFixed(2)}deg)`;
      }
    },
  };
};

const paperBits = (
  host: HTMLElement,
  at: number,
  origin: { readonly x: number; readonly y: number },
  count: number,
  seed: number
) => {
  const bits = Array.from({ length: count }, (_, index) => {
    const node = el("div", "lv-bit");
    const colour = CONFETTI[index % CONFETTI.length] ?? "yellow";
    const kind = Math.floor(hashed(seed + index) * 3);
    const size = 7 + hashed(seed + index * 3) * 9;

    node.style.background = HOUSE[colour];
    node.style.width = `${kind === 2 ? size * 1.8 : size}px`;
    node.style.height = `${kind === 2 ? size * 0.55 : size}px`;
    node.style.borderRadius = kind === 0 ? "50%" : "2px";
    node.style.opacity = "0";
    host.append(node);

    return {
      angle: hashed(seed + index * 7) * Math.PI * 2,
      node,
      speed: 140 + hashed(seed + index * 11) * 220,
      spin: (hashed(seed + index * 13) - 0.5) * 720,
    };
  });

  return (beat: number) => {
    const seconds = secondsSince(beat, at);
    const life = 1.5;

    for (const bit of bits) {
      if (seconds < 0 || seconds > life) {
        bit.node.style.opacity = "0";
      } else {
        const travel = (bit.speed * (1 - Math.exp(-seconds * 3.2))) / 3.2;
        const x = origin.x + Math.cos(bit.angle) * travel;

        const y =
          origin.y + Math.sin(bit.angle) * travel + 60 * seconds * seconds;

        bit.node.style.opacity = String(clamp((life - seconds) / 0.4));
        bit.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(bit.spin * seconds).toFixed(1)}deg)`;
      }
    }
  };
};

interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

interface Stage {
  readonly layers: Layer[];
  readonly ticks: Tick[];
  pointer: Pointer | null;
  readonly sheets: HTMLElement;
  readonly front: HTMLElement;
  readonly deco: HTMLElement;
  readonly finger: HTMLElement;
}

const layerOf = (
  stage: Stage,
  spec: {
    readonly from: number;
    readonly until: number;
    readonly box: Box;
    readonly enter: Enter;
    readonly bare?: boolean;
    readonly build: (node: HTMLElement) => Tick | null;
    readonly exit?: Layer["exit"];
    readonly lead?: number;
  }
) => {
  const node = el("div", spec.bare === true ? "lv-sheet lv-bare" : "lv-sheet");
  const started = { done: false };
  let tick: Tick | null = null;

  place(node, spec.box);
  node.style.opacity = "0";
  node.style.zIndex = String(stage.layers.length + 1);

  const layer: Layer = {
    box: spec.box,
    enter: spec.enter,
    exit: spec.exit,
    from: spec.from,
    lead: spec.lead ?? 0.6,
    node,
    start: () => {
      stage.sheets.append(node);
      tick = spec.build(node);
    },
    started,
    tick: (beat) => {
      tick?.(beat);
    },
    until: spec.until,
  };

  stage.layers.push(layer);

  return layer;
};

const backing = (
  stage: Stage,
  from: number,
  until: number,
  box: Box,
  colour: HouseColour,
  tilt: number
) =>
  layerOf(stage, {
    bare: true,
    box,
    build: (node) => {
      const card = el("div", "lv-backing");

      place(card, { h: box.h, w: box.w, x: 0, y: 0 });
      card.style.background = HOUSE[colour];
      card.style.transform = `translate(${(tilt * 3).toFixed(1)}px, 12px) rotate(${tilt}deg)`;
      node.append(card);

      return null;
    },
    enter: { entry: "Pop", look: SOFT, rest: 0 },
    from,
    until,
  });

const tableLayer = (
  stage: Stage,
  spec: {
    readonly from: number;
    readonly until: number;
    readonly cues: readonly Cue[];
    readonly aims: readonly Aim[];
    readonly enter: Enter;
    readonly box?: Box;
    readonly extra?: (node: HTMLElement, rig: TableRig) => Tick;
    readonly exit?: Layer["exit"];
  }
) => {
  const box = spec.box ?? FRAMING.window;
  const aims = spec.aims.map((each) => ({ ...each, at: spec.from + each.at }));

  return layerOf(stage, {
    box,
    build: (node) => {
      const rig = tableRig(node);
      const run = cueRunner(rig, spec.cues, spec.from);
      const extra = spec.extra?.(node, rig);

      return (beat) => {
        run(beat);
        steer(rig, aims, beat, box);
        extra?.(beat);
      };
    },
    enter: spec.enter,
    exit: spec.exit,
    from: spec.from,
    lead: 3,
    until: spec.until,
  });
};

const captionLayer = (
  stage: Stage,
  text: string,
  from: number,
  until: number,
  options: {
    readonly px?: number;
    readonly spacing?: number;
    readonly box?: Box;
    readonly align?: Align;
  } = {}
) => {
  const caption = wordsCaption(text, options.box ?? FRAMING.caption, {
    align: options.align ?? FRAMING.align,
    from,
    px: options.px ?? FRAMING.captionPx,
    spacing: options.spacing ?? 0.12,
  });

  let added = false;

  stage.ticks.push((beat) => {
    if (beat >= from - 0.1 && beat < until + 0.5) {
      if (!added) {
        stage.front.append(caption.node);
        added = true;
      }

      caption.tick(beat, until);
    } else if (added) {
      caption.node.remove();
      added = false;
    }
  });
};

const CHAT_BOX: Box = FRAMING.tall
  ? { h: 600, w: 440, x: 30, y: 125 }
  : { h: 500, w: 400, x: 280, y: 20 };

const CHAT_ZOOM = FRAMING.tall ? 1.36 : 1.13;

const chatShot = (stage: Stage) => {
  backing(stage, 0, 7.5, CHAT_BOX, "blue", -3.5);
  layerOf(stage, {
    box: CHAT_BOX,
    build: (node) => {
      const chat = el("div", "lv-chat");

      chat.style.zoom = String(CHAT_ZOOM);

      const head = el("div", "lv-chat-head");
      const faces = el("span", "lv-chat-faces");

      for (const name of ["Ben", "Ana", "Maya", "Jonas"] as const) {
        faces.append(faceTile(CAST[name], "Resting", 26));
      }

      head.append(
        faces,
        el("span", "", "poker people"),
        el("small", "", "9 friends")
      );
      chat.append(head);

      const message = (name: CastName, body: HTMLElement) => {
        const row = el("div", "lv-msg");
        const words = el("div", "lv-msg-body");

        words.append(el("span", "lv-msg-name", name), body);
        row.append(faceTile(CAST[name], "Happy", 34), words);
        chat.append(row);

        return row;
      };

      const card = el("div", "lv-link-card");
      const image = document.createElement("img");
      const words = el("div", "lv-link-words");

      image.src = "/preview/card.png";
      image.alt = "";
      words.append(
        el("b", "", INVITE_PREVIEW.title),
        el("span", "", "Tap the link, pick a face, take a seat."),
        el("span", "lv-link-url", ROOM_LINK)
      );
      card.append(image, words);

      const rows = [
        {
          at: 0.5,
          row: message("Ben", el("div", "lv-slip", "poker tonight?")),
        },
        { at: 1.5, row: message("Maya", el("div", "lv-slip", "I'm in")) },
        { at: 2.5, row: message("Ana", card) },
      ];

      node.append(chat);

      return (beat) => {
        for (const { at, row } of rows) {
          const along = sprung(secondsSince(beat, at), POP);

          row.style.opacity = along <= 0 ? "0" : "1";
          row.style.transform = `translateY(${((1 - along) * 18).toFixed(2)}px) scale(${(0.5 + 0.5 * along).toFixed(4)})`;
        }

        const pressed = beat > 4.1 && beat < 4.5;

        card.style.transform = pressed ? "translate(1px, 2px)" : "";
        card.style.boxShadow = pressed ? "var(--shadow-sheet-0)" : "";
      };
    },
    enter: { entry: "Pop", look: BOUNCY, rest: -1 },
    exit: (beat) =>
      beat < 6
        ? null
        : {
            rot: -10 * eased((beat - 6) / 1.2),
            scale: 1,
            x: -FRAMING.view.w * eased((beat - 6) / 1.2),
            y: 30 * eased((beat - 6) / 1.2),
          },
    from: 0,
    until: 7.5,
  });

  stage.ticks.push((beat) => {
    if (beat > 3.7 && beat < 4.6) {
      const card = stage.sheets.querySelector(".lv-link-card");

      if (card instanceof HTMLElement) {
        const box = card.getBoundingClientRect();

        stage.pointer = {
          down: beat > 4.1,
          x: box.left + box.width * 0.6,
          y: box.top + box.height * 0.45,
        };
      }
    }
  });
};

const fillShot = (stage: Stage) => {
  backing(stage, 5.6, 15, FRAMING.window, "yellow", 2.5);
  tableLayer(stage, {
    aims: [
      aim(
        0,
        parts([".felt-rules"], {
          who: FRAMING.tall ? ["Lou", "Ana", "Ben", "Jonas"] : ["Ana", "Ben"],
        }),
        0.92,
        20
      ),
      aim(
        4.4,
        parts([".felt-rules"], {
          who: FRAMING.tall
            ? ["Lou", "Ana", "Ben", "Jonas", "Kit", "Maya"]
            : ["Lou", "Ana", "Ben", "Jonas"],
        }),
        0.95,
        20
      ),
    ],
    cues: fillTold(DEFAULT_FELT).cues,
    enter: { entry: "Right", rest: 0 },
    from: 5.6,
    until: 15,
  });
  captionLayer(stage, CAPTIONS.Fill, 6.6, 13.7);
};

interface RigHolder {
  rig: TableRig | null;
}

interface GestureState {
  to: number | null;
  folded: boolean;
}

interface Spot {
  at: { readonly x: number; readonly y: number } | null;
}

const gestureShot = (stage: Stage) => {
  const story = gestureStory();
  const from = 13.6;
  const rigs: RigHolder = { rig: null };

  const raised: GestureState = {
    folded: false,
    to: null,
  };

  const aims = [
    aim(0, parts([".hand", ".chipctl"]), 0.8, 30),
    aim(2.9, parts([".hand", ".chipctl"]), 0.92, 190),
    aim(6.4, parts([".hand", ".chipctl"]), 0.8, 30),
    aim(8.4, parts([".hand", ".chipctl"]), 0.75, 80),
  ].map((each) => ({ ...each, at: from + each.at }));

  backing(stage, from, 27, FRAMING.window, "green", -2.5);
  layerOf(stage, {
    box: FRAMING.window,
    build: (node) => {
      const rig = tableRig(node);
      const opening = cueRunner(rig, [[0, story.opening]], from);
      const dealNext = cueRunner(rig, story.nextHand, 22);
      let after: Tick | null = null;

      rigs.rig = rig;
      rig.table.addEventListener("intent", (event) => {
        if (!isTableIntent(event)) {
          return;
        }

        if (
          TableIntentSchema.guards.Raise(event.detail) &&
          raised.to === null
        ) {
          raised.to = event.detail.to;
          document.documentElement.dataset.raised = String(event.detail.to);
        }

        if (TableIntentSchema.guards.Fold(event.detail) && !raised.folded) {
          raised.folded = true;
          document.documentElement.dataset.folded = "true";

          const now = rig.table.snapshot;

          if (now !== null) {
            rig.table.snapshot = story.afterFold(now);
          }
        }
      });

      return (beat) => {
        opening(beat);

        if (raised.to !== null && after === null) {
          after = cueRunner(rig, story.afterRaise(raised.to), beat);
        }

        if (after === null && beat > 20.2 && raised.to === null) {
          raised.to = GESTURE_RAISE_FALLBACK;
        }

        after?.(beat);

        if (beat >= 22) {
          dealNext(beat);
        }

        steer(rig, aims, beat, FRAMING.window);
      };
    },
    enter: { entry: "Rise", rest: 0 },
    from,
    lead: 3,
    until: 27,
  });

  const target = (selector: string, match?: RegExp) => {
    const root = rigs.rig === null ? null : rootOf(rigs.rig);
    const nodes = root?.querySelectorAll(selector) ?? [];

    for (const node of nodes) {
      if (match === undefined || match.test(node.textContent ?? "")) {
        const box = node.getBoundingClientRect();

        if (box.width > 0) {
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        }
      }
    }

    return null;
  };

  const chipFrom: Spot = { at: null };
  const handFrom: Spot = { at: null };

  stage.ticks.push((beat) => {
    if (beat >= 14.6 && beat < 17) {
      const hand = target(".hand");

      if (hand !== null) {
        stage.pointer = { down: beat >= 14.95, x: hand.x, y: hand.y };
      }
    } else if (beat >= 17 && beat < 20) {
      if (beat >= 17.45) {
        chipFrom.at ??= target(".chipctl");
      }

      const chip = chipFrom.at ?? target(".chipctl");

      if (chip !== null) {
        const lift = clamp((beat - 17.6) / 0.25);
        const pot = target(".rail .det", /^Pot/u);
        const glide = eased((beat - 17.9) / 1.3);
        const y0 = chip.y - 30 * lift;
        const y = pot === null || beat < 17.9 ? y0 : mixed(y0, pot.y, glide);

        stage.pointer = { down: beat >= 17.5 && beat < 19.5, x: chip.x, y };
      }
    } else if (beat >= 22.7 && beat < 24.6) {
      handFrom.at ??= target(".hand");

      const hand = handFrom.at;

      if (hand !== null) {
        const flick = eased((beat - 23.3) / 0.55);

        stage.pointer = {
          down: beat >= 23.2 && beat < 23.9,
          x: hand.x + flick * 14,
          y: hand.y - flick * (FRAMING.tall ? 220 : 200),
        };
      }
    }
  });

  const [hold, drag, flick] = CAPTIONS.Gestures;

  const third = (index: number): Box => {
    const box = FRAMING.caption;

    return FRAMING.tall
      ? { h: box.h, w: box.w / 3, x: box.x + (box.w / 3) * index, y: box.y }
      : { h: box.h / 3, w: box.w, x: box.x, y: box.y + (box.h / 3) * index };
  };

  const big = FRAMING.tall ? 54 : 84;

  for (const [index, word, at] of [
    [0, hold, 14.5],
    [1, drag, 18],
    [2, flick, 22.3],
  ] as const) {
    captionLayer(stage, word, at, 25.7, { box: third(index), px: big });
  }
};

const stampSpot = (card: Rect, index: number, width: number) => {
  const middle = (card.left + card.right) / 2;
  const gap = 14;
  const height = FRAMING.tall ? 44 : 52;
  const x = index % 2 === 0 ? middle - width - 6 : middle + 6;

  const y =
    index < 2
      ? card.top - gap - height
      : card.bottom + gap + (FRAMING.tall ? 4 : 0);

  return { x, y };
};

const rulesShot = (stage: Stage) => {
  const from = 25.6;
  const extras: string[] = [];
  const felts: (readonly [number, string[]])[] = [];
  const words = ["7-2 20", "bomb pots", "runs twice", "UTG straddle"];

  for (const [index, stamp] of RULE_STAMPS.entries()) {
    extras.push(words[index] ?? "");
    felts.push([stamp.beat + 0.1 - from, [...extras]]);
  }

  backing(stage, from, 35, FRAMING.window, "pink", 2.5);
  tableLayer(stage, {
    aims: [aim(0, parts([".felt-rules"]), FRAMING.tall ? 0.9 : 0.5)],
    cues: rulesTold(felts).cues,
    enter: { entry: "Drop", rest: 0 },
    extra: (_node, rig) => {
      const stamps = RULE_STAMPS.map((stamp, index) => {
        const node = el("div", "lv-stamp", stamp.word);

        node.style.background = HOUSE[stamp.colour];
        node.style.fontSize = `${FRAMING.tall ? 24 : 28}px`;
        node.style.opacity = "0";
        stage.front.append(node);

        return { at: stamp.beat, index, node, tilt: index % 2 === 0 ? -5 : 4 };
      });

      stage.ticks.push((beat) => {
        if (beat >= 34.2) {
          for (const stamp of stamps) {
            stamp.node.remove();
          }
        }
      });

      return (beat) => {
        const card = rootOf(rig)
          ?.querySelector(".felt-rules")
          ?.getBoundingClientRect();

        if (card === undefined) {
          return;
        }

        for (const stamp of stamps) {
          const along = sprung(secondsSince(beat, stamp.at), POP);
          const spot = stampSpot(card, stamp.index, stamp.node.offsetWidth);
          const leaving = 1 - eased((beat - 33.5) / 0.6);

          stamp.node.style.opacity = along <= 0 ? "0" : "1";
          stamp.node.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) scale(${((2.2 - 1.2 * along) * leaving).toFixed(4)}) rotate(${(stamp.tilt * along).toFixed(2)}deg)`;
        }
      };
    },
    from,
    until: 35,
  });
  captionLayer(stage, CAPTIONS.Rules, 26.3, 33.7);
};

const PICTURE_LOOK = {
  deck: "TwoColour",
  fonts: "",
  frame: "Chat",
  theme: "Light",
} as const;

const pictureLayer = (
  stage: Stage,
  svg: string,
  from: number,
  until: number,
  enter: Enter
) =>
  layerOf(stage, {
    box: FRAMING.picture,
    build: (node) => {
      node.classList.add("lv-picture");
      node.innerHTML = svg;

      return null;
    },
    enter,
    from,
    until,
  });

const badBeatShot = (stage: Stage) => {
  const from = 33.6;

  backing(stage, from, 41.5, FRAMING.window, "blue", -2);
  tableLayer(stage, {
    aims: [
      aim(0, seats("Jonas"), 0.6, 30),
      aim(0.9, parts([".slot"]), 0.9),
      aim(2.6, parts([".slot"], { who: ["Priya"] }), 0.92, 20),
      aim(3.8, seats("Jonas"), 0.55, 60),
    ],
    cues: badBeatTold().cues,
    enter: { entry: "Left", rest: 0 },
    from,
    until: 41.5,
  });
  pictureLayer(stage, pictureSvg(BAD_BEAT, PICTURE_LOOK), 40, 47, {
    entry: "Rise",
    rest: 2,
  });
  captionLayer(stage, CAPTIONS.BadBeat, 40.3, 45.7, {
    box: FRAMING.pictureCaption,
  });
};

const settleShot = (stage: Stage) => {
  pictureLayer(stage, settleUpSvg(SMALL_NIGHT, PICTURE_LOOK), 45.6, 53, {
    entry: "Right",
    rest: -2,
  });
  captionLayer(stage, CAPTIONS.Settle, 46.4, 51.7, {
    box: FRAMING.pictureCaption,
    px: FRAMING.tall ? 40 : FRAMING.captionPx,
    spacing: 0.1,
  });
};

const LITTLE_AIMS: Readonly<Record<LittleScene, readonly Aim[]>> = {
  BombPot: [
    aim(0, seats("Ana", "Ben"), 0.85, 20),
    aim(0.7, parts([".slot", ".pot"]), 0.85),
  ],
  Bounty: [aim(0, seats("Kit", "Lou"), 0.95, 20)],
  Button: [aim(0, parts([".dealer"], { who: ["Dev", "You"] }), 0.95)],
  Fairness: [aim(0, WHOLE, 1)],
  KeepSeat: [aim(0, seats("You"), 0.5, -70)],
  Peeking: [aim(0, seats("Maya"), 0.55, 20)],
  Reaction: [
    aim(0, FRAMING.tall ? seats("You") : seats("Priya", "You"), 0.85, 130),
  ],
  RunTwice: [aim(0, parts([".slot", ".runs .card"]), 0.9)],
  ShowOne: [aim(0, parts([".hand"]), 0.75, 20)],
  Straddle: [
    aim(0, parts([".pile.posted", ".pile.posted .posted-tag"]), 0.92, 10),
  ],
  Sweep: [
    aim(0, parts([".pile:not(.empty)", ".pot"]), 0.9),
    aim(0.5, parts([".pot", ".slot"]), 0.8),
  ],
  WaitBig: [
    aim(0, parts([".note"], { text: /Waits/u }), FRAMING.tall ? 0.8 : 0.6, 30),
  ],
};

const fairnessLayer = (
  stage: Stage,
  from: number,
  until: number,
  enter: Enter
) =>
  layerOf(stage, {
    box: FRAMING.window,
    build: (node) => {
      const wrap = el("div", "lv-fair page room");
      const header = el("header", "room-header");
      const brand = el("span", "brand small");
      const end = el("span", "bar-end");

      const mark = FairMarks.Checked({
        cards: 14,
        round: 18_442_907,
        timing: "InTime",
      });

      const symbol = fairSymbol(mark);

      const [checks = CAPTIONS.Fairness] = fairParagraph({
        hand: 14,
        mark,
      }).split(/(?<=\.) /u);

      brand.append("nostakes", el("span", "beta-tag", "beta"));
      end.append(
        faceTile(CAST.Sam, "Resting", 26),
        el("span", "bar-button", "Menu")
      );
      header.append(
        brand,
        el("span", "bar-button", "Invite"),
        el("span", "bar-button fair-mark", symbol),
        end
      );

      const body = el("div", "lv-fair-mark");
      const tick = el("div", "lv-tick", symbol);
      const words = el("div", "lv-fair-words", checks);

      tick.style.fontSize = FRAMING.tall ? "92px" : "110px";
      words.style.fontSize = FRAMING.tall ? "40px" : "46px";
      body.append(tick, words);
      wrap.append(header, body);
      node.append(wrap);

      return (beat) => {
        const pop = sprung(secondsSince(beat, from + 0.3), POP);
        const say = sprung(secondsSince(beat, from + 0.7), SOFT);

        tick.style.opacity = pop <= 0 ? "0" : "1";
        tick.style.transform = `scale(${pop.toFixed(4)}) rotate(${((1 - pop) * -20).toFixed(2)}deg)`;
        words.style.opacity = String(clamp(say));
        words.style.transform = `translateY(${((1 - say) * 18).toFixed(1)}px)`;
      };
    },
    enter,
    from,
    until,
  });

const homeRow = (
  list: HTMLElement,
  code: string,
  who: string,
  state: string
) => {
  const item = el("li");
  const button = el("button", "room-row");

  button.append(
    el("span", "room-row-code", code),
    el("span", "room-row-who", who),
    el("span", state === "Open" ? "tag is-open" : "tag", state)
  );
  item.append(button);
  list.append(item);

  return button;
};

const keepSeat = (stage: Stage, from: number, enter: Enter) => {
  const table = LITTLE_TOLD.KeepSeat().cues;
  const away = from + 0.75;
  const tap = from + 1.55;
  const back = from + 1.85;

  tableLayer(stage, {
    aims: LITTLE_AIMS.KeepSeat,
    cues: table,
    enter,
    exit: peeledAway(away),
    from,
    until: away + 1,
  });
  layerOf(stage, {
    box: FRAMING.window,
    build: (node) => {
      const home = el("div", "lv-home page home");
      const brand = el("h1", "brand");
      const rooms = el("section", "your-rooms");
      const list = el("ul", "room-list");

      brand.append("nostakes", el("span", "beta-tag", "beta"));
      rooms.append(el("span", "field-label", "Your rooms"), list);

      const open = homeRow(list, ROOM_CODE, "With Ben, Ana and 6 more", "Open");

      homeRow(list, "H4MW9P", "With Kit and Lou", "Settled");
      home.append(brand, rooms);
      home.style.zoom = FRAMING.tall ? "1.3" : "1.55";
      node.append(home);

      stage.ticks.push((beat) => {
        if (beat >= tap - 0.35 && beat < back) {
          const box = open.getBoundingClientRect();

          stage.pointer = {
            down: beat >= tap,
            x: box.left + box.width * 0.45,
            y: box.top + box.height / 2,
          };
        }
      });

      return (beat) => {
        const pressed = beat >= tap && beat < back;

        open.style.transform = pressed ? "translate(1px, 2px)" : "";
      };
    },
    enter: { entry: "Rise", look: SOFT, rest: 1 },
    exit: peeledAway(back),
    from: away + 0.1,
    until: back + 1,
  });
  tableLayer(stage, {
    aims: LITTLE_AIMS.KeepSeat,
    cues: table,
    enter: { entry: "Pop", rest: -1 },
    from: back,
    until: OUTRO_BEAT + 0.6,
  });
};

const littleShots = (stage: Stage) => {
  for (const [index, little] of LITTLE_THINGS.entries()) {
    const start = littleStart(index);
    const from = start - 0.25;
    const until = start + little.beats * 3;

    const enter: Enter = {
      entry: index % 2 === 0 ? "Right" : "Left",
      look: { damping: 0.55, frequency: 2.4 },
      rest: index % 2 === 0 ? 1.6 : -1.8,
    };

    if (little.scene === "Fairness") {
      fairnessLayer(stage, from, until, enter);
    } else if (little.scene === "KeepSeat") {
      keepSeat(stage, from, enter);
    } else {
      tableLayer(stage, {
        aims: LITTLE_AIMS[little.scene],
        cues: LITTLE_TOLD[little.scene]().cues,
        enter,
        from,
        until,
      });
    }

    captionLayer(
      stage,
      little.caption,
      start + 0.05,
      start + little.beats - 0.25,
      { spacing: 0.07 }
    );
  }

  stage.ticks.push(
    paperBits(
      stage.deco,
      littleStart(0),
      FRAMING.tall ? { x: 40, y: 310 } : { x: 400, y: 40 },
      12,
      52
    ),
    paperBits(
      stage.deco,
      littleStart(0),
      FRAMING.tall ? { x: 470, y: 310 } : { x: 910, y: 40 },
      12,
      53
    )
  );
};

const OUTRO_SPOTS: readonly (readonly [number, number])[] = FRAMING.tall
  ? [
      [70, 150],
      [380, 170],
      [210, 220],
      [60, 640],
      [390, 660],
      [230, 700],
    ]
  : [
      [110, 50],
      [780, 40],
      [450, 30],
      [80, 410],
      [800, 410],
      [460, 430],
    ];

const OUTRO_CAST: readonly (readonly [CastName, Expression])[] = [
  ["Ana", "Happy"],
  ["Ben", "Thinking"],
  ["Kit", "LookingDown"],
  ["Priya", "Happy"],
  ["Jonas", "Gutted"],
  ["Lou", "Happy"],
];

const outroShot = (stage: Stage) => {
  captionLayer(stage, CAPTIONS.Outro, OUTRO_BEAT + 0.2, 79.6, {
    align: "Centre",
    box: FRAMING.tall
      ? { h: 300, w: 440, x: 30, y: 300 }
      : { h: 240, w: 760, x: 100, y: 150 },
    px: FRAMING.tall ? 50 : 62,
    spacing: 0.16,
  });
  layerOf(stage, {
    bare: true,
    box: { h: FRAMING.view.h, w: FRAMING.view.w, x: 0, y: 0 },
    build: (node) => {
      node.style.background = "var(--color-page)";

      const faces = OUTRO_CAST.map(([name, expression], index) => {
        const tile = faceTile(CAST[name], expression, FRAMING.tall ? 64 : 70);
        const [x, y] = OUTRO_SPOTS[index] ?? [0, 0];

        tile.style.position = "absolute";
        tile.style.left = `${x}px`;
        tile.style.top = `${y}px`;
        node.append(tile);

        return tile;
      });

      return (beat) => {
        for (const [index, tile] of faces.entries()) {
          const along = sprung(
            secondsSince(beat, OUTRO_BEAT + 0.4 + index * 0.2),
            POP
          );

          const bob = Math.sin((beat - OUTRO_BEAT) * 1.6 + index) * 4;
          const gone = 1 - eased((beat - HIT_BEAT) / 0.5);

          tile.style.opacity = along <= 0 ? "0" : "1";
          tile.style.transform = `translateY(${bob.toFixed(1)}px) scale(${(along * gone).toFixed(4)}) rotate(${((index % 2 === 0 ? -6 : 6) * along).toFixed(1)}deg)`;
        }
      };
    },
    enter: { entry: "Rise", look: SOFT, rest: 0 },
    from: OUTRO_BEAT - 0.1,
    until: 81,
  });
};

const END_CAST: readonly CastName[] = [...RING];

const endShot = (stage: Stage) => {
  stage.ticks.push(
    paperBits(
      stage.deco,
      HIT_BEAT,
      {
        x: FRAMING.view.w * 0.1,
        y: FRAMING.view.h * (FRAMING.tall ? 0.3 : 0.25),
      },
      16,
      80
    ),
    paperBits(
      stage.deco,
      HIT_BEAT,
      {
        x: FRAMING.view.w * 0.9,
        y: FRAMING.view.h * (FRAMING.tall ? 0.7 : 0.75),
      },
      16,
      81
    )
  );
  layerOf(stage, {
    bare: true,
    box: { h: FRAMING.view.h, w: FRAMING.view.w, x: 0, y: 0 },
    build: (node) => {
      const end = el("div", "lv-end");
      const brand = el("h1", "brand");
      const site = el("div", "lv-end-line", "nostakes.club");
      const line = el("div", "lv-end-sub", CAPTIONS.End);
      const cast = el("div", "lv-end-cast");
      const facePx = FRAMING.tall ? 40 : 46;

      brand.append("nostakes", el("span", "beta-tag", "beta"));
      brand.style.fontSize = FRAMING.tall ? "76px" : "104px";
      site.style.fontSize = FRAMING.tall ? "30px" : "34px";
      site.style.marginTop = "14px";
      line.style.fontSize = FRAMING.tall ? "19px" : "21px";
      line.style.marginTop = "8px";
      cast.style.gap = FRAMING.tall ? "6px" : "10px";
      cast.style.marginBottom = "34px";

      const faces = END_CAST.map((name) => {
        const tile = faceTile(CAST[name], "Happy", facePx);

        cast.append(tile);

        return tile;
      });

      end.append(cast, brand, site, line);
      node.append(end);

      return (beat) => {
        const word = sprung(secondsSince(beat, HIT_BEAT), POP);

        brand.style.opacity = word <= 0 ? "0" : "1";
        brand.style.transform = `scale(${(0.3 + 0.7 * word).toFixed(4)}) rotate(${((1 - word) * -6).toFixed(2)}deg)`;

        for (const [index, tile] of faces.entries()) {
          const along = sprung(
            secondsSince(beat, HIT_BEAT + 0.6 + index * 0.12),
            POP
          );

          tile.style.opacity = along <= 0 ? "0" : "1";
          tile.style.transform = `translateY(${((1 - along) * 30).toFixed(1)}px) scale(${along.toFixed(4)})`;
        }

        for (const [index, node2] of [site, line].entries()) {
          const along = sprung(
            secondsSince(beat, HIT_BEAT + 1.2 + index * 0.6),
            SOFT
          );

          node2.style.opacity = String(clamp(along));
          node2.style.transform = `translateY(${((1 - along) * 16).toFixed(1)}px)`;
        }
      };
    },
    enter: { entry: "None", rest: 0 },
    from: HIT_BEAT - 0.2,
    until: 200,
  });
};

const seekAnimations = (
  born: WeakMap<Animation, { at: number; base: number }>
) => {
  const now = performance.now();

  for (const animation of document.getAnimations()) {
    let seen = born.get(animation);

    if (seen === undefined) {
      const base = Number(animation.currentTime ?? 0);

      seen = { at: now, base: Number.isFinite(base) ? base : 0 };
      born.set(animation, seen);
    }

    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
    const want = seen.base + (now - seen.at);

    if (Number.isFinite(end) && end > 0 && want >= end) {
      if (animation.playState !== "finished") {
        animation.finish();
      }
    } else {
      if (animation.playState !== "paused") {
        animation.pause();
      }

      animation.currentTime = want;
    }
  }
};

interface Launch {
  readonly at: (ms: number) => void;
  readonly pointer: () => Pointer | null;
}

declare global {
  interface Window {
    launch?: Launch;
    launchScore?: () => string;
  }
}

const base64Of = (bytes: Uint8Array) => {
  const chunks: string[] = [];

  for (let at = 0; at < bytes.length; at += 0x80_00) {
    chunks.push(String.fromCodePoint(...bytes.subarray(at, at + 0x80_00)));
  }

  return btoa(chunks.join(""));
};

const pointerOf = (stage: Stage): Pointer | null => stage.pointer;

const mount = () => {
  defineTable();

  const style = el("style");

  style.textContent = STAGE_CSS;
  document.head.append(style);

  const root = document.querySelector<HTMLElement>("#stage");

  if (root === null) {
    throw new Error("The launch stage needs a #stage element.");
  }

  const stage: Stage = {
    deco: el("div", "lv-layer"),
    finger: el("div", "lv-finger"),
    front: el("div", "lv-layer"),
    layers: [],
    pointer: null,
    sheets: el("div", "lv-layer"),
    ticks: [],
  };

  root.append(stage.sheets, stage.deco, stage.front, stage.finger);

  chatShot(stage);
  fillShot(stage);
  gestureShot(stage);
  rulesShot(stage);
  badBeatShot(stage);
  settleShot(stage);
  littleShots(stage);
  outroShot(stage);
  endShot(stage);

  stage.ticks.push(
    paperBits(
      stage.deco,
      6,
      { x: FRAMING.view.w * 0.78, y: FRAMING.view.h * 0.3 },
      12,
      6
    ),
    paperBits(
      stage.deco,
      40,
      FRAMING.tall
        ? { x: FRAMING.view.w * 0.5, y: 250 }
        : { x: 700, y: FRAMING.view.h * 0.35 },
      14,
      40
    )
  );

  const ordered = stage.layers.toSorted((a, b) => a.from - b.from);
  const born = new WeakMap<Animation, { at: number; base: number }>();

  window.launch = {
    at: (ms) => {
      const beat = beatOfMs(ms);

      stage.pointer = null;

      for (const layer of ordered) {
        if (
          beat >= layer.from - layer.lead &&
          beat < layer.until &&
          !layer.started.done
        ) {
          layer.started.done = true;
          layer.start();
        }

        if (layer.started.done && beat >= layer.until) {
          layer.node.remove();
        } else if (layer.started.done) {
          layer.node.style.opacity = beat >= layer.from ? "1" : "0";
          posed(layer, beat);
          layer.tick(beat);
        }
      }

      for (const tick of stage.ticks) {
        tick(beat);
      }

      const pointer = pointerOf(stage);

      stage.finger.style.opacity = pointer === null ? "0" : "1";

      if (pointer !== null) {
        stage.finger.style.transform = `translate(${pointer.x.toFixed(1)}px, ${pointer.y.toFixed(1)}px) scale(${pointer.down ? 0.78 : 1})`;
      }

      seekAnimations(born);
    },
    pointer: () => stage.pointer,
  };

  document.documentElement.dataset.staged = "true";
};

const offerScore = Effect.promise(() => import("./score.ts")).pipe(
  Effect.tap(({ launchScore, wavOf }) =>
    Effect.sync(() => {
      window.launchScore = () => base64Of(wavOf(launchScore()));
      document.documentElement.dataset.staged = "true";
    })
  )
);

if (params.get("score") === "1") {
  Effect.runFork(offerScore);
} else {
  mount();
}
