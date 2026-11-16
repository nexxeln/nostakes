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
import { BAD_BEAT, SETTLE_UP } from "../../src/features/landing/night.js";
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
  badBeatTold,
  fillTold,
  gestureStory,
  rulesTold,
} from "./scenes.ts";
import type { Cue } from "./scenes.ts";
import {
  BEAT_MS,
  CAPTIONS,
  HIT_BEAT,
  LITTLE_BEATS,
  LITTLE_THINGS,
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

interface Framing {
  readonly view: { readonly w: number; readonly h: number };
  readonly window: Box;
  readonly caption: Box;
  readonly native: { readonly w: number; readonly h: number };
  readonly captionPx: number;
  readonly smallCaptionPx: number;
  readonly tall: boolean;
}

const FRAMINGS: Readonly<Record<"tall" | "wide", Framing>> = {
  tall: {
    caption: { h: 88, w: 440, x: 30, y: 112 },
    captionPx: 27,
    native: { h: 620, w: 420 },
    smallCaptionPx: 24,
    tall: true,
    view: { h: 960, w: 540 },
    window: { h: 530, w: 440, x: 30, y: 208 },
  },
  wide: {
    caption: { h: 80, w: 760, x: 100, y: 432 },
    captionPx: 34,
    native: { h: 385, w: 660 },
    smallCaptionPx: 30,
    tall: false,
    view: { h: 540, w: 960 },
    window: { h: 385, w: 660, x: 150, y: 28 },
  },
};

const params = new URLSearchParams(globalThis.location.search);

const FRAMING = params.get("frame") === "tall" ? FRAMINGS.tall : FRAMINGS.wide;

const ROOM_LINK = "nostakes.club/r/K7QF2M";

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
.lv-cap { position: absolute; display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 0.12em 0.26em; text-align: center; }
.lv-word { display: inline-block; font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); line-height: 1.08; color: var(--color-ink); transform-origin: 50% 80%; }
.lv-strip { position: absolute; padding: 0.22em 0.55em 0.3em; border-radius: var(--radius-3); background: var(--color-raised); box-shadow: var(--shadow-sheet-2); font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); line-height: 1.05; color: var(--color-ink); white-space: nowrap; transform-origin: 50% 50%; }
.lv-stamp { position: absolute; padding: 0.3em 0.7em 0.36em; border-radius: var(--radius-3); box-shadow: var(--shadow-sheet-2); font-family: var(--font-display); font-weight: var(--weight-display); font-variation-settings: var(--settings-display); letter-spacing: var(--tracking-display); color: var(--house-ink); white-space: nowrap; }
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
.lv-room-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; }
.lv-room-wrap .room-header { padding: 4px 10px 0; margin: 0; }
.lv-room-wrap .room-body { position: relative; flex: 1; }
.lv-room-wrap nostakes-table { position: absolute; inset: 0; display: block; }
.lv-fair-sheet { position: absolute; padding: 12px 16px; border-radius: var(--radius-4); background: var(--color-raised); box-shadow: var(--shadow-sheet-3); }
.lv-fair-sheet .fair-text { font-size: 14px; }
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

interface Layer {
  readonly lead: number;
  readonly from: number;
  readonly until: number;
  readonly node: HTMLElement;
  readonly box: Box;
  readonly enter: Enter;
  readonly tick: (beat: number) => void;
  readonly started: { done: boolean };
  readonly start: () => void;
  readonly exit?:
    | ((
        beat: number
      ) => { x: number; y: number; rot: number; scale: number } | null)
    | undefined;
}

