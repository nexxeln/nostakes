import {
  COLOURS,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  RANKS,
  SPECIES,
  SUITS,
  codeFor,
  randomAvatar,
  render,
} from "@nostakes/avatar";
import type { Avatar, Expression, Theme } from "@nostakes/avatar";

import {
  GLYPHS,
  SUIT_PATHS,
} from "../../../../../packages/avatar/src/prints.js";

export type PartKey = keyof Avatar;

export interface Part {
  readonly key: PartKey;
  readonly label: string;
  readonly options: readonly string[];
  readonly close: boolean;
}

const FISH: Part = {
  close: false,
  key: "species",
  label: "Fish",
  options: SPECIES,
};

export const PARTS: readonly Part[] = [
  FISH,
  { close: false, key: "colour", label: "Colour", options: COLOURS },
  { close: true, key: "suit", label: "Suit", options: SUITS },
  { close: true, key: "rank", label: "Card", options: RANKS },
  { close: true, key: "eyes", label: "Eyes", options: EYES },
  { close: true, key: "mouth", label: "Mouth", options: MOUTHS },
  { close: true, key: "headwear", label: "Hat", options: HEADWEAR },
  { close: true, key: "eyewear", label: "Glasses", options: EYEWEAR },
  { close: true, key: "neck", label: "Neck", options: NECKWEAR },
  { close: true, key: "mark", label: "Mark", options: MARKS },
  { close: true, key: "extra", label: "Extra", options: EXTRAS },
];

export const partOf = (key: PartKey): Part =>
  PARTS.find((part) => part.key === key) ?? FISH;

export const partKeyOf = (name: string | undefined): PartKey | null =>
  PARTS.find((part) => part.key === name)?.key ?? null;

export const wearing = (
  avatar: Avatar,
  part: PartKey,
  option: string
): Avatar => ({ ...avatar, [part]: option });

const spaced = (name: string) =>
  name.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ").toLowerCase();

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const nameOf = (part: PartKey, option: string): string => {
  if (option === "None") {
    return "None";
  }

  if (part === "colour") {
    return sentence(spaced(option).replace(" ", " & "));
  }

  if (part === "suit") {
    return `${option}s`;
  }

  return sentence(spaced(option));
};

type Attrs = Readonly<Record<string, string | number | boolean | undefined>>;

type Child = Node | string | null | false | undefined;

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] => {
  const made = document.createElement(tag);

  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) {
      made.setAttribute(name, "");
    } else if (value !== false && value !== undefined) {
      made.setAttribute(name, String(value));
    }
  }

  for (const child of children) {
    if (child !== null && child !== false && child !== undefined) {
      made.append(child);
    }
  }

  return made;
};

const query = new URLSearchParams(location.search);

const MODULUS = 2_147_483_647;

const askedSeed = Number(query.get("seed") ?? "0");

const [drawnSeed = 1] = crypto.getRandomValues(new Uint32Array(1));

let seed =
  Number.isInteger(askedSeed) && askedSeed > 0
    ? askedSeed
    : 1 + (drawnSeed % (MODULUS - 2));

export const nextSeed = () => {
  seed = (seed * 48_271 + 12_345) % MODULUS;

  return seed;
};

const systemTheme = (): Theme =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light";

const ASKED_THEMES = new Map<string, Theme>([
  ["dark", "Dark"],
  ["light", "Light"],
]);

interface State {
  avatar: Avatar;
  past: Avatar[];
  preview: Avatar | null;
  expression: Expression;
  theme: Theme;
  shuffled: boolean;
  done: boolean;
}

export const state: State = {
  avatar: randomAvatar(nextSeed()),
  done: false,
  expression: "Resting",
  past: [],
  preview: null,
  shuffled: false,
  theme: ASKED_THEMES.get(query.get("theme") ?? "") ?? systemTheme(),
};

export const shown = (): Avatar => state.preview ?? state.avatar;

const painters: (() => void)[] = [];

export const onPaint = (painter: () => void) => {
  painters.push(painter);
};

export const paint = () => {
  document.documentElement.dataset.theme = state.theme.toLowerCase();

  for (const painter of painters) {
    painter();
  }
};

const live = el("div", { "aria-live": "polite", class: "sr-only" });

export const say = (text: string) => {
  live.textContent = text;
};

export const same = (one: Avatar, other: Avatar) =>
  codeFor(one) === codeFor(other);

const PAST_KEPT = 40;

export const commit = (next: Avatar, told = "") => {
  state.preview = null;

  if (same(next, state.avatar)) {
    paint();

    return;
  }

  state.past = [...state.past, state.avatar].slice(-PAST_KEPT);
  state.avatar = next;

  if (told !== "") {
    say(told);
  }

  paint();
};

