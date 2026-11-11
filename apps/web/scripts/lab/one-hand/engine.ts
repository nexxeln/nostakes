export type Ease = "Back" | "Hold" | "In" | "InOut" | "Linear" | "Out";

export interface Pose {
  readonly opacity: number;
  readonly scale: number;
  readonly squeeze: number;
  readonly turn: number;
  readonly x: number;
  readonly y: number;
}

export const REST: Pose = {
  opacity: 1,
  scale: 1,
  squeeze: 1,
  turn: 0,
  x: 0,
  y: 0,
};

export const FILM_LENGTH = 1000;

export const ROOT = "";

interface Move {
  readonly ease: Ease;
  readonly from: number;
  readonly pose: Partial<Pose>;
  readonly to: number;
}

export interface ScriptedFrame {
  readonly at: number;
  readonly css: string;
}

interface Part {
  readonly moves: Move[];
  readonly part: string;
  readonly scripted: ScriptedFrame[];
  readonly sprite: string;
  readonly start: Pose;
}

export interface Sprite {
  readonly id: string;
  readonly layer: string;
  readonly markup: string;
}

export interface Film {
  readonly parts: Map<string, Part>;
  readonly sprites: Map<string, Sprite>;
}

export const emptyFilm = (): Film => ({ parts: new Map(), sprites: new Map() });

const keyOf = (sprite: string, part: string) => `${sprite}/${part}`;

export const place = (
  film: Film,
  sprite: Sprite,
  start: Partial<Pose> = {}
) => {
  film.sprites.set(sprite.id, sprite);
  film.parts.set(keyOf(sprite.id, ROOT), {
    moves: [],
    part: ROOT,
    scripted: [],
    sprite: sprite.id,
    start: { ...REST, ...start },
  });
};

export const rest = (
  film: Film,
  sprite: string,
  part: string,
  start: Partial<Pose>
) => {
  film.parts.set(keyOf(sprite, part), {
    moves: [],
    part,
    scripted: [],
    sprite,
    start: { ...REST, ...start },
  });
};

export interface Span {
  readonly ease?: Ease;
  readonly from: number;
  readonly to: number;
}

export const move = (
  film: Film,
  target: readonly [sprite: string, part: string],
  span: Span,
  pose: Partial<Pose>
) => {
  const [sprite, part] = target;
  const key = keyOf(sprite, part);

  const found = film.parts.get(key) ?? {
    moves: [],
    part,
    scripted: [],
    sprite,
    start: REST,
  };

  found.moves.push({
    ease: span.ease ?? "Out",
    from: span.from,
    pose,
    to: span.to,
  });
  film.parts.set(key, found);
};

export const script = (
  film: Film,
  target: readonly [sprite: string, part: string],
  frames: readonly ScriptedFrame[]
) => {
  const [sprite, part] = target;

  film.parts.set(keyOf(sprite, part), {
    moves: [],
    part,
    scripted: [...frames],
    sprite,
    start: REST,
  });
};

export const cut = (
  film: Film,
  target: readonly [sprite: string, part: string],
  at: number,
  pose: Partial<Pose>
) => {
  move(film, target, { ease: "Hold", from: at, to: at }, pose);
};

const EASES: Readonly<Record<Ease, string>> = {
  Back: "cubic-bezier(.3,1.35,.5,1)",
  Hold: "step-end",
  In: "cubic-bezier(.5,0,.9,.45)",
  InOut: "cubic-bezier(.6,0,.3,1)",
  Linear: "linear",
  Out: "cubic-bezier(.2,.8,.2,1)",
};

const trimmed = (value: number, digits: number) =>
  String(Number(value.toFixed(digits)));

const transformOf = (pose: Pose, tall: boolean) =>
  [
    pose.x === 0 && pose.y === 0
      ? ""
      : `translate(${trimmed(pose.x, 2)}em,${tall ? `calc(var(--v)*${trimmed(pose.y, 2)})` : `${trimmed(pose.y, 2)}em`})`,
    pose.turn === 0 ? "" : `rotate(${trimmed(pose.turn, 2)}deg)`,
    pose.scale === 1 && pose.squeeze === 1
      ? ""
      : `scale(${trimmed(pose.scale * pose.squeeze, 3)},${trimmed(pose.scale, 3)})`,
  ]
    .filter((piece) => piece !== "")
    .join(" ") || "none";

interface Frame {
  readonly at: number;
  readonly ease: Ease;
  readonly pose: Pose;
}

type Channel = "Opacity" | "Transform";