const offsetOf = (entry: Entry, box: Box) => {
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

interface Camera {
  readonly zoom: number;
  readonly fx: number;
  readonly fy: number;
}

type Focus =
  | { readonly kind: "Centre" }
  | { readonly kind: "Seat"; readonly name: CastName; readonly dy?: number }
  | { readonly kind: "Part"; readonly selector: string; readonly dy?: number }
  | { readonly kind: "Point"; readonly fx: number; readonly fy: number };

interface Shot {
  readonly zoom: number;
  readonly focus: Focus;
}

const shadowOf = (table: HTMLElement) => table.shadowRoot;

const centreOfNode = (table: HTMLElement, node: Element, scale: number) => {
  const host = table.getBoundingClientRect();
  const box = node.getBoundingClientRect();

  return {
    x: (box.left + box.width / 2 - host.left) / scale,
    y: (box.top + box.height / 2 - host.top) / scale,
  };
};

const seatNode = (table: HTMLElement, name: string) => {
  const tiles = shadowOf(table)?.querySelectorAll(".tile") ?? [];

  for (const tile of tiles) {
    const label = tile.querySelector(".name");

    if (
      (label?.textContent ?? tile.textContent ?? "").trim().startsWith(name)
    ) {
      return tile.querySelector(".pic") ?? tile;
    }
  }

  return null;
};

const focusPoint = (
  table: HTMLElement,
  focus: Focus,
  scale: number,
  native: { readonly w: number; readonly h: number }
) => {
  const middle = { x: native.w / 2, y: native.h / 2 };

  if (focus.kind === "Centre") {
    return middle;
  }

  if (focus.kind === "Point") {
    return { x: native.w * focus.fx, y: native.h * focus.fy };
  }

  const node =
    focus.kind === "Seat"
      ? seatNode(table, focus.name)
      : (shadowOf(table)?.querySelector(focus.selector) ?? null);

  if (node === null) {
    return middle;
  }

  const found = centreOfNode(table, node, scale);

  return { x: found.x, y: found.y + (focus.dy ?? 0) };
};

const OVERSCAN = 22;

const lensTransform = (
  lens: HTMLElement,
  win: Box,
  native: { readonly w: number; readonly h: number },
  camera: Camera
) => {
  const fit = Math.min(win.w / native.w, win.h / native.h);
  const scale = fit * camera.zoom;
  const width = native.w * scale;
  const height = native.h * scale;

  const along = (size: number, room: number, focus: number) =>
    size <= room
      ? (room - size) / 2
      : clamp(room / 2 - focus * scale, room - size - OVERSCAN, OVERSCAN);

  const x = along(width, win.w, camera.fx);
  const y = along(height, win.h, camera.fy);

  lens.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;

  return scale;
};

interface TableRig {
  readonly table: TableHost;
  readonly lens: HTMLElement;
  readonly native: { readonly w: number; readonly h: number };
  scale: number;
}

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

  return { lens, native, scale: 1, table };
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

const cameraAt = (
  rig: TableRig,
  shots: readonly (readonly [number, Shot])[],
  beat: number,
  win: Box
) => {
  const points = shots.map(([at, shot]) => {
    const point = focusPoint(rig.table, shot.focus, rig.scale, rig.native);

    return { at, point, zoom: shot.zoom };
  });

  const [first] = points;

  if (first === undefined) {
    return;
  }

  let camera: Camera = {
    fx: first.point.x,
    fy: first.point.y,
    zoom: first.zoom,
  };

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];

    if (before === undefined || after === undefined || beat < after.at) {
      break;
    }

    const along = eased((beat - after.at) / 1.2);

    camera = {
      fx: mixed(before.point.x, after.point.x, along),
      fy: mixed(before.point.y, after.point.y, along),
      zoom: mixed(before.zoom, after.zoom, along),
    };
  }

  rig.scale = lensTransform(rig.lens, win, rig.native, camera);
};