export const choose = (part: PartKey, option: string) => {
  commit(
    wearing(state.avatar, part, option),
    `${partOf(part).label}: ${nameOf(part, option)}`
  );
};

export const undo = () => {
  const before = state.past.at(-1);

  if (before === undefined) {
    return;
  }

  state.past = state.past.slice(0, -1);
  state.avatar = before;
  state.preview = null;
  say("Back to the face before");
  paint();
};

const calm = matchMedia("(prefers-reduced-motion: reduce)");

const APART_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const APART_X = 2;

const APART_Y = -2.6;

export const pullApart = (host: Element, duration = 820, stagger = 18) => {
  if (calm.matches) {
    return;
  }

  for (const sheet of host.querySelectorAll<SVGGElement>("g.sheet")) {
    const index = Number(sheet.style.getPropertyValue("--sheet"));

    sheet.animate(
      [
        { transform: "translate(0px, 0px)" },
        {
          offset: 0.45,
          transform: `translate(${index * APART_X}px, ${index * APART_Y}px)`,
        },
        { transform: "translate(0px, 0px)" },
      ],
      { delay: index * stagger, duration, easing: APART_EASE }
    );
  }
};

export const flourish = () => {
  state.shuffled = true;
};

export const shuffle = () => {
  flourish();
  commit(randomAvatar(nextSeed()), "A new face");
};

export const preview = (avatar: Avatar | null) => {
  if (
    (avatar === null && state.preview === null) ||
    (avatar !== null && state.preview !== null && same(avatar, state.preview))
  ) {
    return;
  }

  state.preview = avatar;
  paint();
};

const paintKey = (host: HTMLElement, key: string, markup: () => string) => {
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    host.innerHTML = markup();
  }
};

export interface Look {
  readonly size: number;
  readonly expression?: Expression;
  readonly layers?: boolean;
}

export const faceInto = (host: HTMLElement, avatar: Avatar, look: Look) => {
  const expression = look.expression ?? "Resting";
  const size = Math.round(look.size);

  paintKey(
    host,
    `${codeFor(avatar)}/${expression}/${size}/${state.theme}/${look.layers === true}`,
    () =>
      `<span class="full">${render(avatar, {
        expression,
        layers: look.layers === true,
        size,
        theme: state.theme,
      })}</span>`
  );
};

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const FULL: Box = { h: 100, w: 100, x: 0, y: 0 };

const bench = el("div", { "aria-hidden": "true", class: "bench" });

const neutral = (species: Avatar["species"]): Avatar => ({
  colour: "BlueYellow",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Line",
  neck: "None",
  rank: "Ace",
  species,
  suit: "Spade",
});

const piecesOf = (avatar: Avatar, expression: Expression = "Resting") => {
  if (!bench.isConnected) {
    document.body.append(bench);
  }

  bench.innerHTML = render(avatar, {
    expression,
    layers: true,
    size: 100,
    theme: "Light",
  });

  const frame = bench.firstElementChild?.getBoundingClientRect();
  const found = new Map<string, Box>();

  for (const piece of bench.querySelectorAll("g.sheet > *")) {
    const rect = piece.getBoundingClientRect();

    found.set(piece.outerHTML, {
      h: rect.height,
      w: rect.width,
      x: rect.left - (frame?.left ?? 0),
      y: rect.top - (frame?.top ?? 0),
    });
  }

  return found;
};

const union = (boxes: readonly Box[]): Box => {
  if (boxes.length === 0) {
    return FULL;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));

  return { h: bottom - top, w: right - left, x: left, y: top };
};

const zones = new Map<string, Box>();

const ZONE_SOURCE: Partial<Record<PartKey, PartKey>> = { suit: "rank" };

const OWN_ZONES: ReadonlySet<PartKey> = new Set(["mark"]);

const measureZones = (species: Avatar["species"], key: PartKey) => {
  const { options } = partOf(key);

  const renders = options.map((option) =>
    piecesOf(wearing(neutral(species), key, option))
  );

  const varying = renders.map((pieces) =>
    [...pieces].flatMap(([markup, box]) =>
      renders.every((other) => other.has(markup)) ? [] : [box]
    )
  );

  const whole = union(varying.flat());

  zones.set(`${species}/${key}`, whole);

  for (const [index, option] of options.entries()) {
    const own = varying[index] ?? [];

    zones.set(
      `${species}/${key}/${option}`,
      own.length === 0 || !OWN_ZONES.has(key) ? whole : union(own)
    );
  }
};

