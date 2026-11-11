import { render } from "@nostakes/avatar";
import type { Avatar } from "@nostakes/avatar";

import {
  PARTS,
  artInto,
  choose,
  commit,
  doneButton,
  el,
  faceInto,
  mirror,
  mount,
  nameOf,
  onPaint,
  paint,
  partGroup,
  partKeyOf,
  partOf,
  preview,
  pullApart,
  shown,
  shuffle,
  shuffleButton,
  state,
  themeSwitch,
  undoButton,
  wearing,
  zoneOf,
} from "./lib.js";
import type { Box, PartKey } from "./lib.js";

const TAGGED: readonly PartKey[] = [
  "headwear",
  "eyewear",
  "extra",
  "mark",
  "neck",
  "mouth",
  "eyes",
  "rank",
];

const LEFT: readonly PartKey[] = ["headwear", "eyes", "mouth", "neck"];

const RIGHT: readonly PartKey[] = ["rank", "eyewear", "mark", "extra"];

const QUIET: readonly PartKey[] = ["species", "colour", "suit"];

const ORDER: readonly PartKey[] = PARTS.map((part) => part.key);

const SCRUB_STEP_PX = 34;

const SCRUB_START_PX = 10;

const APART_MS = 620;

const APART_STAGGER_MS = 14;

let held: PartKey = "species";

let apart = false;

let learned = false;

let hovered: PartKey | null = null;

const optionsOf = (key: PartKey) => partOf(key).options;

const stepped = (avatar: Avatar, key: PartKey, by: number): Avatar => {
  const options = optionsOf(key);
  const at = options.indexOf(avatar[key]);
  const to = (((at + by) % options.length) + options.length) % options.length;

  return wearing(avatar, key, options[to] ?? avatar[key]);
};

const hold = (key: PartKey) => {
  if (held !== key) {
    held = key;
    apart = true;
  }

  paint();
};

const step = (by: number) => {
  learned = true;
  choose(held, stepped(state.avatar, held, by)[held]);
};

const tabs = new Map<PartKey, HTMLButtonElement>();

const tab = (key: PartKey) => {
  const part = partOf(key);

  const button = el(
    "button",
    { class: "b-tab", "data-part": key, type: "button" },
    el("span", { "aria-hidden": "true", class: "b-tab-art" }),
    el(
      "span",
      { class: "b-tab-text" },
      el("span", { class: "b-tab-label" }, part.label),
      el("span", { class: "b-tab-name" })
    )
  );

  button.addEventListener("click", () => {
    hold(key);
  });
  tabs.set(key, button);

  return button;
};

const art = el("span", { class: "b-art" });

const dots = el("div", { "aria-hidden": "true", class: "b-dots" });

const face = el(
  "div",
  { "aria-label": "Your face", class: "b-face", role: "img" },
  art,
  dots
);

const left = el("div", { class: "b-side is-left" }, ...LEFT.map(tab));

const right = el("div", { class: "b-side is-right" }, ...RIGHT.map(tab));

const SVG = "http://www.w3.org/2000/svg";

const lines = document.createElementNS(SVG, "svg");

lines.setAttribute("class", "b-lines");

lines.setAttribute("aria-hidden", "true");

const stage = el("div", { class: "b-stage" }, left, face, right);

stage.append(lines);

const scratch = el("div");

const markupOf = (avatar: Avatar, size: number) => {
  scratch.innerHTML = render(avatar, {
    expression: state.expression,
    layers: true,
    size,
    theme: state.theme,
  });

  return new Set(
    [...scratch.querySelectorAll("g.sheet > *")].map((piece) => piece.outerHTML)
  );
};

const without = (avatar: Avatar, key: PartKey): Avatar | null => {
  const options = optionsOf(key);

  if (options[0] === "None") {
    return avatar[key] === "None" ? null : wearing(avatar, key, "None");
  }

  return stepped(avatar, key, 1);
};