const wordsCaption = (
  text: string,
  box: Box,
  px: number,
  from: number,
  spacing = 0.18
) => {
  const cap = el("div", "lv-cap");
  const words = text.split(" ");

  place(cap, box);
  cap.style.fontSize = `${px}px`;

  const nodes = words.map((word) => {
    const node = el("span", "lv-word", word);

    cap.append(node);

    return node;
  });

  return {
    node: cap,
    tick: (beat: number, leaving: number) => {
      for (const [index, node] of nodes.entries()) {
        const along = sprung(secondsSince(beat, from + index * spacing), POP);
        const out = clamp((beat - leaving) / 0.35);

        node.style.opacity = along <= 0 ? "0" : String(1 - out);
        node.style.transform = `translateY(${((1 - along) * 0.5 + out * -0.3).toFixed(3)}em) scale(${(0.4 + 0.6 * along).toFixed(4)}) rotate(${((1 - along) * (index % 2 === 0 ? -8 : 8)).toFixed(2)}deg)`;
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
  readonly ticks: ((beat: number) => void)[];
  pointer: Pointer | null;
  readonly sheets: HTMLElement;
  readonly front: HTMLElement;
  readonly deco: HTMLElement;
  readonly finger: HTMLElement;
}

type Tick = (beat: number) => void;

const layerOf = (
  stage: Stage,
  spec: {
    readonly from: number;
    readonly until: number;
    readonly box: Box;
    readonly enter: Enter;
    readonly bare?: boolean;
    readonly host?: HTMLElement;
    readonly build: (node: HTMLElement) => Tick | null;
    readonly exit?: Layer["exit"];
    readonly lead?: number;
  }
) => {
  const node = el("div", spec.bare === true ? "lv-sheet lv-bare" : "lv-sheet");
  const started = { done: false };
  let tick: Tick | null = null;

  place(node, spec.box);
  node.style.visibility = "hidden";
  node.style.zIndex = String(stage.layers.length + 1);

  const layer: Layer = {
    box: spec.box,
    enter: spec.enter,
    exit: spec.exit,
    from: spec.from,
    lead: spec.lead ?? 0.6,
    node,
    start: () => {
      (spec.host ?? stage.sheets).append(node);
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
    readonly shots: readonly (readonly [number, Shot])[];
    readonly enter: Enter;
    readonly box?: Box;
    readonly extra?: (
      node: HTMLElement,
      rig: TableRig
    ) => (beat: number) => void;
    readonly exit?: Layer["exit"];
  }
) => {
  const box = spec.box ?? FRAMING.window;

  return layerOf(stage, {
    box,
    build: (node) => {
      const rig = tableRig(node);
      const run = cueRunner(rig, spec.cues, spec.from);
      const extra = spec.extra?.(node, rig);

      const shots = spec.shots.map(
        ([at, shot]) => [spec.from + at, shot] as const
      );

      return (beat) => {
        run(beat);
        cameraAt(rig, shots, beat, { ...box, x: 0, y: 0 });
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
  } = {}
) => {
  const caption = wordsCaption(
    text,
    options.box ?? FRAMING.caption,
    options.px ?? FRAMING.captionPx,
    from,
    options.spacing
  );

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
  : { h: 500, w: 430, x: 265, y: 20 };

const CHAT_ZOOM = FRAMING.tall ? 1.36 : 1.04;

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
    cues: fillTold(DEFAULT_FELT).cues,
    enter: { entry: "Right", rest: 0 },
    from: 5.6,
    shots: [[0, { focus: { kind: "Centre" }, zoom: 1 }]],
    until: 15,
  });
  captionLayer(stage, CAPTIONS.Fill, 7, 13.7);
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

  backing(stage, from, 27, FRAMING.window, "green", -2.5);
  layerOf(stage, {
    box: FRAMING.window,
    build: (node) => {
      const rig = tableRig(node);
      const opening = cueRunner(rig, [[0, story.opening]], from);
      const dealNext = cueRunner(rig, story.nextHand, 22);
      let after: ((beat: number) => void) | null = null;

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

      const shots: readonly (readonly [number, Shot])[] = [
        [
          from,
          {
            focus: { kind: "Part", selector: ".hand", dy: -60 },
            zoom: FRAMING.tall ? 1.15 : 1.25,
          },
        ],
      ];

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

        cameraAt(rig, shots, beat, { ...FRAMING.window, x: 0, y: 0 });
      };
    },
    enter: { entry: "Rise", rest: 0 },
    from,
    lead: 3,
    until: 27,
  });

  const target = (selector: string, match?: RegExp) => {
    const root = rigs.rig === null ? null : shadowOf(rigs.rig.table);
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
      chipFrom.at ??= target(".chipctl");

      const chip = chipFrom.at;

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
          y: hand.y - flick * (FRAMING.tall ? 200 : 170),
        };
      }
    }
  });

  captionLayer(stage, CAPTIONS.Gestures[0], 14.5, 25.7, {
    box: captionThird(0),
  });
  captionLayer(stage, CAPTIONS.Gestures[1], 18, 25.7, { box: captionThird(1) });
  captionLayer(stage, CAPTIONS.Gestures[2], 22.3, 25.7, {
    box: captionThird(2),
  });
};