export const zoneOf = (
  species: Avatar["species"],
  asked: PartKey,
  option = ""
): Box => {
  const key = ZONE_SOURCE[asked] ?? asked;

  if (key === "species" || key === "colour") {
    return FULL;
  }

  const name =
    option === "" || key !== asked
      ? `${species}/${key}`
      : `${species}/${key}/${option}`;

  if (!zones.has(name)) {
    measureZones(species, key);
  }

  return zones.get(name) ?? FULL;
};

interface Framing {
  readonly pad: number;
  readonly least: number;
  readonly centred?: boolean;
}

const FRAMING: Partial<Record<PartKey, Framing>> = {
  extra: { least: 34, pad: 5 },
  eyes: { least: 30, pad: 5 },
  eyewear: { least: 40, pad: 4 },
  headwear: { least: 50, pad: 4 },
  mark: { least: 46, pad: 4 },
  mouth: { least: 34, pad: 5 },
  neck: { least: 40, pad: 5 },
  rank: { centred: true, least: 26, pad: 4 },
  suit: { centred: true, least: 26, pad: 4 },
};

const NO_FRAMING: Framing = { least: 100, pad: 0 };

const FACE_MIDDLE = 50;

const toward = (middle: number, span: number, view: number) => {
  const spare = Math.max(0, (view - span) / 2);

  return Math.min(Math.max(FACE_MIDDLE, middle - spare), middle + spare);
};

export const framed = (
  avatar: Avatar,
  part: PartKey,
  wide: number,
  high: number
) => {
  const zone = zoneOf(avatar.species, part, avatar[part]);
  const asked = FRAMING[part] ?? NO_FRAMING;

  const framing =
    part === "mark"
      ? { ...asked, least: Math.min(asked.least, Math.max(28, wide / 1.6)) }
      : asked;

  const spanX = zone.w + framing.pad * 2;
  const spanY = zone.h + framing.pad * 2;

  const scale = Math.max(
    Math.min(
      wide / Math.max(spanX, framing.least),
      high / Math.max(spanY, framing.least)
    ),
    wide / 104
  );

  const kept = framing.centred === true ? Number.POSITIVE_INFINITY : 0;

  const middleX = toward(
    zone.x + zone.w / 2,
    Math.max(spanX, framing.least, kept),
    wide / scale
  );

  const middleY = toward(
    zone.y + zone.h / 2,
    Math.max(spanY, framing.least, kept),
    high / scale
  );

  return {
    left: wide / 2 - middleX * scale,
    size: Math.round(scale * 100),
    top: high / 2 - middleY * scale,
  };
};

export const cropInto = (
  host: HTMLElement,
  avatar: Avatar,
  part: PartKey,
  expression: Expression = "Resting"
) => {
  const rect = host.getBoundingClientRect();
  const wide = Math.round(rect.width);
  const high = Math.round(rect.height);

  if (wide === 0 || high === 0) {
    return;
  }

  const { left, size, top } = framed(avatar, part, wide, high);

  paintKey(
    host,
    `${codeFor(avatar)}/${part}/${expression}/${wide}x${high}/${state.theme}`,
    () =>
      `<span class="crop" style="width:${size}px;height:${size}px;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px">${render(
        avatar,
        { expression, size, theme: state.theme }
      )}</span>`
  );
};

export const eyesShown = (avatar: Avatar, part: PartKey): Avatar =>
  part === "eyes" && avatar.eyewear === "Shades"
    ? { ...avatar, eyewear: "None" }
    : avatar;

export const artInto = (host: HTMLElement, avatar: Avatar, part: PartKey) => {
  if (partOf(part).close) {
    cropInto(host, eyesShown(avatar, part), part);
  } else {
    const rect = host.getBoundingClientRect();

    faceInto(host, avatar, { size: Math.min(rect.width, rect.height) });
  }
};

type Step = (at: number, count: number) => number;

const onward: Step = (at, count) => (at + 1) % count;

const back: Step = (at, count) => (at - 1 + count) % count;

const STEPS = new Map<string, Step>([
  ["ArrowRight", onward],
  ["ArrowDown", onward],
  ["ArrowLeft", back],
  ["ArrowUp", back],
  ["Home", () => 0],
  ["End", (_at, count) => count - 1],
]);

export const rove = (group: HTMLElement, selector: string) => {
  group.addEventListener("keydown", (event) => {
    const items = [...group.querySelectorAll<HTMLElement>(selector)];
    const at = items.findIndex((item) => item.matches(":focus"));
    const step = STEPS.get(event.key);

    if (at === -1 || step === undefined) {
      return;
    }

    const next = items[step(at, items.length)];

    event.preventDefault();
    next?.focus();
    next?.click();
  });
};