const artFrame = () =>
  art.querySelector("svg")?.getBoundingClientRect() ??
  face.getBoundingClientRect();

const unitBox = (piece: Element, frame: DOMRect): Box => {
  const rect = piece.getBoundingClientRect();
  const unit = 100 / frame.width;

  return {
    h: rect.height * unit,
    w: rect.width * unit,
    x: (rect.left - frame.left) * unit,
    y: (rect.top - frame.top) * unit,
  };
};

const CARD_AREA = 1400;

const touches = (one: Box, other: Box) =>
  one.x < other.x + other.w &&
  other.x < one.x + one.w &&
  one.y < other.y + other.h &&
  other.y < one.y + one.h;

const tag = (avatar: Avatar, size: number) => {
  const pieces = [...art.querySelectorAll<SVGElement>("g.sheet > *")];
  const markup = pieces.map((piece) => piece.outerHTML);
  const frame = artFrame();

  for (const key of TAGGED) {
    const other = without(avatar, key);

    if (other !== null) {
      const there = markupOf(other, size);

      for (const [index, piece] of pieces.entries()) {
        if (
          piece.dataset.part === undefined &&
          !there.has(markup[index] ?? "")
        ) {
          piece.dataset.part = key;
        }
      }
    }
  }

  const glyphs = pieces.filter((piece) => piece.dataset.part === "rank");

  for (const glyph of glyphs) {
    const mine = unitBox(glyph, frame);

    for (const piece of pieces) {
      const box = unitBox(piece, frame);

      if (
        piece.dataset.part === undefined &&
        box.w * box.h < CARD_AREA &&
        touches(mine, box)
      ) {
        piece.dataset.part = "rank";
      }
    }
  }
};

const ZONE_MARGIN = 3;

const partAt = (event: PointerEvent | WheelEvent): PartKey => {
  const hit =
    event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-part]")
      : null;

  const tagged =
    hit !== null && art.contains(hit) ? partKeyOf(hit.dataset.part) : null;

  if (tagged !== null) {
    return tagged;
  }

  const frame = artFrame();
  const x = ((event.clientX - frame.left) / frame.width) * 100;
  const y = ((event.clientY - frame.top) / frame.height) * 100;
  const { avatar } = state;

  const under = TAGGED.flatMap((key) => {
    const zone = zoneOf(avatar.species, key, avatar[key]);

    return x > zone.x - ZONE_MARGIN &&
      x < zone.x + zone.w + ZONE_MARGIN &&
      y > zone.y - ZONE_MARGIN &&
      y < zone.y + zone.h + ZONE_MARGIN
      ? [{ area: zone.w * zone.h, key }]
      : [];
  }).toSorted((one, other) => one.area - other.area);

  return under[0]?.key ?? "species";
};

const showHover = () => {
  for (const piece of art.querySelectorAll<SVGElement>("[data-part]")) {
    piece.classList.toggle("is-hover", piece.dataset.part === hovered);
  }

  for (const [key, button] of tabs) {
    button.classList.toggle("is-hover", key === hovered);
  }
};

interface Drag {
  readonly x: number;
  readonly y: number;
  readonly part: PartKey;
  moved: boolean;
}

let drag: Drag | null = null;

face.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  drag = {
    moved: false,
    part: partAt(event),
    x: event.clientX,
    y: event.clientY,
  };
  face.setPointerCapture(event.pointerId);
});

face.addEventListener("pointermove", (event) => {
  if (drag === null) {
    if (event.pointerType === "mouse") {
      const over = partAt(event);

      if (over !== hovered) {
        hovered = over;
        showHover();
      }
    }

    return;
  }

  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;

  if (
    !drag.moved &&
    Math.abs(dx) > SCRUB_START_PX &&
    Math.abs(dx) > Math.abs(dy)
  ) {
    drag.moved = true;
    held = drag.part;
    face.classList.add("is-scrubbing");
  }

  if (drag.moved) {
    preview(stepped(state.avatar, held, Math.round(dx / SCRUB_STEP_PX)));
  }
});