const CHANNELS: readonly Channel[] = ["Transform", "Opacity"];

const within = (pose: Partial<Pose>, channel: Channel): Partial<Pose> => {
  const { opacity, ...transform } = pose;

  if (channel === "Transform") {
    return transform;
  }

  return opacity === undefined ? {} : { opacity };
};

const framesOf = (part: Part, channel: Channel): readonly Frame[] => {
  const ordered = part.moves
    .map((step) => ({ ...step, pose: within(step.pose, channel) }))
    .filter((step) => Object.keys(step.pose).length > 0)
    .toSorted((left, right) => left.from - right.from || left.to - right.to);

  const frames: Frame[] = [{ at: 0, ease: "Hold", pose: part.start }];

  for (const step of ordered) {
    const last = frames.at(-1);
    const before = last?.pose ?? part.start;
    const after = { ...before, ...step.pose };

    if (step.to <= step.from) {
      frames.push({ at: step.from, ease: "Hold", pose: after });
    } else {
      frames.push(
        { at: step.from, ease: step.ease, pose: before },
        { at: step.to, ease: "Hold", pose: after }
      );
    }
  }

  return frames;
};

const declared = (pose: Pose, channel: Channel, tall: boolean) =>
  channel === "Transform"
    ? `transform:${transformOf(pose, tall)}`
    : `opacity:${trimmed(pose.opacity, 3)}`;

const percentOf = (at: number) => `${trimmed((at / FILM_LENGTH) * 100, 3)}%`;

interface Compiled {
  readonly keyframes: string;
  readonly still: string;
}

const compiled = (part: Part, channel: Channel): Compiled => {
  const frames = framesOf(part, channel);
  const tall = part.part === ROOT;
  const start = declared(part.start, channel, tall);
  const resting = declared(REST, channel, tall);

  if (frames.every(({ pose }) => declared(pose, channel, tall) === start)) {
    return { keyframes: "", still: start === resting ? "" : start };
  }

  const merged = new Map<string, Frame>();

  for (const frame of frames) {
    merged.set(percentOf(Math.min(FILM_LENGTH, Math.max(0, frame.at))), frame);
  }

  const last = frames.at(-1);

  if (last !== undefined && !merged.has("100%")) {
    merged.set("100%", { ...last, at: FILM_LENGTH });
  }

  const keyframes = [...merged.entries()]
    .map(
      ([percent, frame]) =>
        `${percent}{${declared(frame.pose, channel, tall)};animation-timing-function:${EASES[frame.ease]}}`
    )
    .join("");

  return { keyframes, still: "" };
};

export const selectorOf = (sprite: string, part: string) =>
  part === ROOT ? `#${sprite}` : `#${sprite} [data-p="${part}"]`;

const scriptedKeyframes = (frames: readonly ScriptedFrame[]) => {
  const first = frames.at(0);
  const last = frames.at(-1);

  if (first === undefined || last === undefined) {
    return "";
  }

  const merged = new Map<string, string>([["0%", first.css]]);

  for (const frame of frames) {
    merged.set(percentOf(frame.at), frame.css);
  }

  merged.set("100%", last.css);

  return [...merged.entries()]
    .map(
      ([percent, css]) => `${percent}{${css};animation-timing-function:linear}`
    )
    .join("");
};

export interface CutStyles {
  readonly rules: readonly string[];
}

export type Names = Map<string, string>;

export const stylesOf = (film: Film, names: Names): CutStyles => {
  const rules: string[] = [];

  const named = (keyframes: string) => {
    const name = names.get(keyframes) ?? `k${names.size}`;

    names.set(keyframes, name);

    return name;
  };

  for (const part of film.parts.values()) {
    const channels =
      part.scripted.length > 0
        ? [{ keyframes: scriptedKeyframes(part.scripted), still: "" }]
        : CHANNELS.map((channel) => compiled(part, channel));

    const moving = channels
      .filter(({ keyframes }) => keyframes !== "")
      .map(({ keyframes }) => named(keyframes));

    const declarations = [
      `animation-name:${moving.length === 0 ? "none" : moving.join(",")}`,
      ...channels.map(({ still }) => still),
    ].filter((piece) => piece !== "");

    rules.push(
      `${selectorOf(part.sprite, part.part)}{${declarations.join(";")}}`
    );
  }

  return { rules };
};

export const keyframesCss = (names: Names) =>
  [...names.entries()]
    .map(([body, name]) => `@keyframes ${name}{${body}}`)
    .join("\n");