const captionThird = (index: number): Box => {
  const box = FRAMING.caption;
  const width = box.w / 3;

  return { h: box.h, w: width, x: box.x + width * index, y: box.y };
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
    cues: rulesTold(felts).cues,
    enter: { entry: "Drop", rest: 0 },
    extra: (_node, rig) => {
      const sides = [
        { x: 18, y: 70 },
        { x: 806, y: 112 },
        { x: 26, y: 262 },
        { x: 800, y: 300 },
      ];

      const stamps = RULE_STAMPS.map((stamp, index) => {
        const node = el("div", "lv-stamp", stamp.word);

        node.style.background = HOUSE[stamp.colour];
        node.style.fontSize = `${FRAMING.tall ? 21 : 24}px`;
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
        const card = shadowOf(rig.table)?.querySelector(".felt-rules");
        const box = card?.getBoundingClientRect();

        for (const stamp of stamps) {
          const along = sprung(secondsSince(beat, stamp.at), POP);
          const width = stamp.node.offsetWidth;

          const spot =
            FRAMING.tall && box !== undefined
              ? {
                  x:
                    box.left +
                    box.width / 2 -
                    width / 2 +
                    (stamp.index % 2 === 0 ? -16 : 16),
                  y: box.bottom + 12 + stamp.index * 40,
                }
              : (sides[stamp.index] ?? { x: 0, y: 0 });

          stamp.node.style.left = `${spot.x.toFixed(1)}px`;
          stamp.node.style.top = `${spot.y.toFixed(1)}px`;
          const leaving = 1 - eased((beat - 33.5) / 0.6);

          stamp.node.style.opacity = along <= 0 ? "0" : "1";
          stamp.node.style.transform = `scale(${((2.2 - 1.2 * along) * leaving).toFixed(4)}) rotate(${(stamp.tilt * along).toFixed(2)}deg)`;
        }
      };
    },
    from,
    shots: [
      [
        0,
        FRAMING.tall
          ? {
              focus: { kind: "Part", selector: ".felt-rules", dy: 90 },
              zoom: 1.12,
            }
          : { focus: { kind: "Centre" }, zoom: 1 },
      ],
    ],
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

const pictureBox = (): Box =>
  FRAMING.tall
    ? { h: 525, w: 420, x: 40, y: 210 }
    : { h: 490, w: 392, x: 150, y: 25 };

const PICTURE_CAPTION: Box = FRAMING.tall
  ? FRAMING.caption
  : { h: 220, w: 330, x: 580, y: 160 };

const pictureLayer = (
  stage: Stage,
  svg: string,
  from: number,
  until: number,
  enter: Enter
) =>
  layerOf(stage, {
    box: pictureBox(),
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
    cues: badBeatTold().cues,
    enter: { entry: "Left", rest: 0 },
    from,
    shots: FRAMING.tall
      ? [
          [0, { focus: { kind: "Centre" }, zoom: 1 }],
          [1, { focus: { kind: "Part", selector: ".strip" }, zoom: 1.25 }],
          [2.7, { focus: { kind: "Centre" }, zoom: 1.12 }],
        ]
      : [
          [0, { focus: { kind: "Centre" }, zoom: 1 }],
          [1, { focus: { kind: "Part", selector: ".strip" }, zoom: 1.35 }],
          [2.7, { focus: { kind: "Centre" }, zoom: 1.1 }],
          [3.9, { focus: { kind: "Seat", name: "Jonas" }, zoom: 1.6 }],
        ],
    until: 41.5,
  });
  pictureLayer(stage, pictureSvg(BAD_BEAT, PICTURE_LOOK), 40, 47, {
    entry: "Rise",
    rest: 2,
  });
  captionLayer(stage, CAPTIONS.BadBeat, 40.3, 45.7, {
    box: PICTURE_CAPTION,
    px: FRAMING.tall ? FRAMING.captionPx : 42,
  });
};

const settleShot = (stage: Stage) => {
  pictureLayer(stage, settleUpSvg(SETTLE_UP, PICTURE_LOOK), 45.6, 53, {
    entry: "Right",
    rest: -2,
  });
  captionLayer(stage, CAPTIONS.Settle, 46.4, 51.7, {
    box: PICTURE_CAPTION,
    px: FRAMING.tall ? FRAMING.captionPx : 42,
    spacing: 0.12,
  });
};

const LITTLE_SHOTS: Readonly<
  Record<LittleScene, readonly (readonly [number, Shot])[]>
> = {
  BombPot: [[0, { focus: { kind: "Centre" }, zoom: 1.15 }]],
  Bounty: [[0, { focus: { kind: "Seat", name: "Kit", dy: 20 }, zoom: 1.4 }]],
  Button: [[0, { focus: { kind: "Centre" }, zoom: 1.2 }]],
  Fairness: [[0, { focus: { kind: "Centre" }, zoom: 1 }]],
  KeepSeat: [[0, { focus: { kind: "Seat", name: "Lou" }, zoom: 1.9 }]],
  Peeking: [[0, { focus: { kind: "Seat", name: "Maya" }, zoom: 2 }]],
  Reaction: [[0, { focus: { kind: "Point", fx: 0.5, fy: 0.72 }, zoom: 1.6 }]],
  RunTwice: [[0, { focus: { kind: "Centre" }, zoom: 1.05 }]],
  ShowOne: [
    [0, { focus: { kind: "Part", selector: ".hand", dy: -30 }, zoom: 1.7 }],
  ],
  Straddle: [[0, { focus: { kind: "Seat", name: "Kit", dy: 30 }, zoom: 1.7 }]],
  Sweep: [[0, { focus: { kind: "Centre" }, zoom: 1.2 }]],
  WaitBig: [
    [0, { focus: { kind: "Part", selector: ".hand", dy: -40 }, zoom: 1.45 }],
  ],
};

const LITTLE_BOX: Box = FRAMING.tall
  ? { h: 500, w: 420, x: 40, y: 222 }
  : { h: 365, w: 620, x: 170, y: 36 };

const fairnessLayer = (
  stage: Stage,
  from: number,
  until: number,
  enter: Enter
) =>
  layerOf(stage, {
    box: LITTLE_BOX,
    build: (node) => {
      const wrap = el("div", "lv-room-wrap page room");
      const header = el("header", "room-header");
      const brand = el("span", "brand small");
      const end = el("span", "bar-end");
      const body = el("div", "room-body");

      const mark = FairMarks.Checked({
        cards: 14,
        round: 18_442_907,
        timing: "InTime",
      });

      brand.append("nostakes", el("span", "beta-tag", "beta"));
      end.append(
        faceTile(CAST.Sam, "Resting", 26),
        el("span", "bar-button", "Menu")
      );
      header.append(
        brand,
        el("span", "bar-button", "Invite"),
        el("span", "bar-button fair-mark", fairSymbol(mark)),
        end
      );

      const rig = tableRig(body, { h: LITTLE_BOX.h - 44, w: LITTLE_BOX.w });

      rig.table.snapshot = LITTLE_TOLD.Sweep().cues[1]?.[1] ?? null;
      lensTransform(
        rig.lens,
        { ...LITTLE_BOX, h: LITTLE_BOX.h - 44, x: 0, y: 0 },
        rig.native,
        { fx: 0, fy: 0, zoom: 1 }
      );
      wrap.append(header, body);
      node.append(wrap);

      const sheet = el("div", "lv-fair-sheet");
      const paragraph = el("p", "fair-text", fairParagraph({ hand: 14, mark }));

      paragraph.style.fontSize = FRAMING.tall ? "15px" : "15px";
      sheet.append(
        el("div", "fair-tonight", "Hand 14  ✓ deck checked"),
        paragraph
      );
      place(
        sheet,
        FRAMING.tall
          ? { h: 300, w: 360, x: 30, y: 70 }
          : { h: 220, w: 420, x: 100, y: 64 }
      );
      node.append(sheet);

      return (beat) => {
        const along = sprung(secondsSince(beat, from + 0.55), POP);

        sheet.style.opacity = along <= 0 ? "0" : "1";
        sheet.style.transform = `translateY(${((1 - along) * 40).toFixed(1)}px) scale(${(0.7 + 0.3 * along).toFixed(4)})`;
      };
    },
    enter,
    from,
    until,
  });

const littleShots = (stage: Stage) => {
  for (const [index, little] of LITTLE_THINGS.entries()) {
    const from = littleStart(index) - 0.25;
    const until = littleStart(index) + LITTLE_BEATS * 3;

    const enter: Enter = {
      entry: index % 2 === 0 ? "Right" : "Left",
      look: { damping: 0.5, frequency: 2.6 },
      rest: index % 2 === 0 ? 1.6 : -1.8,
    };

    if (little.scene === "Fairness") {
      fairnessLayer(stage, from, until, enter);
    } else {
      tableLayer(stage, {
        box: LITTLE_BOX,
        cues: LITTLE_TOLD[little.scene]().cues,
        enter,
        from,
        shots: LITTLE_SHOTS[little.scene].map(
          ([at, shot]) =>
            [
              at,
              {
                ...shot,
                zoom:
                  little.scene === "Bounty"
                    ? shot.zoom
                    : Math.max(shot.zoom, FRAMING.tall ? 1.3 : 1.25),
              },
            ] as const
        ),
        until: index === LITTLE_THINGS.length - 1 ? 77 : until,
      });
    }

    captionLayer(
      stage,
      little.caption,
      littleStart(index) + 0.05,
      littleStart(index) + LITTLE_BEATS - 0.25,
      { px: FRAMING.smallCaptionPx, spacing: 0.08 }
    );
  }

  stage.ticks.push(
    paperBits(
      stage.deco,
      littleStart(0),
      FRAMING.tall ? { x: 40, y: 150 } : { x: 90, y: 60 },
      12,
      52
    ),
    paperBits(
      stage.deco,
      littleStart(0),
      FRAMING.tall ? { x: 460, y: 150 } : { x: 870, y: 60 },
      12,
      53
    )
  );
};

const outroShot = (stage: Stage) => {
  captionLayer(stage, CAPTIONS.Outro, 76.2, 79.6, {
    box: FRAMING.tall
      ? { h: 300, w: 440, x: 30, y: 300 }
      : { h: 200, w: 760, x: 100, y: 170 },
    px: FRAMING.tall ? 44 : 52,
    spacing: 0.22,
  });
  layerOf(stage, {
    box: { h: FRAMING.view.h, w: FRAMING.view.w, x: 0, y: 0 },
    bare: true,
    build: (node) => {
      node.style.background = "var(--color-page)";

      const spots = FRAMING.tall
        ? [
            [70, 150],
            [380, 170],
            [210, 220],
            [60, 640],
            [390, 660],
            [230, 700],
          ]
        : [
            [110, 70],
            [780, 60],
            [450, 50],
            [80, 400],
            [800, 400],
            [460, 420],
          ];

      const cast: readonly (readonly [CastName, Expression])[] = [
        ["Ana", "Happy"],
        ["Ben", "Thinking"],
        ["Kit", "LookingDown"],
        ["Priya", "Happy"],
        ["Jonas", "Gutted"],
        ["Lou", "Happy"],
      ];

      const faces = cast.map(([name, expression], index) => {
        const tile = faceTile(CAST[name], expression, FRAMING.tall ? 64 : 70);
        const [x, y] = spots[index] ?? [0, 0];

        tile.style.position = "absolute";
        tile.style.left = `${x}px`;
        tile.style.top = `${y}px`;
        node.append(tile);

        return tile;
      });

      return (beat) => {
        for (const [index, tile] of faces.entries()) {
          const along = sprung(secondsSince(beat, 76.5 + index * 0.25), POP);
          const bob = Math.sin((beat - 76) * 1.6 + index) * 4;

          tile.style.opacity = along <= 0 ? "0" : "1";
          const gone = 1 - eased((beat - HIT_BEAT) / 0.5);

          tile.style.transform = `translateY(${bob.toFixed(1)}px) scale(${(along * gone).toFixed(4)}) rotate(${((index % 2 === 0 ? -6 : 6) * along).toFixed(1)}deg)`;
        }
      };
    },
    enter: { entry: "Rise", look: SOFT, rest: 0 },
    from: 75.9,
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
    box: { h: FRAMING.view.h, w: FRAMING.view.w, x: 0, y: 0 },
    bare: true,
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
  const parts: string[] = [];

  for (let at = 0; at < bytes.length; at += 0x80_00) {
    parts.push(String.fromCodePoint(...bytes.subarray(at, at + 0x80_00)));
  }

  return btoa(parts.join(""));
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
      { x: FRAMING.view.w * 0.5, y: FRAMING.view.h * 0.35 },
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
          layer.node.style.visibility =
            beat >= layer.from ? "visible" : "hidden";
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
