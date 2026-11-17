import type { Reaction } from "@nostakes/room";

import { el, svgEl } from "./dom.js";
import type { Pt } from "./layout.js";

export type Mood = "Gutted" | "Happy" | "Thinking";

export interface Hit {
  readonly glyph: string;
  readonly face: HTMLElement | null;
  readonly fx: HTMLElement;
  readonly at: Pt;
  readonly size: number;
  readonly room: { readonly left: number; readonly right: number };
  readonly toward: Pt;
}

export interface Part {
  readonly mood: Mood;
  readonly moodMs: number;
  readonly play: ((hit: Hit) => void) | null;
}

export interface Felt extends Part {
  readonly riseMs: number | null;
}

export interface Thrown {
  readonly target: Part;
  readonly sender: Part | null;
  readonly windUp: Part | null;
  readonly riseMs: number | null;
}

const placed = (fx: HTMLElement, className: string, at: Pt) => {
  const node = el("div", `gag ${className}`, fx);

  node.style.left = `${at.x.toFixed(1)}px`;
  node.style.top = `${at.y.toFixed(1)}px`;

  return node;
};

const played = (
  node: HTMLElement,
  frames: Keyframe[],
  options: KeyframeAnimationOptions
) => {
  node
    .animate(frames, { fill: "both", ...options })
    .addEventListener("finish", () => {
      node.remove();
    });
};

const moved = (face: HTMLElement | null, frames: Keyframe[], ms: number) => {
  face?.animate(frames, { duration: ms, easing: "ease-out" });
};

const svgBox = (parent: HTMLElement, size: number, view: number) => {
  const svg = svgEl("svg", parent);

  svg.setAttribute("viewBox", `0 0 ${view} ${view}`);
  svg.setAttribute("width", size.toFixed(1));
  svg.setAttribute("height", size.toFixed(1));

  return svg;
};

const pathOf = (points: readonly Pt[]) =>
  `M${points.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

const sheet = (
  parent: SVGElement,
  d: string,
  fill: string,
  outline = false
) => {
  const under = svgEl("path", parent);

  under.setAttribute("d", d);
  under.setAttribute("fill", "var(--color-sheet-shadow)");
  under.setAttribute("transform", "translate(2.2 2.6)");

  const top = svgEl("path", parent);

  top.setAttribute("d", d);
  top.setAttribute("fill", fill);

  if (outline) {
    top.setAttribute("stroke", "var(--color-ink)");
    top.setAttribute("stroke-width", "2.2");
    top.setAttribute("stroke-linejoin", "round");
  }

  return top;
};

const blob = (count: number, radius: number, wobble: number, seed: number) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;

    const reach =
      radius *
      (index % 2 === 0 ? 1 : 1 - wobble) *
      (1 + 0.12 * Math.sin(seed + index * 2.3));

    return { x: 50 + Math.cos(angle) * reach, y: 50 + Math.sin(angle) * reach };
  });

const glyphAt = (hit: Hit, className: string, at: Pt, scale: number) => {
  const node = placed(hit.fx, className, at);

  node.textContent = hit.glyph;
  node.style.fontSize = `${(hit.size * scale).toFixed(1)}px`;

  return node;
};

const reach = (
  hit: Hit,
  side: "left" | "right",
  wanted: number,
  half: number
) => Math.max(0, Math.min(wanted, hit.room[side] - half));

const fishSlap = (hit: Hit) => {
  const fish = glyphAt(hit, "gag-glyph", hit.at, 0.6);
  const left = reach(hit, "left", hit.size * 0.55, hit.size * 0.3);
  const right = reach(hit, "right", hit.size * 0.55, hit.size * 0.3);

  played(
    fish,
    [
      {
        opacity: 1,
        transform: `translate(calc(-50% - ${left}px), -60%) rotate(-60deg)`,
      },
      { offset: 0.2, transform: "translate(-40%, -60%) rotate(30deg)" },
      {
        offset: 0.32,
        transform: `translate(calc(-50% + ${right}px), -60%) rotate(70deg) scaleX(-1)`,
      },
      {
        offset: 0.52,
        transform: "translate(-60%, -60%) rotate(-30deg) scaleX(-1)",
      },
      {
        offset: 0.64,
        transform: `translate(calc(-50% - ${left}px), -60%) rotate(-70deg)`,
      },
      {
        offset: 1,
        opacity: 0,
        transform: `translate(calc(-50% - ${left}px), -140%) rotate(-100deg)`,
      },
    ],
    { duration: 900, easing: "ease-in-out" }
  );
  moved(
    hit.face,
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      { offset: 0.2, transform: "translate(9%, 0) rotate(7deg)" },
      { offset: 0.34, transform: "translate(2%, 0) rotate(1deg)" },
      { offset: 0.52, transform: "translate(-9%, 0) rotate(-7deg)" },
      { offset: 0.68, transform: "translate(-2%, 0) rotate(-1deg)" },
      { transform: "translate(0, 0) rotate(0deg)" },
    ],
    900
  );
};

const smokeFrom = (hit: Hit, corner: Pt) => {
  const { size } = hit;

  for (const index of [0, 1, 2]) {
    const puff = placed(hit.fx, "gag-mark", corner);
    const drift = (index - 1) * size * 0.18;

    sheet(
      svgBox(puff, size * (0.22 + index * 0.06), 100),
      pathOf(blob(12, 42, 0.12, index)),
      "var(--color-line-strong)"
    );
    played(
      puff,
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" },
        {
          offset: 0.2,
          opacity: 0.9,
          transform: `translate(calc(-50% + ${drift * 0.3}px), calc(-50% - ${size * 0.2}px)) scale(0.8)`,
        },
        {
          opacity: 0,
          transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${size * 0.8}px)) scale(1.4)`,
        },
      ],
      { delay: index * 120, duration: 1000, easing: "ease-out" }
    );
  }
};