const release = (event: PointerEvent) => {
  const ended = drag;

  drag = null;
  face.classList.remove("is-scrubbing");

  if (ended === null) {
    return;
  }

  if (event.type === "pointercancel") {
    preview(null);

    return;
  }

  if (ended.moved) {
    const tried = state.preview;

    learned = true;

    if (tried === null) {
      paint();
    } else {
      commit(tried, `${partOf(held).label}: ${nameOf(held, tried[held])}`);
    }
  } else if (ended.part === held) {
    step(1);
  } else {
    hold(ended.part);
  }
};

face.addEventListener("pointerup", release);

face.addEventListener("pointercancel", release);

face.addEventListener("pointerleave", () => {
  if (hovered !== null) {
    hovered = null;
    showHover();
  }
});

const WHEEL_STEP = 40;

let wheeled = 0;

face.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    wheeled += event.deltaY + event.deltaX;

    if (Math.abs(wheeled) >= WHEEL_STEP) {
      const over = partAt(event);

      if (over !== held && hovered !== null) {
        held = over;
      }

      step(Math.sign(wheeled));
      wheeled = 0;
    }
  },
  { passive: false }
);

type Side = "left" | "right";

const BIAS: Readonly<Partial<Record<PartKey, number>>> = {
  extra: 6,
  eyes: -6,
  eyewear: 2,
  headwear: -8,
  mark: 4,
  mouth: -4,
  neck: -2,
  rank: 8,
};

const zoneNow = (key: PartKey) => {
  const { avatar } = state;

  return zoneOf(avatar.species, key, avatar[key]);
};

const targetOf = (key: PartKey, side: Side) => {
  const zone = zoneNow(key);

  return {
    x: zone.x + zone.w * (side === "left" ? 0.14 : 0.86),
    y: zone.y + zone.h / 2,
  };
};

let sides: Readonly<Record<Side, readonly PartKey[]>> = {
  left: LEFT,
  right: RIGHT,
};

const lean = (key: PartKey) => {
  const zone = zoneNow(key);

  return zone.x + zone.w / 2 + (BIAS[key] ?? 0);
};

const down = (keys: readonly PartKey[], side: Side) =>
  keys.toSorted(
    (one, other) => targetOf(one, side).y - targetOf(other, side).y
  );

const partNamed = (child: Element) =>
  child instanceof HTMLElement ? (child.dataset.part ?? "") : "";

const sortSides = () => {
  const across = TAGGED.toSorted((one, other) => lean(one) - lean(other));

  sides = {
    left: down(across.slice(0, 4), "left"),
    right: down(across.slice(4), "right"),
  };

  for (const [side, column] of [
    ["left", left],
    ["right", right],
  ] as const) {
    const now = [...column.children].map(partNamed);

    if (sides[side].join(",") !== now.join(",")) {
      const focused = document.activeElement;

      for (const key of sides[side]) {
        const button = tabs.get(key);

        if (button !== undefined) {
          column.append(button);
        }
      }

      if (focused instanceof HTMLElement && column.contains(focused)) {
        focused.focus();
      }
    }
  }
};

const paintLines = () => {
  const around = stage.getBoundingClientRect();
  const frame = artFrame();
  const drawn: string[] = [];

  for (const side of ["left", "right"] as const) {
    for (const key of sides[side]) {
      const button = tabs.get(key)?.getBoundingClientRect();

      if (button !== undefined) {
        const target = targetOf(key, side);
        const edge = side === "left" ? button.right : button.left;
        const fromX = edge - around.left;
        const fromY = button.top + button.height / 2 - around.top;
        const toX = frame.left + (target.x / 100) * frame.width - around.left;
        const toY = frame.top + (target.y / 100) * frame.height - around.top;
        const name = key === held ? "b-line is-held" : "b-line";

        drawn.push(
          `<path class="${name}" d="M${fromX.toFixed(1)} ${fromY.toFixed(1)}L${toX.toFixed(1)} ${toY.toFixed(1)}"/><circle class="${name}" cx="${toX.toFixed(1)}" cy="${toY.toFixed(1)}" r="3"/>`
        );
      }
    }
  }

  lines.setAttribute("viewBox", `0 0 ${around.width} ${around.height}`);
  lines.innerHTML = drawn.join("");
};