const fine = matchMedia("(hover: hover) and (pointer: fine)");

export const cornerIndex = (avatar: Avatar) => {
  const corner = el("span", {
    "aria-hidden": "true",
    class: `corner is-${avatar.suit.toLowerCase()}`,
  });

  corner.innerHTML = `<svg viewBox="-6 -6 12 23" width="14" height="27"><path d="${GLYPHS[avatar.rank]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="${SUIT_PATHS[avatar.suit]}" fill="currentColor" transform="translate(-4.4 7.4) scale(0.088)"/></svg>`;

  return corner;
};

export interface GroupOptions {
  readonly previews?: boolean;
}

export const partGroup = (part: Part, options: GroupOptions = {}) => {
  const tiles = part.options.map((option) => {
    const art = el("span", { "aria-hidden": "true", class: "tile-art" });

    const button = el(
      "button",
      {
        "aria-label": nameOf(part.key, option),
        class: "tile",
        "data-option": option,
        role: "radio",
        title: nameOf(part.key, option),
        type: "button",
      },
      art
    );

    return { art, button, option };
  });

  const name = el("span", { class: "group-picked" });

  const list = el(
    "div",
    { "aria-label": part.label, class: "tiles", role: "radiogroup" },
    ...tiles.map((tile) => tile.button)
  );

  const group = el(
    "section",
    { class: "group", "data-part": part.key },
    el("h3", { class: "group-label" }, part.label, name),
    list
  );

  const candidate = (option: string) => wearing(state.avatar, part.key, option);

  for (const { button, option } of tiles) {
    button.addEventListener("click", () => {
      choose(part.key, option);
    });

    if (options.previews === true) {
      button.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse" && fine.matches) {
          preview(candidate(option));
        }
      });
      button.addEventListener("pointerleave", () => {
        preview(null);
      });
    }
  }

  rove(list, ".tile");

  const repaint = () => {
    if (group.offsetParent === null) {
      return;
    }

    name.textContent = nameOf(part.key, state.avatar[part.key]);

    for (const { art, button, option } of tiles) {
      const picked = state.avatar[part.key] === option;

      button.setAttribute("aria-checked", String(picked));
      button.tabIndex = picked ? 0 : -1;
      artInto(art, candidate(option), part.key);
    }
  };

  onPaint(repaint);

  return group;
};

export const wall = (options: GroupOptions = {}) =>
  el(
    "div",
    { class: "wall" },
    ...PARTS.map((part) => partGroup(part, options))
  );

export const bigFace = () => {
  const host = el("span", { class: "big-art" });

  const frame = el(
    "div",
    { "aria-label": "Your face", class: "big", role: "img" },
    host
  );

  onPaint(() => {
    const size = frame.getBoundingClientRect().width;

    if (size === 0) {
      return;
    }

    frame.classList.toggle("is-trying", state.preview !== null);

    if (frame.dataset.kept !== codeFor(state.avatar)) {
      const first = frame.dataset.kept === undefined;

      frame.dataset.kept = codeFor(state.avatar);

      if (!first) {
        frame.classList.remove("is-changed");
        void frame.offsetWidth;
        frame.classList.add("is-changed");
      }
    }

    faceInto(host, shown(), {
      expression: state.expression,
      layers: true,
      size,
    });

    if (state.shuffled) {
      state.shuffled = false;
      pullApart(host);
    }
  });

  return frame;
};

export const MOODS: readonly { expression: Expression; label: string }[] = [
  { expression: "Resting", label: "Waiting" },
  { expression: "LookingDown", label: "Peeking" },
  { expression: "Thinking", label: "Thinking" },
  { expression: "Happy", label: "Won" },
  { expression: "Gutted", label: "Lost" },
  { expression: "Folded", label: "Folded" },
];

export const mirror = () => {
  const caption = el("span", { class: "mirror-mood" });

  const faces = MOODS.map(({ expression, label }) => {
    const art = el("span", { "aria-hidden": "true", class: "mirror-art" });

    const button = el(
      "button",
      {
        "aria-label": label,
        class: "mirror-face",
        "data-mood": expression,
        title: label,
        type: "button",
      },
      art
    );

    return { art, button, expression };
  });

  for (const { button, expression } of faces) {
    const show = () => {
      state.expression = expression;
      paint();
    };

    button.addEventListener("click", show);
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && fine.matches) {
        show();
      }
    });
    button.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && fine.matches) {
        state.expression = "Resting";
        paint();
      }
    });
  }

  const row = el(
    "div",
    { "aria-label": "At the table", class: "mirror-row", role: "group" },
    ...faces.map((face) => face.button)
  );

  rove(row, ".mirror-face");

  const box = el(
    "div",
    { class: "mirror" },
    el("p", { class: "mirror-label" }, "At the table", caption),
    row
  );

  onPaint(() => {
    const mood = MOODS.find((each) => each.expression === state.expression);

    caption.textContent = mood?.label ?? "";

    for (const { art, button, expression } of faces) {
      const size = art.getBoundingClientRect().width;
      const showing = expression === state.expression;

      button.setAttribute("aria-pressed", String(showing));
      button.tabIndex = showing ? 0 : -1;

      if (size > 0) {
        faceInto(art, shown(), { expression, size });
      }
    }
  });

  return box;
};