const fireScorch = (hit: Hit) => {
  const { at, size } = hit;
  const corner = { x: at.x + size * 0.26, y: at.y - size * 0.28 };
  const scorch = placed(hit.fx, "gag-mark", corner);

  sheet(
    svgBox(scorch, size * 0.56, 100),
    pathOf(blob(14, 40, 0.3, 7)),
    "var(--color-ink)"
  );
  played(
    scorch,
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.4)" },
      {
        offset: 0.08,
        opacity: 0.6,
        transform: "translate(-50%, -50%) scale(1)",
      },
      {
        offset: 0.6,
        opacity: 0.5,
        transform: "translate(-50%, -50%) scale(1)",
      },
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.05)" },
    ],
    { duration: 1500 }
  );

  smokeFrom(hit, corner);

  moved(
    hit.face,
    [
      { transform: "translate(0, 0)" },
      { offset: 0.1, transform: "translate(-4%, 2%) rotate(-3deg)" },
      { offset: 0.2, transform: "translate(4%, -1%) rotate(3deg)" },
      { offset: 0.3, transform: "translate(-2%, 1%) rotate(-1deg)" },
      { offset: 0.45, transform: "translate(0, 0)" },
      { transform: "translate(0, 0)" },
    ],
    700
  );
};

const skullDrain = (hit: Hit) => {
  if (hit.face !== null) {
    played(
      el("div", "gag-drained", hit.face),
      [
        { opacity: 0 },
        { offset: 0.15, opacity: 1 },
        { offset: 0.75, opacity: 1 },
        { opacity: 0 },
      ],
      { duration: 1400 }
    );
  }

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.15, transform: "translate(0, 3%) scale(0.97)" },
      { offset: 0.75, transform: "translate(0, 4%) scale(0.96)" },
      { transform: "translate(0, 0) scale(1)" },
    ],
    1400
  );
};

const LAUGH_TILTS = [0, 5, 0, -5] as const;

const laughShake = (hit: Hit) => {
  moved(
    hit.face,
    Array.from({ length: 17 }, (_, index) => {
      const fade = 1 - index / 16;
      const bob = index % 2 === 0 ? 0 : -7 * fade;
      const tilt = (LAUGH_TILTS[index % 4] ?? 0) * fade;

      return {
        offset: index / 16,
        transform: `translate(0, ${bob.toFixed(1)}%) rotate(${tilt.toFixed(1)}deg)`,
      };
    }),
    1100
  );
};

const HAND = [
  { x: 30, y: 92 },
  { x: 24, y: 40 },
  { x: 30, y: 18 },
  { x: 40, y: 22 },
  { x: 42, y: 8 },
  { x: 52, y: 6 },
  { x: 56, y: 20 },
  { x: 62, y: 10 },
  { x: 72, y: 14 },
  { x: 70, y: 34 },
  { x: 84, y: 30 },
  { x: 86, y: 44 },
  { x: 72, y: 62 },
  { x: 70, y: 92 },
] as const;

const paperHand = (hit: Hit, mirrored: boolean, rise = 0.62, scale = 0.38) => {
  const hand = placed(hit.fx, "gag-mark", {
    x: hit.at.x,
    y: hit.at.y - hit.size * rise,
  });

  const svg = svgBox(hand, hit.size * scale, 100);

  sheet(
    svg,
    pathOf(HAND.map(({ x, y }) => ({ x: mirrored ? 100 - x : x, y }))),
    "var(--color-raised)",
    true
  );

  return hand;
};

const clapAround = (hit: Hit) => {
  for (const side of [-1, 1] as const) {
    const hand = paperHand(hit, side > 0);

    const apart = reach(
      hit,
      side > 0 ? "right" : "left",
      hit.size * 0.42,
      hit.size * 0.24
    );

    const at = (open: number, tilt: number) =>
      `translate(calc(-50% + ${(side * open).toFixed(1)}px), -50%) rotate(${side * tilt}deg)`;

    played(
      hand,
      [
        { opacity: 0, transform: at(apart, 30) },
        { offset: 0.12, opacity: 1, transform: at(apart, 25) },
        { offset: 0.24, transform: at(hit.size * 0.1, 0) },
        { offset: 0.36, transform: at(apart, 25) },
        { offset: 0.48, transform: at(hit.size * 0.1, 0) },
        { offset: 0.6, transform: at(apart, 25) },
        { offset: 0.72, transform: at(hit.size * 0.1, 0) },
        { offset: 0.84, opacity: 1, transform: at(apart, 25) },
        { opacity: 0, transform: at(apart, 35) },
      ],
      { duration: 1200, easing: "ease-in-out" }
    );
  }

  moved(
    hit.face,
    [0, 1, 2, 3, 4, 5, 6].map((index) => ({
      offset: index / 6,
      transform: `translate(0, ${index % 2 === 1 && index < 6 ? -4 : 0}%)`,
    })),
    1200
  );
};

const jawMotion = (hit: Hit) => {
  moved(
    hit.face,
    [
      { transform: "scale(1, 1)", transformOrigin: "50% 0" },
      { offset: 0.12, transform: "scale(0.92, 1.2)", transformOrigin: "50% 0" },
      {
        offset: 0.22,
        transform: "scale(0.95, 1.13)",
        transformOrigin: "50% 0",
      },
      { offset: 0.7, transform: "scale(0.95, 1.13)", transformOrigin: "50% 0" },
      {
        offset: 0.82,
        transform: "scale(1.06, 0.94)",
        transformOrigin: "50% 0",
      },
      { transform: "scale(1, 1)", transformOrigin: "50% 0" },
    ],
    1200
  );
};

const jawDrop = (hit: Hit) => {
  jawMotion(hit);

  const bang = placed(hit.fx, "gag-bang", {
    x: hit.at.x + hit.size * 0.42,
    y: hit.at.y - hit.size * 0.6,
  });

  bang.textContent = "!";
  bang.style.fontSize = `${(hit.size * 0.42).toFixed(1)}px`;
  played(
    bang,
    [
      {
        opacity: 0,
        transform: "translate(-50%, -50%) scale(0.2) rotate(-20deg)",
      },
      {
        offset: 0.14,
        opacity: 1,
        transform: "translate(-50%, -50%) scale(1.15) rotate(8deg)",
      },
      {
        offset: 0.24,
        transform: "translate(-50%, -50%) scale(1) rotate(8deg)",
      },
      {
        offset: 0.75,
        opacity: 1,
        transform: "translate(-50%, -50%) scale(1) rotate(8deg)",
      },
      { opacity: 0, transform: "translate(-50%, -70%) scale(1) rotate(8deg)" },
    ],
    { duration: 1200 }
  );
};

