import type { Reaction } from "@nostakes/room";

import type { Mono } from "../../features/moments/sound/dsp.js";
import { GAG_SOUNDS } from "../../features/table/gag-sounds.js";
import { el, svgEl } from "./dom.js";
import type { Pt } from "./layout.js";

export type Mood = "Gutted" | "Happy";

export interface Hit {
  readonly reaction: Reaction;
  readonly glyph: string;
  readonly face: HTMLElement | null;
  readonly fx: HTMLElement;
  readonly at: Pt;
  readonly size: number;
  readonly room: { readonly left: number; readonly right: number };
}

export interface Gag {
  readonly mood: Mood;
  readonly moodMs: number;
  readonly sound: () => Mono;
  readonly play: (hit: Hit) => number | null;
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

  return null;
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

  return 150;
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

  return 0;
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

  return 0;
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

const paperHand = (hit: Hit, mirrored: boolean) => {
  const hand = placed(hit.fx, "gag-mark", {
    x: hit.at.x,
    y: hit.at.y - hit.size * 0.62,
  });

  const svg = svgBox(hand, hit.size * 0.38, 100);

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

  return 0;
};

const jawDrop = (hit: Hit) => {
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

  return 900;
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

  return 0;
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

  return null;
};

const halo = (hit: Hit) => {
  const { at, size } = hit;
  const glow = placed(hit.fx, "gag-glow", at);

  glow.style.width = `${(size * 1.5).toFixed(1)}px`;
  glow.style.height = `${(size * 1.5).toFixed(1)}px`;
  played(
    glow,
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
      {
        offset: 0.25,
        opacity: 0.9,
        transform: "translate(-50%, -50%) scale(1)",
      },
      {
        offset: 0.75,
        opacity: 0.8,
        transform: "translate(-50%, -50%) scale(1.04)",
      },
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.1)" },
    ],
    { duration: 1500 }
  );

  const ring = placed(hit.fx, "gag-mark", { x: at.x, y: at.y - size * 0.68 });
  const svg = svgBox(ring, size * 0.7, 100);

  for (const [stroke, width, dy] of [
    ["var(--color-sheet-shadow)", 9, 2.6],
    ["var(--color-ink)", 11, 0],
    ["var(--color-raised)", 6.5, 0],
  ] as const) {
    const loop = svgEl("ellipse", svg);

    loop.setAttribute("cx", "50");
    loop.setAttribute("cy", String(50 + dy));
    loop.setAttribute("rx", "40");
    loop.setAttribute("ry", "13");
    loop.setAttribute("fill", "none");
    loop.setAttribute("stroke", stroke);
    loop.setAttribute("stroke-width", String(width));
  }

  played(
    ring,
    [
      { opacity: 0, transform: "translate(-50%, -110%) scale(0.6)" },
      { offset: 0.25, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { offset: 0.5, transform: "translate(-50%, -60%) scale(1)" },
      { offset: 0.75, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { opacity: 0, transform: "translate(-50%, -70%) scale(1.05)" },
    ],
    { duration: 1500, easing: "ease-in-out" }
  );
  moved(
    hit.face,
    [
      { transform: "translate(0, 0)" },
      { offset: 0.3, transform: "translate(0, -3%)" },
      { offset: 0.75, transform: "translate(0, -3%)" },
      { transform: "translate(0, 0)" },
    ],
    1500
  );

  return 300;
};

export const GAGS: Readonly<Record<Reaction, Gag>> = {
  Clap: {
    mood: "Happy",
    moodMs: 1200,
    play: clapAround,
    sound: GAG_SOUNDS.Clap,
  },
  Cry: { mood: "Gutted", moodMs: 1400, play: rainCloud, sound: GAG_SOUNDS.Cry },
  Dead: {
    mood: "Gutted",
    moodMs: 1400,
    play: skullDrain,
    sound: GAG_SOUNDS.Dead,
  },
  Eyes: {
    mood: "Gutted",
    moodMs: 1300,
    play: eyesPeek,
    sound: GAG_SOUNDS.Eyes,
  },
  Fire: {
    mood: "Gutted",
    moodMs: 1300,
    play: fireScorch,
    sound: GAG_SOUNDS.Fire,
  },
  Fish: {
    mood: "Gutted",
    moodMs: 1000,
    play: fishSlap,
    sound: GAG_SOUNDS.Fish,
  },
  Laugh: {
    mood: "Happy",
    moodMs: 1100,
    play: laughShake,
    sound: GAG_SOUNDS.Laugh,
  },
  Pray: { mood: "Happy", moodMs: 1500, play: halo, sound: GAG_SOUNDS.Pray },
  Wow: { mood: "Gutted", moodMs: 1200, play: jawDrop, sound: GAG_SOUNDS.Wow },
};