const hint = el("p", { class: "b-hint" });

const fine = matchMedia("(hover: hover) and (pointer: fine)");

let groups: readonly HTMLElement[] = [];

onPaint(() => {
  for (const group of groups) {
    group.hidden = group.dataset.part !== held;
  }
});

groups = PARTS.map((part) => partGroup(part, { previews: true }));

const rail = el("section", { class: "b-rail" }, ...groups);

onPaint(() => {
  const size = Math.round(face.getBoundingClientRect().width);

  if (size === 0) {
    return;
  }

  const avatar = shown();
  const before = art.dataset.key;

  sortSides();
  faceInto(art, avatar, {
    expression: state.expression,
    layers: true,
    size,
  });

  if (art.dataset.key !== before) {
    tag(avatar, size);
  }

  for (const piece of art.querySelectorAll<SVGElement>("[data-part]")) {
    piece.classList.toggle("is-held", piece.dataset.part === held);
  }

  if (apart || state.shuffled) {
    apart = false;
    state.shuffled = false;
    pullApart(art, APART_MS, APART_STAGGER_MS);
  }

  showHover();

  const options = optionsOf(held);

  dots.innerHTML = options
    .map((option) =>
      option === avatar[held] ? '<i class="is-on"></i>' : "<i></i>"
    )
    .join("");

  for (const [key, button] of tabs) {
    const name = nameOf(key, state.avatar[key]);
    const picture = button.querySelector<HTMLElement>(".b-tab-art");
    const text = button.querySelector(".b-tab-name");

    button.setAttribute("aria-pressed", String(key === held));
    button.setAttribute("aria-label", `${partOf(key).label}: ${name}`);

    if (text !== null) {
      text.textContent = name;
    }

    if (picture !== null && picture.offsetParent !== null) {
      artInto(picture, state.avatar, key);
    }
  }

  hint.textContent = fine.matches
    ? "Click a part. Drag or scroll to flip."
    : "Tap a part. Swipe to flip.";
  hint.classList.toggle("is-learned", learned);
  paintLines();
});

const page = el(
  "div",
  { class: "b-page" },
  el(
    "div",
    { class: "b-main" },
    stage,
    el("div", { class: "b-quiet" }, ...QUIET.map(tab)),
    hint
  ),
  el(
    "div",
    { class: "b-panel" },
    rail,
    mirror(),
    el(
      "footer",
      { class: "bar" },
      undoButton(),
      shuffleButton(),
      themeSwitch(),
      doneButton()
    )
  )
);

const focusedTab = () => {
  const active = document.activeElement;

  return active instanceof HTMLElement && active.classList.contains("b-tab")
    ? partKeyOf(active.dataset.part)
    : null;
};

const inGroup = () =>
  (document.activeElement?.closest(".tiles, .mirror-row") ?? null) !== null;

const flip = (by: number) => () => {
  if (inGroup()) {
    return;
  }

  const onTab = focusedTab();

  if (onTab !== null && onTab !== held) {
    held = onTab;
  }

  step(by);
};

const move = (by: number) => () => {
  if (inGroup()) {
    return;
  }

  const at = ORDER.indexOf(held);
  const to = ORDER[(at + by + ORDER.length) % ORDER.length] ?? "species";
  const wasOnTab = focusedTab() !== null;

  hold(to);

  if (wasOnTab) {
    tabs.get(to)?.focus();
  }
};

mount(page, {
  arrowdown: move(1),
  arrowleft: flip(-1),
  arrowright: flip(1),
  arrowup: move(-1),
  s: shuffle,
});