const CLOUD =
  "M18 72 C4 72 4 50 20 50 C18 32 40 26 48 40 C52 22 80 22 82 42 C98 42 98 72 82 72 Z";

const rainCloud = (hit: Hit) => {
  const { at, size } = hit;
  const top = { x: at.x, y: at.y - size * 0.82 };
  const cloud = placed(hit.fx, "gag-mark", top);

  sheet(
    svgBox(cloud, size * 0.8, 100),
    CLOUD,
    "var(--color-line-strong)",
    true
  );
  played(
    cloud,
    [
      { opacity: 0, transform: "translate(-50%, -70%) scale(0.6, 0.4)" },
      {
        offset: 0.1,
        opacity: 1,
        transform: "translate(-50%, -50%) scale(1.06, 0.92)",
      },
      { offset: 0.16, transform: "translate(-50%, -50%) scale(1, 1)" },
      {
        offset: 0.82,
        opacity: 1,
        transform: "translate(-50%, -50%) scale(1, 1)",
      },
      { opacity: 0, transform: "translate(-50%, -80%) scale(0.9, 0.9)" },
    ],
    { duration: 1400 }
  );

  for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const drop = placed(hit.fx, "gag-drop", {
      x: at.x + ((index % 4) - 1.5) * size * 0.16,
      y: top.y + size * 0.1,
    });

    drop.style.width = `${(size * 0.07).toFixed(1)}px`;
    drop.style.height = `${(size * 0.13).toFixed(1)}px`;
    played(
      drop,
      [
        { opacity: 0, transform: "translate(-50%, 0)" },
        { offset: 0.1, opacity: 1, transform: "translate(-50%, 0)" },
        {
          offset: 0.85,
          opacity: 1,
          transform: `translate(-50%, ${(size * 0.55).toFixed(1)}px)`,
        },
        {
          opacity: 0,
          transform: `translate(-50%, ${(size * 0.62).toFixed(1)}px)`,
        },
      ],
      { delay: 180 + index * 110, duration: 420, easing: "ease-in" }
    );
  }

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.2, transform: "translate(0, 4%) scale(0.97, 0.95)" },
      { offset: 0.85, transform: "translate(0, 4%) scale(0.97, 0.95)" },
      { transform: "translate(0, 0) scale(1)" },
    ],
    1400
  );
};

const eyesPeek = (hit: Hit) => {
  const { at, size } = hit;

  const well = placed(hit.fx, "gag-well", {
    x: at.x,
    y: at.y - size * 0.5 - size * 0.275,
  });

  well.style.width = `${(size * 0.9).toFixed(1)}px`;
  well.style.height = `${(size * 0.55).toFixed(1)}px`;

  const eyes = el("div", "gag-peeker", well, hit.glyph);

  eyes.style.fontSize = `${(size * 0.5).toFixed(1)}px`;

  const look = size * 0.12;

  played(
    eyes,
    [
      { transform: "translate(-50%, 110%)" },
      { offset: 0.14, transform: "translate(-50%, 8%)", easing: "ease-out" },
      { offset: 0.2, transform: "translate(-50%, 14%)" },
      { offset: 0.36, transform: "translate(-50%, 14%)" },
      { offset: 0.44, transform: `translate(calc(-50% - ${look}px), 14%)` },
      { offset: 0.6, transform: `translate(calc(-50% - ${look}px), 14%)` },
      { offset: 0.68, transform: `translate(calc(-50% + ${look}px), 14%)` },
      {
        offset: 0.8,
        transform: `translate(calc(-50% + ${look}px), 14%)`,
        easing: "ease-in",
      },
      { transform: "translate(-50%, 110%)" },
    ],
    { duration: 1500 }
  );
  well
    .animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1500 })
    .addEventListener("finish", () => {
      well.remove();
    });

  moved(
    hit.face,
    [
      { transform: "translate(0, 0)" },
      { offset: 0.14, transform: "translate(0, 3%) scale(0.98)" },
      { offset: 0.8, transform: "translate(0, 3%) scale(0.98)" },
      { transform: "translate(0, 0)" },
    ],
    1500
  );
};

const BIRD =
  "M44 52 L44 13 Q44 4 50 4 Q56 4 56 13 L56 46 Q57 40 63 40 Q70 40 70 48 Q72 45 76 46 Q82 48 80 57 L77 74 Q75 82 70 85 L70 97 L34 97 L34 85 Q26 80 24 68 L23 55 Q23 44 32 43 Q41 42 44 52 Z";

const BIRD_CREASES = [
  "M44 52 L44 62",
  "M56 46 L56 62",
  "M70 48 L69 61",
  "M25 68 Q37 63 51 69",
  "M46 11 Q50 8 54 11",
] as const;

const BIRD_JABS = [0.24, 0.38, 0.52] as const;

const birdHand = (parent: HTMLElement, size: number) => {
  const svg = svgBox(parent, size, 100);

  svg.style.display = "block";
  sheet(svg, BIRD, "var(--color-raised)", true);

  for (const crease of BIRD_CREASES) {
    const line = svgEl("path", svg);

    line.setAttribute("d", crease);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "var(--color-ink)");
    line.setAttribute("stroke-width", "2.2");
    line.setAttribute("stroke-linecap", "round");
  }
};

const jabMarks = (parent: HTMLElement, size: number) => {
  const svg = svgBox(parent, size, 100);

  for (const angle of [-160, -138, -116, -64, -42, -20]) {
    const turn = (angle * Math.PI) / 180;
    const from = { x: 50 + Math.cos(turn) * 30, y: 50 + Math.sin(turn) * 30 };
    const to = { x: 50 + Math.cos(turn) * 45, y: 50 + Math.sin(turn) * 45 };

    for (const [stroke, dx, dy] of [
      ["var(--color-sheet-shadow)", 1.6, 2],
      ["var(--color-accent)", 0, 0],
    ] as const) {
      const mark = svgEl("path", svg);

      mark.setAttribute(
        "d",
        `M${(from.x + dx).toFixed(1)} ${(from.y + dy).toFixed(1)}L${(to.x + dx).toFixed(1)} ${(to.y + dy).toFixed(1)}`
      );
      mark.setAttribute("stroke", stroke);
      mark.setAttribute("stroke-width", "6");
      mark.setAttribute("stroke-linecap", "round");
    }
  }
};

