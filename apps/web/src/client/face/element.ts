import {
  choicesOf,
  codeFor,
  isPlaced,
  PartSchema,
  PLACED_PARTS,
  PlacedPartSchema,
  reachOfPart,
} from "@nostakes/avatar";
import type { Avatar, Expression, Part, PlacedPart } from "@nostakes/avatar";
import { Schema } from "effect";

import { calloutPoints } from "../../features/face/parts.js";
import type { Side } from "../../features/face/parts.js";
import { FACE_TAG, faceElement } from "../../features/face/stage.js";
import type {
  FaceFlip,
  FaceHold,
  FaceSettle,
} from "../../features/face/stage.js";
import type { Theme } from "../../features/model.js";
import { adoptEarlyProperties } from "../early-properties.js";
import { paintFace } from "./markup.js";

const STYLE = `
:host { display: block; }
.stage { position: relative; display: grid; grid-template-columns: var(--size-face-callout, 66px) minmax(0, 1fr) var(--size-face-callout, 66px); column-gap: var(--gap-face-callout, 4px); align-items: stretch; }
.side { display: flex; flex-direction: column; justify-content: space-around; gap: var(--space-1, 4px); min-width: 0; z-index: 1; }
.middle { display: grid; align-content: center; gap: var(--space-1, 4px); min-width: 0; }
.face { position: relative; aspect-ratio: 1; border-radius: var(--radius-face, 13%); background: var(--color-face, #fffdf8); box-shadow: var(--shadow-sheet-2); touch-action: pan-y; cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.face.is-scrubbing { cursor: grabbing; }
.art { display: grid; place-items: center; width: 100%; height: 100%; }
.art svg { display: block; overflow: visible; transform: translateY(-5%); }
.art [data-part] { transition: translate var(--duration-1, 120ms) var(--ease, ease); }
.art [data-part].is-near { translate: -0.6px -1.2px; }
.foot { display: grid; place-items: center; height: 1.25rem; pointer-events: none; }
.hint { margin: 0; color: var(--color-ink-muted, #716a79); font-size: var(--text-1, 0.75rem); font-weight: 600; line-height: 1; white-space: nowrap; }
.dots { display: flex; gap: 5px; }
.dots i { width: 6px; height: 6px; border-radius: var(--radius-round, 999px); background: var(--color-line-strong, #c9bfb1); }
.dots i.is-on { background: var(--color-accent, #ef5326); }
[hidden] { display: none; }
.lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.lines path { fill: none; stroke: var(--color-line-strong, #c9bfb1); stroke-width: 1.25; }
.lines circle { fill: var(--color-raised, #fffdf8); stroke: var(--color-ink-muted, #716a79); stroke-width: 1.5; }
.lines path.is-held { stroke: var(--color-accent, #ef5326); stroke-width: 2; }
.lines circle.is-held { fill: var(--color-accent, #ef5326); stroke: var(--color-on-accent, #fffaf3); }
.lines circle.is-empty { fill: none; stroke-dasharray: 2 2; }
@media (prefers-reduced-motion: reduce) { .art [data-part] { transition: none; } }
`;

const SVG = "http://www.w3.org/2000/svg";

const SCRUB_STEP_PX = 34;

const SCRUB_START_PX = 10;

const WHEEL_STEP = 40;

const ZONE_MARGIN = 3;

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const EASE_BACK = "cubic-bezier(0.3, 1.35, 0.5, 1)";

const REST = "translate(0px, 0px)";

const isPart = Schema.is(PartSchema);

const isPlacedPart = Schema.is(PlacedPartSchema);

const shiftOf = (group: SVGGElement): readonly [number, number] => {
  const [dx = "0", dy = "0"] = (group.dataset.shift ?? "").split(" ");

  return [Number(dx), Number(dy)];
};

const sheetAt = (event: PointerEvent): Part | null => {
  const target = event.composedPath().at(0);

  const tagged =
    target instanceof Element
      ? target.closest<SVGElement>("[data-part]")?.dataset.part
      : undefined;

  return isPart(tagged) ? tagged : null;
};

interface Drag {
  readonly x: number;
  readonly y: number;
  readonly sheet: Part | null;
  readonly under: Part;
  readonly flipped: Part;
  readonly steps: number;
  readonly moved: boolean;
}

interface Seen {
  readonly held: Part | null;
  readonly shuffles: number;
  readonly choice: string;
}