const UNDO_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4"/><path d="M3 8h8.5a5 5 0 0 1 0 10H8"/></svg>`;

const SUN = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg>`;

const MOON = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/></svg>`;

export const undoButton = () => {
  const art = el("span", { "aria-hidden": "true", class: "undo-art" });
  const icon = el("span", { "aria-hidden": "true", class: "undo-icon" });

  icon.innerHTML = UNDO_ICON;

  const button = el(
    "button",
    {
      "aria-keyshortcuts": "Z",
      "aria-label": "Back to the face before",
      class: "button undo",
      title: "Back to the face before (Z)",
      type: "button",
    },
    art,
    icon
  );

  button.addEventListener("click", undo);

  onPaint(() => {
    const before = state.past.at(-1);

    button.disabled = before === undefined;

    if (before === undefined) {
      delete art.dataset.key;
      art.innerHTML = "";
    } else {
      faceInto(art, before, { size: 36 });
    }
  });

  return button;
};

export const shuffleButton = (label = "Shuffle", run: () => void = shuffle) => {
  const button = el(
    "button",
    {
      "aria-keyshortcuts": "S",
      class: "button shuffle",
      title: `${label} (S)`,
      type: "button",
    },
    label
  );

  button.addEventListener("click", run);

  return button;
};

export const themeSwitch = () => {
  const button = el("button", {
    "aria-label": "Switch theme",
    class: "theme-switch",
    title: "Switch theme",
    type: "button",
  });

  button.addEventListener("click", () => {
    state.theme = state.theme === "Light" ? "Dark" : "Light";
    paint();
  });

  onPaint(() => {
    button.innerHTML = state.theme === "Light" ? MOON : SUN;
  });

  return button;
};

export const doneButton = () => {
  const button = el(
    "button",
    { class: "button primary done-button", type: "button" },
    "Done"
  );

  button.addEventListener("click", () => {
    state.done = true;
    state.preview = null;
    state.expression = "Resting";
    say("Face kept");
    paint();
  });

  return button;
};

const doneSheet = () => {
  const art = el("span", { "aria-hidden": "true", class: "kept-art" });
  const seat = el("span", { "aria-hidden": "true", class: "kept-seat" });

  const again = el(
    "button",
    { class: "button", type: "button" },
    "Keep changing"
  );

  const sheet = el(
    "div",
    { class: "kept", hidden: true },
    el(
      "section",
      {
        "aria-label": "Face kept",
        "aria-modal": "true",
        class: "kept-panel",
        role: "dialog",
      },
      art,
      el("p", { class: "kept-title" }, "That's you."),
      el("div", { class: "kept-table" }, seat, el("span", {}, "At the table")),
      again
    )
  );

  again.addEventListener("click", () => {
    state.done = false;
    paint();
  });

  onPaint(() => {
    const opening = sheet.hasAttribute("hidden") && state.done;

    sheet.toggleAttribute("hidden", !state.done);

    if (state.done) {
      faceInto(art, state.avatar, {
        expression: "Happy",
        layers: true,
        size: 176,
      });
      faceInto(seat, state.avatar, { size: 48 });
    }

    if (opening) {
      again.focus();
    }
  });

  return sheet;
};

export type Keys = Readonly<Record<string, () => void>>;

export const mount = (page: HTMLElement, keys: Keys = {}) => {
  const app = document.querySelector("#app");

  app?.append(page, doneSheet(), live);
  document.body.append(bench);

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Escape" && state.done) {
      state.done = false;
      paint();

      return;
    }

    const run = { z: undo, ...keys }[event.key.toLowerCase()];

    if (run !== undefined && !state.done) {
      event.preventDefault();
      run();
    }
  });

  let waiting = 0;

  addEventListener("resize", () => {
    cancelAnimationFrame(waiting);
    waiting = requestAnimationFrame(paint);
  });

  paint();
  requestAnimationFrame(paint);
  document.fonts.addEventListener("loadingdone", paint);
};