const birdJab = (scale: number, tilt: number) =>
  `translate(-50%, -6%) scale(${scale}) rotate(${tilt}deg)`;

const birdWag = (tilt: number) => `translate(-50%, 4%) rotate(${tilt}deg)`;

const flinch = (tilt: number, deep: number) =>
  `translate(0, ${deep}%) scale(${1 - deep / 60}) rotate(${tilt}deg)`;

const birdBehind = (hit: Hit) => {
  const { at, size } = hit;
  const handSize = size * 0.6;

  const well = placed(hit.fx, "gag-well", {
    x: at.x,
    y: at.y - size * 0.5 - size * 0.42,
  });

  well.style.width = `${(size * 0.9).toFixed(1)}px`;
  well.style.height = `${(size * 0.84).toFixed(1)}px`;

  const hand = el("div", "gag-peeker", well);

  hand.style.transformOrigin = "50% 100%";
  birdHand(hand, handSize);

  const rest = "translate(-50%, 4%)";

  played(
    hand,
    [
      { transform: "translate(-50%, 105%)" },
      { offset: 0.12, transform: "translate(-50%, -6%)", easing: "ease-out" },
      { offset: 0.17, transform: rest },
      { offset: 0.24, transform: birdJab(1.16, -5) },
      { offset: 0.3, transform: rest },
      { offset: 0.38, transform: birdJab(1.2, 5) },
      { offset: 0.44, transform: rest },
      { offset: 0.52, transform: birdJab(1.28, 0) },
      { offset: 0.6, transform: rest },
      { offset: 0.66, transform: birdWag(-14) },
      { offset: 0.72, transform: birdWag(12) },
      { offset: 0.78, transform: birdWag(-9) },
      { offset: 0.84, transform: birdWag(0), easing: "ease-in" },
      { offset: 0.9, transform: rest, easing: "ease-in" },
      { transform: "translate(-50%, 105%)" },
    ],
    { duration: 1500 }
  );
  well
    .animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1500 })
    .addEventListener("finish", () => {
      well.remove();
    });

  const marks = placed(hit.fx, "gag-mark", {
    x: at.x,
    y: at.y - size * 0.5 - handSize * 1.02,
  });

  jabMarks(marks, handSize * 1.3);
  played(
    marks,
    [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
      ...BIRD_JABS.flatMap((offset) => [
        {
          offset: offset - 0.015,
          opacity: 0,
          transform: "translate(-50%, -50%) scale(0.7)",
        },
        {
          offset,
          opacity: 1,
          transform: "translate(-50%, -50%) scale(1)",
        },
        {
          offset: offset + 0.06,
          opacity: 0,
          transform: "translate(-50%, -50%) scale(1.15)",
        },
      ]),
      { offset: 1, opacity: 0, transform: "translate(-50%, -50%) scale(1.15)" },
    ],
    { duration: 1500 }
  );

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { offset: 0.17, transform: flinch(0, 0) },
      { offset: 0.24, transform: flinch(-3, 3) },
      { offset: 0.3, transform: flinch(0, 1) },
      { offset: 0.38, transform: flinch(3, 3) },
      { offset: 0.44, transform: flinch(0, 1) },
      { offset: 0.52, transform: flinch(0, 5) },
      { offset: 0.62, transform: flinch(0, 2) },
      { offset: 0.84, transform: flinch(0, 2) },
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
    ],
    1500
  );
};

const sideOf = (hit: Hit): 1 | -1 => (hit.toward.x >= hit.at.x ? 1 : -1);

const roomOn = (hit: Hit, side: 1 | -1) =>
  side > 0 ? hit.room.right : hit.room.left;

const beside = (hit: Hit, wanted: number, half: number) => {
  const first = sideOf(hit);

  for (const side of [first, first > 0 ? -1 : 1] as const) {
    const offset = Math.min(wanted, roomOn(hit, side) - half);

    if (offset >= hit.size * 0.5) {
      return { offset, side };
    }
  }

  return null;
};

const shifted = (x: number, y: number, rest = "") =>
  `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) ${rest}`.trim();

const lasting = (node: HTMLElement, ms: number) => {
  node
    .animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms })
    .addEventListener("finish", () => {
      node.remove();
    });
};

const PELTS = 5;

const PELT_MS = 640;

const PELT_GAP_MS = 150;

const PELT_HIT = 0.45;

const pelted = (hit: Hit) => {
  const { at, size } = hit;
  const dx = hit.toward.x - at.x;
  const dy = hit.toward.y - at.y;
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  const across = { x: -along.y, y: along.x };
  const total = (PELTS - 1) * PELT_GAP_MS + PELT_MS;

  for (let index = 0; index < PELTS; index += 1) {
    const spread = ((index % 3) - 1) * size * 0.2;

    const aim = {
      x: across.x * spread,
      y: across.y * spread - size * 0.08,
    };

    const start = {
      x: aim.x + along.x * size * 1.15,
      y: aim.y + along.y * size * 1.15,
    };

    const away = {
      x: aim.x - along.x * size * 0.3,
      y: aim.y - along.y * size * 0.3 + size * 0.55,
    };

    const spin = index % 2 === 0 ? -1 : 1;
    const ha = placed(hit.fx, "gag-ha", at);

    ha.textContent = "HA";
    ha.style.fontSize = `${(size * 0.22).toFixed(1)}px`;
    played(
      ha,
      [
        {
          opacity: 0,
          transform: shifted(
            start.x,
            start.y,
            `rotate(${spin * 30}deg) scale(0.8)`
          ),
        },
        {
          offset: 0.12,
          opacity: 1,
          transform: shifted(
            (start.x * 2 + aim.x) / 3,
            (start.y * 2 + aim.y) / 3,
            `rotate(${spin * 20}deg) scale(1)`
          ),
        },
        {
          offset: PELT_HIT,
          transform: shifted(
            aim.x,
            aim.y,
            `rotate(${spin * -8}deg) scale(1.1, 0.85)`
          ),
        },
        {
          offset: 0.58,
          transform: shifted(
            (aim.x + away.x) / 2,
            aim.y - size * 0.12,
            `rotate(${spin * -40}deg) scale(1)`
          ),
        },
        {
          opacity: 0,
          transform: shifted(
            away.x,
            away.y,
            `rotate(${spin * -120}deg) scale(0.9)`
          ),
        },
      ],
      { delay: index * PELT_GAP_MS, duration: PELT_MS, easing: "linear" }
    );
  }

  moved(
    hit.face,
    [
      { offset: 0, transform: "translate(0, 0) rotate(0deg)" },
      ...Array.from({ length: PELTS }, (_, index) => {
        const landed = (index * PELT_GAP_MS + PELT_MS * PELT_HIT) / total;
        const tilt = (index % 2 === 0 ? -1 : 1) * 4;

        return [
          {
            offset: landed,
            transform: `translate(${(-along.x * 6).toFixed(1)}%, ${(-along.y * 6).toFixed(1)}%) rotate(${tilt}deg)`,
          },
          {
            offset: Math.min(1, landed + 60 / total),
            transform: "translate(0, 1%) rotate(0deg)",
          },
        ];
      }).flat(),
      { offset: 1, transform: "translate(0, 0) rotate(0deg)" },
    ],
    total
  );
};