class NostakesFace extends HTMLElement {
  readonly #stage = document.createElement("div");
  readonly #box = document.createElement("div");
  readonly #art = document.createElement("div");
  readonly #hint = document.createElement("p");
  readonly #dots = document.createElement("div");
  readonly #lines = document.createElementNS(SVG, "svg");
  readonly #slots: Readonly<Record<Side, HTMLSlotElement>> = {
    left: document.createElement("slot"),
    right: document.createElement("slot"),
  };

  readonly #calm = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #fine = globalThis.matchMedia("(hover: hover) and (pointer: fine)");

  #face: Avatar | null = null;
  #held: Part | null = null;
  #mood: Expression = "Resting";
  #theme: Theme = "Light";
  #shuffles = 0;
  #hintShown = true;

  #drag: Drag | null = null;
  #near: Part | null = null;
  #wheeled = 0;

  #painted = "";
  #seen: Seen | null = null;
  #frame = 0;
  #observer: ResizeObserver | null = null;

  constructor() {
    super();

    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    const middle = document.createElement("div");
    const foot = document.createElement("div");

    style.textContent = STYLE;
    this.#stage.className = "stage";
    middle.className = "middle";
    this.#box.className = "face";
    this.#box.setAttribute("role", "img");
    this.#box.setAttribute("aria-label", "Your face");
    this.#art.className = "art";
    foot.className = "foot";
    this.#hint.className = "hint";
    this.#dots.className = "dots";
    this.#dots.setAttribute("aria-hidden", "true");
    this.#lines.setAttribute("class", "lines");
    this.#lines.setAttribute("aria-hidden", "true");
    this.#box.append(this.#art);
    foot.append(this.#hint, this.#dots);
    middle.append(this.#box, foot);
    this.#stage.append(
      this.#column("left"),
      middle,
      this.#column("right"),
      this.#lines
    );
    root.append(style, this.#stage);

    this.#box.addEventListener("pointerdown", this.#onDown);
    this.#box.addEventListener("pointermove", this.#onMove);
    this.#box.addEventListener("pointerup", this.#onUp);
    this.#box.addEventListener("pointercancel", this.#onCancel);
    this.#box.addEventListener("pointerleave", this.#onLeave);
    this.#box.addEventListener("wheel", this.#onWheel, { passive: false });
    adoptEarlyProperties(this, faceElement.properties);
  }

  connectedCallback() {
    this.#observer = new ResizeObserver(() => {
      this.#schedule();
    });
    this.#observer.observe(this);
    this.#schedule();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    cancelAnimationFrame(this.#frame);
    this.#painted = "";
    this.#seen = null;
  }

  get face(): Avatar | null {
    return this.#face;
  }

  set face(next: Avatar | null) {
    this.#face = next;
    this.#schedule();
  }

  get held(): Part | null {
    return this.#held;
  }

  set held(next: Part | null) {
    this.#held = next;
    this.#schedule();
  }

  get mood(): Expression {
    return this.#mood;
  }

  set mood(next: Expression) {
    this.#mood = next;
    this.#schedule();
  }

  get theme(): Theme {
    return this.#theme;
  }

  set theme(next: Theme) {
    this.#theme = next;
    this.#schedule();
  }

  get shuffles(): number {
    return this.#shuffles;
  }

  set shuffles(next: number) {
    this.#shuffles = next;
    this.#schedule();
  }

  get hint(): boolean {
    return this.#hintShown;
  }

  set hint(next: boolean) {
    this.#hintShown = next;
    this.#schedule();
  }

  #column(side: Side) {
    const column = document.createElement("div");

    column.className = "side";
    this.#slots[side].name = side;
    this.#slots[side].addEventListener("slotchange", () => {
      this.#schedule();
    });
    column.append(this.#slots[side]);

    return column;
  }

  #schedule() {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      this.#paint();
    });
  }

  #paint() {
    const face = this.#face;
    const size = Math.round(this.#box.getBoundingClientRect().width);

    if (face === null || !this.isConnected || size === 0) {
      return;
    }

    const held = this.#held;

    const key = JSON.stringify([
      codeFor(face),
      held,
      this.#mood,
      this.#theme,
      size,
    ]);

    if (key !== this.#painted) {
      this.#painted = key;

      const look = {
        expression: this.#mood,
        layers: true,
        parts: true,
        size,
        theme: this.#theme,
      };

      paintFace(
        this.#art,
        face,
        held === null ? look : { ...look, lifted: held }
      );
      this.#move(face, held);
    }

    this.#paintFoot(face, held);
    this.#paintLines(face, held);
  }

  #move(face: Avatar, held: Part | null) {
    const before = this.#seen;

    this.#seen = {
      choice: held === null ? "" : face[held],
      held,
      shuffles: this.#shuffles,
    };

    if (this.#calm.matches || this.#drag?.moved === true) {
      return;
    }

    if (before === null) {
      this.#invite();
    } else if (before.shuffles !== this.#shuffles) {
      this.#pullApart();
    } else if (before.held !== held) {
      this.#pickUp();
    } else if (before.choice !== this.#seen.choice) {
      this.#settle();
    }
  }

  #groups() {
    return [...this.#art.querySelectorAll<SVGGElement>("g[data-part]")];
  }

  #invite() {
    for (const [index, group] of this.#groups().entries()) {
      group.animate(
        [
          { transform: REST },
          { offset: 0.4, transform: "translate(-1.1px, -2.8px)" },
          { transform: REST },
        ],
        { delay: 260 + index * 70, duration: 420, easing: EASE }
      );
    }
  }

  #pullApart() {
    for (const sheet of this.#art.querySelectorAll<SVGGElement>("g.sheet")) {
      const index = Number(sheet.style.getPropertyValue("--sheet"));

      sheet.animate(
        [
          { transform: REST },
          {
            offset: 0.45,
            transform: `translate(${index * 2}px, ${index * -2.6}px)`,
          },
          { transform: REST },
        ],
        { delay: index * 18, duration: 820, easing: EASE }
      );
    }
  }

  #pickUp() {
    for (const group of this.#groups()) {
      if (group.dataset.shift !== undefined) {
        const [dx, dy] = shiftOf(group);
        const from = `translate(${-dx}px, ${-dy}px)`;

        group.animate(
          group.hasAttribute("opacity")
            ? [
                { opacity: 1, transform: from },
                { opacity: group.getAttribute("opacity"), transform: REST },
              ]
            : [{ transform: from }, { transform: REST }],
          { duration: 220, easing: EASE_BACK }
        );
      }
    }
  }

  #settle() {
    for (const group of this.#groups()) {
      if (group.dataset.shift !== undefined && !group.hasAttribute("opacity")) {
        group.animate(
          [{ transform: "translate(-1.2px, -3.6px)" }, { transform: REST }],
          { duration: 180, easing: EASE_BACK }
        );
      }
    }
  }

  #paintFoot(face: Avatar, held: Part | null) {
    this.#hint.textContent = this.#fine.matches
      ? "Click a part. Scroll to flip."
      : "Tap a part. Swipe to flip.";
    this.#hint.toggleAttribute("hidden", !this.#hintShown);
    this.#dots.toggleAttribute("hidden", this.#hintShown || held === null);
    this.#dots.replaceChildren(
      ...(held === null ? [] : choicesOf(held)).map((choice) => {
        const dot = document.createElement("i");

        dot.className = held !== null && choice === face[held] ? "is-on" : "";

        return dot;
      })
    );
  }

  #artFrame() {
    return (
      this.#art.querySelector("svg")?.getBoundingClientRect() ??
      this.#box.getBoundingClientRect()
    );
  }

  #paintLines(face: Avatar, held: Part | null) {
    const around = this.#stage.getBoundingClientRect();
    const frame = this.#artFrame();
    const points = calloutPoints(face);
    const drawn: SVGElement[] = [];

    for (const side of ["left", "right"] as const) {
      for (const callout of this.#slots[side].assignedElements()) {
        const part =
          callout instanceof HTMLElement ? callout.dataset.part : undefined;

        const point = points.find((each) => each.part === part);

        if (isPlacedPart(part) && point !== undefined) {
          const button = callout.getBoundingClientRect();
          const edge = side === "left" ? button.right : button.left;
          const fromX = edge - around.left;
          const fromY = button.top + button.height / 2 - around.top;
          const toX = frame.left + (point.x / 100) * frame.width - around.left;
          const toY = frame.top + (point.y / 100) * frame.height - around.top;
          const line = document.createElementNS(SVG, "path");
          const dot = document.createElementNS(SVG, "circle");
          const name = part === held ? "is-held" : "";

          line.setAttribute("d", `M${fromX} ${fromY}L${toX} ${toY}`);
          line.setAttribute("class", name);
          dot.setAttribute("cx", String(toX));
          dot.setAttribute("cy", String(toY));
          dot.setAttribute("r", "3");
          dot.setAttribute("class", point.worn ? name : `${name} is-empty`);
          dot.dataset.part = part;
          drawn.push(line, dot);
        }
      }
    }

    this.#lines.setAttribute("viewBox", `0 0 ${around.width} ${around.height}`);
    this.#lines.replaceChildren(...drawn);
  }

  #partAt(event: PointerEvent): Part {
    const face = this.#face;
    const tagged = sheetAt(event);

    if (tagged !== null) {
      return tagged;
    }

    if (face === null) {
      return "species";
    }

    const frame = this.#artFrame();
    const x = ((event.clientX - frame.left) / frame.width) * 100;
    const y = ((event.clientY - frame.top) / frame.height) * 100;

    const under = PLACED_PARTS.flatMap((part) => {
      const zone = reachOfPart(face.species, part);

      return x > zone.x - ZONE_MARGIN &&
        x < zone.x + zone.width + ZONE_MARGIN &&
        y > zone.y - ZONE_MARGIN &&
        y < zone.y + zone.height + ZONE_MARGIN
        ? [{ area: zone.width * zone.height, part }]
        : [];
    }).toSorted((one, other) => one.area - other.area);

    const nearest: PlacedPart | undefined = under[0]?.part;

    return nearest ?? "species";
  }

  #emitHold(part: Part) {
    const detail: FaceHold = { part };

    this.dispatchEvent(new CustomEvent("hold", { detail }));
  }

  #emitFlip(part: Part, by: number) {
    const detail: FaceFlip = { by, part };

    this.dispatchEvent(new CustomEvent("flip", { detail }));
  }

  #emitScrub(part: Part, by: number) {
    const detail: FaceFlip = { by, part };

    this.dispatchEvent(new CustomEvent("scrub", { detail }));
  }

  #emitSettle(kept: boolean) {
    const detail: FaceSettle = { kept };

    this.dispatchEvent(new CustomEvent("settle", { detail }));
  }

  #showNear(part: Part | null) {
    if (part === this.#near) {
      return;
    }

    this.#near = part;

    for (const group of this.#groups()) {
      group.classList.toggle("is-near", group.dataset.part === part);
    }
  }

  #tap(drag: Drag) {
    const held = this.#held;

    if (held === null) {
      this.#emitHold(drag.under);
    } else if (isPlaced(held) && drag.sheet !== null && drag.sheet !== held) {
      this.#emitHold(drag.sheet);
    } else {
      this.#emitFlip(held, 1);
    }
  }

  readonly #onDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const under = this.#partAt(event);

    this.#drag = {
      flipped: this.#held ?? under,
      moved: false,
      sheet: sheetAt(event),
      steps: 0,
      under,
      x: event.clientX,
      y: event.clientY,
    };
    this.#box.setPointerCapture(event.pointerId);
  };

  readonly #onMove = (event: PointerEvent) => {
    const drag = this.#drag;

    if (drag === null) {
      if (event.pointerType === "mouse" && this.#held === null) {
        this.#showNear(this.#partAt(event));
      }

      return;
    }

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    const moved =
      drag.moved ||
      (Math.abs(dx) > SCRUB_START_PX && Math.abs(dx) > Math.abs(dy));

    const steps = Math.round(dx / SCRUB_STEP_PX);

    if (moved && (!drag.moved || steps !== drag.steps)) {
      this.#drag = { ...drag, moved, steps };
      this.#box.classList.add("is-scrubbing");
      this.#emitScrub(drag.flipped, steps);
    }
  };

  readonly #onUp = () => {
    const drag = this.#drag;

    this.#drag = null;
    this.#box.classList.remove("is-scrubbing");

    if (drag === null) {
      return;
    }

    if (drag.moved) {
      this.#emitSettle(true);
    } else {
      this.#tap(drag);
    }
  };

  readonly #onCancel = () => {
    const drag = this.#drag;

    this.#drag = null;
    this.#box.classList.remove("is-scrubbing");

    if (drag?.moved === true) {
      this.#emitSettle(false);
    }
  };

  readonly #onLeave = () => {
    this.#showNear(null);
  };

  readonly #onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.#wheeled += event.deltaY + event.deltaX;

    if (Math.abs(this.#wheeled) >= WHEEL_STEP) {
      this.#emitFlip(this.#held ?? "species", Math.sign(this.#wheeled));
      this.#wheeled = 0;
    }
  };
}

export const defineFace = () => {
  if (customElements.get(FACE_TAG) === undefined) {
    customElements.define(FACE_TAG, NostakesFace);
  }
};