const SLOW_CLAPS = [0.3, 0.58, 0.86] as const;

const SLOW_CLAP_MS = 1400;

const slowClap = (hit: Hit) => {
  for (const side of [-1, 1] as const) {
    const hand = paperHand(hit, side > 0, -0.1, 0.4);

    const apart = reach(
      hit,
      side > 0 ? "right" : "left",
      hit.size * 0.36,
      hit.size * 0.2
    );

    const at = (open: number, tilt: number) =>
      `translate(calc(-50% + ${(side * open).toFixed(1)}px), -50%) rotate(${side * tilt}deg)`;

    played(
      hand,
      [
        { opacity: 0, transform: at(apart, 30) },
        { offset: 0.1, opacity: 1, transform: at(apart, 22) },
        ...SLOW_CLAPS.flatMap((offset) => [
          {
            easing: "ease-in",
            offset: offset - 0.14,
            transform: at(apart, 22),
          },
          { offset, transform: at(hit.size * 0.09, 0) },
          { offset: offset + 0.05, transform: at(hit.size * 0.12, 4) },
        ]),
        { offset: 0.94, opacity: 1, transform: at(apart, 22) },
        { opacity: 0, transform: at(apart, 32) },
      ],
      { duration: SLOW_CLAP_MS }
    );
  }

  moved(
    hit.face,
    [
      { offset: 0, transform: "translate(0, 0) scale(1)" },
      ...SLOW_CLAPS.flatMap((offset) => [
        { offset, transform: "translate(0, 2%) scale(0.95, 0.9)" },
        { offset: offset + 0.1, transform: "translate(0, 0) scale(1)" },
      ]),
      { offset: 1, transform: "translate(0, 0) scale(1)" },
    ],
    SLOW_CLAP_MS
  );
};

const clapAlong = (hit: Hit) => {
  moved(
    hit.face,
    [
      { offset: 0, transform: "translate(0, 0)" },
      ...SLOW_CLAPS.flatMap((offset) => [
        { offset, transform: "translate(0, 4%)" },
        { offset: offset + 0.1, transform: "translate(0, 0)" },
      ]),
      { offset: 1, transform: "translate(0, 0)" },
    ],
    SLOW_CLAP_MS
  );
};

const CALLOUT =
  "M18 8 H82 Q92 8 92 18 V58 Q92 68 82 68 H40 L14 92 L24 68 H18 Q8 68 8 58 V18 Q8 8 18 8 Z";

const BANG_BAR =
  "M46 16 H54 Q57.5 16 57 20 L54.6 44 Q54 48 50 48 Q46 48 45.4 44 L43 20 Q42.5 16 46 16 Z";

const calledOut = (hit: Hit) => {
  const { at, size } = hit;
  const width = size * 0.5;
  const spot = beside(hit, size * 0.42, width * 0.5);
  const side = spot?.side ?? sideOf(hit);

  const corner =
    spot === null
      ? { x: at.x, y: at.y - size * 0.8 }
      : { x: at.x + side * spot.offset, y: at.y - size * 0.5 };

  const callout = placed(hit.fx, "gag-mark", corner);
  const svg = svgBox(callout, width, 100);

  sheet(svg, CALLOUT, "var(--color-raised)", true);

  const bar = svgEl("path", svg);

  bar.setAttribute("d", BANG_BAR);
  bar.setAttribute("fill", "var(--color-accent)");

  const dot = svgEl("circle", svg);

  dot.setAttribute("cx", "50");
  dot.setAttribute("cy", "57");
  dot.setAttribute("r", "5.5");
  dot.setAttribute("fill", "var(--color-accent)");

  const flip = side > 0 ? 1 : -1;

  const pose = (scale: number, tilt: number, lift = 0) =>
    `translate(-50%, calc(-50% - ${lift}%)) rotate(${flip * tilt}deg) scale(${flip * scale}, ${scale})`;

  played(
    callout,
    [
      { opacity: 0, transform: pose(2.3, -16) },
      { offset: 0.1, opacity: 1, transform: pose(0.88, 6) },
      { offset: 0.16, transform: pose(1.06, 4) },
      { offset: 0.22, transform: pose(1, 5) },
      { offset: 0.8, opacity: 1, transform: pose(1, 5) },
      { opacity: 0, transform: pose(1, 5, 30) },
    ],
    { duration: 1300 }
  );
  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1, 1)" },
      { offset: 0.09, transform: "translate(0, 0) scale(1, 1)" },
      { offset: 0.13, transform: "translate(0, 5%) scale(1.06, 0.88)" },
      { offset: 0.24, transform: "translate(0, -1%) scale(0.98, 1.03)" },
      { offset: 0.32, transform: "translate(0, 0) scale(1, 1)" },
      { transform: "translate(0, 0) scale(1, 1)" },
    ],
    1300
  );
};

const VIOLIN =
  "M50 30 C64 30 68 38 64 46 C61 51 61 53 64 58 C70 68 64 86 50 86 C36 86 30 68 36 58 C39 53 39 51 36 46 C32 38 36 30 50 30 Z";

const NOTE =
  "M30 78 C30 68 46 64 52 70 L52 18 L74 26 L74 36 L58 31 L58 74 C58 86 30 88 30 78 Z";

const violinArt = (parent: HTMLElement, size: number) => {
  const svg = svgBox(parent, size, 100);

  sheet(svg, VIOLIN, "var(--color-raised)", true);
  sheet(svg, "M47 6 Q50 2 53 6 L53 34 L47 34 Z", "var(--color-ink)");

  for (const d of [
    "M50 12 L50 74",
    "M42 52 Q40 58 43 63",
    "M58 52 Q60 58 57 63",
    "M44 70 L56 70",
  ]) {
    const line = svgEl("path", svg);

    line.setAttribute("d", d);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "var(--color-ink)");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
  }
};

const bowArt = (parent: HTMLElement, size: number) => {
  const svg = svgBox(parent, size, 100);

  for (const [stroke, width, dy] of [
    ["var(--color-sheet-shadow)", 4, 2.4],
    ["var(--color-ink)", 4, 0],
    ["var(--color-raised)", 1.6, 4],
  ] as const) {
    const line = svgEl("path", svg);

    line.setAttribute("d", `M6 ${50 + dy} L94 ${50 + dy}`);
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", String(width));
    line.setAttribute("stroke-linecap", "round");
  }
};

const BOW_STROKES = 4;

const violinPose = (scale: number, tilt: number) =>
  `translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`;

const bowStroke = (shift: number, opacity: number) => ({
  opacity,
  transform: `translate(-50%, -50%) rotate(28deg) translateX(${shift.toFixed(1)}px)`,
});

const smallestViolin = (hit: Hit) => {
  const { at, size } = hit;
  const top = { x: at.x, y: at.y - size * 0.78 };
  const violin = placed(hit.fx, "gag-mark", top);

  violinArt(violin, size * 0.5);

  played(
    violin,
    [
      { opacity: 0, transform: violinPose(0.3, -40) },
      { offset: 0.1, opacity: 1, transform: violinPose(1.08, -26) },
      { offset: 0.16, transform: violinPose(1, -30) },
      { offset: 0.5, transform: violinPose(1, -24) },
      { offset: 0.86, opacity: 1, transform: violinPose(1, -32) },
      { opacity: 0, transform: violinPose(0.6, -30) },
    ],
    { duration: 1400, easing: "ease-in-out" }
  );

  const bow = placed(hit.fx, "gag-mark", {
    x: top.x + size * 0.02,
    y: top.y + size * 0.06,
  });

  bowArt(bow, size * 0.58);

  const reachOf = size * 0.1;

  played(
    bow,
    [
      { offset: 0, ...bowStroke(reachOf, 0) },
      { offset: 0.14, ...bowStroke(reachOf, 1) },
      ...Array.from({ length: BOW_STROKES }, (_, index) => ({
        offset: 0.14 + ((index + 1) * 0.7) / BOW_STROKES,
        ...bowStroke(index % 2 === 0 ? -reachOf : reachOf, 1),
      })),
      { offset: 1, ...bowStroke(reachOf, 0) },
    ],
    { duration: 1400, easing: "ease-in-out" }
  );

  for (const index of [0, 1]) {
    const note = placed(hit.fx, "gag-mark", {
      x: top.x + (index === 0 ? -1 : 1) * size * 0.2,
      y: top.y - size * 0.05,
    });

    sheet(svgBox(note, size * 0.16, 100), NOTE, "var(--color-ink)");
    played(
      note,
      [
        { opacity: 0, transform: shifted(0, 0, "scale(0.6)") },
        {
          offset: 0.2,
          opacity: 1,
          transform: shifted(0, -size * 0.08, "rotate(-8deg)"),
        },
        {
          opacity: 0,
          transform: shifted(index === 0 ? -6 : 6, -size * 0.4, "rotate(8deg)"),
        },
      ],
      { delay: 250 + index * 380, duration: 800, easing: "ease-out" }
    );
  }

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.15, transform: "translate(0, 4%) scale(0.97, 0.94)" },
      { offset: 0.86, transform: "translate(0, 4%) scale(0.97, 0.94)" },
      { transform: "translate(0, 0) scale(1)" },
    ],
    1400
  );
};

const swayAlong = (hit: Hit) => {
  moved(
    hit.face,
    [
      { transform: "rotate(0deg)" },
      { offset: 0.25, transform: "rotate(-5deg)" },
      { offset: 0.5, transform: "rotate(5deg)" },
      { offset: 0.75, transform: "rotate(-4deg)" },
      { transform: "rotate(0deg)" },
    ],
    1400
  );
};

const STONE = "M18 97 V42 Q18 8 50 8 Q82 8 82 42 V97 Z";

const tombstone = (hit: Hit) => {
  const { at, size } = hit;

  const well = placed(hit.fx, "gag-well", {
    x: at.x,
    y: at.y + size * 0.5 - size * 0.42,
  });

  well.style.width = `${(size * 0.9).toFixed(1)}px`;
  well.style.height = `${(size * 0.84).toFixed(1)}px`;

  const stone = el("div", "gag-peeker", well);

  stone.style.transformOrigin = "50% 100%";

  const svg = svgBox(stone, size * 0.62, 100);

  svg.style.display = "block";
  sheet(svg, STONE, "var(--color-line-strong)", true);

  const words = svgEl("text", svg);

  words.setAttribute("x", "50");
  words.setAttribute("y", "50");
  words.setAttribute("text-anchor", "middle");
  words.setAttribute("font-size", "22");
  words.setAttribute("font-family", "var(--font-display)");
  words.setAttribute("font-weight", "800");
  words.setAttribute("fill", "var(--color-ink)");
  words.textContent = "RIP";

  const crack = svgEl("path", svg);

  crack.setAttribute("d", "M36 68 L42 74 L38 80 L44 86");
  crack.setAttribute("fill", "none");
  crack.setAttribute("stroke", "var(--color-ink)");
  crack.setAttribute("stroke-width", "2");
  crack.setAttribute("stroke-linecap", "round");

  played(
    stone,
    [
      { transform: "translate(-50%, 105%) rotate(0deg)" },
      {
        easing: "ease-out",
        offset: 0.12,
        transform: "translate(-50%, -6%) rotate(0deg)",
      },
      { offset: 0.18, transform: "translate(-50%, 0) rotate(0deg)" },
      { offset: 0.26, transform: "translate(-50%, 0) rotate(-4deg)" },
      { offset: 0.34, transform: "translate(-50%, 0) rotate(3deg)" },
      { offset: 0.42, transform: "translate(-50%, 0) rotate(0deg)" },
      {
        easing: "ease-in",
        offset: 0.86,
        transform: "translate(-50%, 0) rotate(0deg)",
      },
      { transform: "translate(-50%, 105%) rotate(0deg)" },
    ],
    { duration: 1500 }
  );
  lasting(well, 1500);
  skullDrain(hit);
};

const WIND_UP_MS = 420;

const windUp = (hit: Hit) => {
  const side = sideOf(hit);

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      {
        offset: 0.45,
        transform: `translate(${-side * 7}%, -3%) rotate(${-side * 14}deg)`,
      },
      {
        offset: 0.62,
        transform: `translate(${side * 6}%, 0) rotate(${side * 10}deg)`,
      },
      { offset: 0.8, transform: `translate(0, 0) rotate(${-side * 3}deg)` },
      { transform: "translate(0, 0) rotate(0deg)" },
    ],
    WIND_UP_MS
  );
};

const EYE_PAIR = [28, 72] as const;

const DROP =
  "M50 6 C62 30 76 46 76 62 C76 80 64 92 50 92 C36 92 24 80 24 62 C24 46 38 30 50 6 Z";

const watching = (hit: Hit) => {
  const { at, size } = hit;
  const width = size * 0.56;
  const spot = beside(hit, size * 0.82, width * 0.5);
  const side = spot?.side ?? sideOf(hit);

  const stare =
    spot === null
      ? { x: at.x, y: at.y - size * 0.82 }
      : { x: at.x + side * spot.offset, y: at.y - size * 0.12 };

  const look = spot === null ? { x: 0, y: 7 } : { x: -side * 9, y: 1 };

  const eyes = placed(hit.fx, "gag-mark", stare);
  const svg = svgBox(eyes, width, 100);

  for (const cx of EYE_PAIR) {
    const ball = `M${cx - 19} 50 A19 21 0 1 0 ${cx + 19} 50 A19 21 0 1 0 ${cx - 19} 50 Z`;

    sheet(svg, ball, "var(--color-raised)", true);

    const pupil = svgEl("circle", svg);

    pupil.setAttribute("cx", String(cx + look.x));
    pupil.setAttribute("cy", String(52 + look.y));
    pupil.setAttribute("r", "8");
    pupil.setAttribute("fill", "var(--color-ink)");
  }

  const lean =
    spot === null ? "" : `translateX(${(-side * size * 0.06).toFixed(1)}px)`;

  const pose = (open: number, leaning: boolean) =>
    `translate(-50%, -50%) ${leaning ? lean : ""} scale(1, ${open})`;

  played(
    eyes,
    [
      { opacity: 0, transform: pose(0, false) },
      { offset: 0.1, opacity: 1, transform: pose(1, false) },
      { offset: 0.3, transform: pose(1, true) },
      { offset: 0.42, transform: pose(0.42, true) },
      { offset: 0.6, transform: pose(0.42, true) },
      { offset: 0.64, transform: pose(0.06, true) },
      { offset: 0.68, transform: pose(0.42, true) },
      { offset: 0.88, opacity: 1, transform: pose(0.42, true) },
      { opacity: 0, transform: pose(0, false) },
    ],
    { duration: 1500 }
  );

  const sweat = placed(hit.fx, "gag-mark", {
    x: at.x - side * size * 0.36,
    y: at.y - size * 0.24,
  });

  sheet(svgBox(sweat, size * 0.18, 100), DROP, "var(--color-raised)", true);
  played(
    sweat,
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.4)" },
      { offset: 0.15, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      {
        offset: 0.8,
        opacity: 1,
        transform: `translate(-50%, calc(-50% + ${(size * 0.26).toFixed(1)}px)) scale(1, 1.1)`,
      },
      {
        opacity: 0,
        transform: `translate(-50%, calc(-50% + ${(size * 0.32).toFixed(1)}px)) scale(1, 1.1)`,
      },
    ],
    { delay: 350, duration: 1100, easing: "ease-in" }
  );

  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.3, transform: `translate(${-side * 3}%, 1%) scale(0.98)` },
      { offset: 0.45, transform: `translate(${side * 1}%, 1%) scale(0.98)` },
      { offset: 0.6, transform: `translate(${-side * 3}%, 1%) scale(0.98)` },
      { offset: 0.85, transform: `translate(${-side * 2}%, 1%) scale(0.98)` },
      { transform: "translate(0, 0) scale(1)" },
    ],
    1500
  );
};

const birdBeside = (hit: Hit, outward: boolean) => {
  const { at, size } = hit;
  const handSize = size * 0.6;
  const spot = beside(hit, size * 0.74, handSize * 0.3);

  if (spot === null) {
    birdBehind(hit);

    return;
  }

  const { side } = spot;
  const point = outward ? side : -side;
  const place = { x: at.x + side * spot.offset, y: at.y - size * 0.06 };
  const hand = placed(hit.fx, "gag-mark", place);

  birdHand(hand, handSize);

  const pose = (shift: number, scale: number, tilt: number, opacity = 1) => ({
    opacity,
    transform: `${shifted(shift, 0)} rotate(${point * 16 + tilt}deg) scale(${side * scale}, ${scale})`,
  });

  const jab = handSize * 0.16 * point;

  played(
    hand,
    [
      { offset: 0, ...pose(side * handSize * 0.35, 0.8, 0, 0) },
      { offset: 0.1, ...pose(0, 1.05, 0) },
      { offset: 0.16, ...pose(0, 1, 0) },
      ...BIRD_JABS.flatMap((offset) => [
        { offset, ...pose(jab, 1.15, point * 6) },
        { offset: offset + 0.07, ...pose(0, 1, 0) },
      ]),
      { offset: 0.66, ...pose(0, 1, -12) },
      { offset: 0.72, ...pose(0, 1, 12) },
      { offset: 0.78, ...pose(0, 1, -8) },
      { offset: 0.86, ...pose(0, 1, 0) },
      { offset: 1, ...pose(side * handSize * 0.35, 0.8, 0, 0) },
    ],
    { duration: 1500, easing: "ease-in-out" }
  );

  const marks = placed(hit.fx, "gag-mark", {
    x: place.x + point * handSize * 0.16,
    y: place.y - handSize * 0.42,
  });

  jabMarks(marks, handSize * 1.1);
  played(
    marks,
    [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
      ...BIRD_JABS.flatMap((offset) => [
        {
          offset: offset - 0.015,
          opacity: 0,
          transform: "translate(-50%, -50%) scale(0.7)",
        },
        { offset, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
        {
          offset: offset + 0.06,
          opacity: 0,
          transform: "translate(-50%, -50%) scale(1.15)",
        },
      ]),
      { offset: 1, opacity: 0, transform: "translate(-50%, -50%) scale(1.15)" },
    ],
    { duration: 1500 }
  );

  const lean = outward
    ? (offset: number) => ({
        offset,
        transform: `translate(0, -2%) rotate(${-side * 3}deg)`,
      })
    : (offset: number) => ({
        offset,
        transform: `translate(${-side * 5}%, 1%) rotate(${-side * 5}deg) scale(0.97)`,
      });

  moved(
    hit.face,
    [
      { offset: 0, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ...BIRD_JABS.flatMap((offset) => [
        lean(offset),
        {
          offset: offset + 0.07,
          transform: "translate(0, 0) rotate(0deg) scale(1)",
        },
      ]),
      { offset: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
    ],
    1500
  );
};

const birdAt = (hit: Hit) => {
  birdBeside(hit, false);
};

const birdOut = (hit: Hit) => {
  birdBeside(hit, true);
};

const smoking = (hit: Hit) => {
  smokeFrom(hit, { x: hit.at.x, y: hit.at.y - hit.size * 0.42 });
  moved(
    hit.face,
    [
      { transform: "translate(0, 0) scale(1)" },
      { offset: 0.2, transform: "translate(0, -3%) scale(1.06)" },
      { offset: 0.7, transform: "translate(0, -3%) scale(1.06)" },
      { transform: "translate(0, 0) scale(1)" },
    ],
    1300
  );
};

const facepalm = (hit: Hit) => {
  const hand = paperHand(hit, false, 0.14, 0.62);

  played(
    hand,
    [
      {
        opacity: 0,
        transform: "translate(-30%, -150%) rotate(-40deg)",
      },
      {
        easing: "ease-in",
        offset: 0.08,
        opacity: 1,
        transform: "translate(-40%, -110%) rotate(-30deg)",
      },
      { offset: 0.16, transform: "translate(-50%, -50%) rotate(-6deg)" },
      { offset: 0.22, transform: "translate(-50%, -46%) rotate(-4deg)" },
      {
        offset: 0.74,
        opacity: 1,
        transform: "translate(-50%, -46%) rotate(-4deg)",
      },
      { opacity: 0, transform: "translate(-50%, 10%) rotate(-10deg)" },
    ],
    { duration: 1300 }
  );
  moved(
    hit.face,
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      { offset: 0.16, transform: "translate(0, 0) rotate(0deg)" },
      { offset: 0.2, transform: "translate(0, 5%) rotate(-3deg)" },
      { offset: 0.34, transform: "translate(0, 4%) rotate(4deg)" },
      { offset: 0.48, transform: "translate(0, 4%) rotate(-4deg)" },
      { offset: 0.62, transform: "translate(0, 4%) rotate(3deg)" },
      { offset: 0.78, transform: "translate(0, 3%) rotate(0deg)" },
      { transform: "translate(0, 0) rotate(0deg)" },
    ],
    1300
  );
};

export const FELT: Readonly<Record<Reaction, Felt>> = {
  Bird: { mood: "Happy", moodMs: 1400, play: birdOut, riseMs: 1200 },
  Clap: { mood: "Happy", moodMs: 1200, play: clapAround, riseMs: 0 },
  Cry: { mood: "Gutted", moodMs: 1400, play: rainCloud, riseMs: 0 },
  Dead: { mood: "Gutted", moodMs: 1400, play: skullDrain, riseMs: 0 },
  Eyes: { mood: "Thinking", moodMs: 1400, play: eyesPeek, riseMs: null },
  Fire: { mood: "Happy", moodMs: 1300, play: smoking, riseMs: 150 },
  Fish: { mood: "Gutted", moodMs: 1300, play: facepalm, riseMs: 1000 },
  Laugh: { mood: "Happy", moodMs: 1100, play: laughShake, riseMs: 0 },
  Wow: { mood: "Gutted", moodMs: 1200, play: jawDrop, riseMs: 900 },
};

const pleased = (moodMs: number): Part => ({
  mood: "Happy",
  moodMs,
  play: null,
});

export const THROWN: Readonly<Record<Reaction, Thrown>> = {
  Bird: {
    riseMs: 1200,
    sender: pleased(1400),
    target: { mood: "Gutted", moodMs: 1400, play: birdAt },
    windUp: null,
  },
  Clap: {
    riseMs: 1200,
    sender: { mood: "Happy", moodMs: 1400, play: clapAlong },
    target: { mood: "Gutted", moodMs: 1400, play: slowClap },
    windUp: null,
  },
  Cry: {
    riseMs: 1100,
    sender: { mood: "Happy", moodMs: 1400, play: swayAlong },
    target: { mood: "Gutted", moodMs: 1400, play: smallestViolin },
    windUp: null,
  },
  Dead: {
    riseMs: 1100,
    sender: pleased(1200),
    target: { mood: "Gutted", moodMs: 1400, play: tombstone },
    windUp: null,
  },
  Eyes: {
    riseMs: null,
    sender: { mood: "Thinking", moodMs: 1400, play: null },
    target: { mood: "Thinking", moodMs: 1500, play: watching },
    windUp: null,
  },
  Fire: {
    riseMs: 300,
    sender: pleased(1100),
    target: { mood: "Gutted", moodMs: 1300, play: fireScorch },
    windUp: null,
  },
  Fish: {
    riseMs: null,
    sender: null,
    target: { mood: "Gutted", moodMs: 1000, play: fishSlap },
    windUp: { mood: "Happy", moodMs: 700, play: windUp },
  },
  Laugh: {
    riseMs: 1000,
    sender: { mood: "Happy", moodMs: 1100, play: laughShake },
    target: { mood: "Thinking", moodMs: 1300, play: pelted },
    windUp: null,
  },
  Wow: {
    riseMs: 700,
    sender: { mood: "Gutted", moodMs: 1200, play: jawMotion },
    target: { mood: "Thinking", moodMs: 1200, play: calledOut },
    windUp: null,
  },
};
