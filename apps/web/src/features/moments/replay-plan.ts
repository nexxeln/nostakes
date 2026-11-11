import type { Expression } from "@nostakes/avatar";
import { cardText } from "@nostakes/engine";
import type { Card, SeatIndex } from "@nostakes/engine";
import { ReplaySteps } from "@nostakes/room";
import type { Replay, ReplayStep } from "@nostakes/room";
import { Match } from "effect";

import type { MomentHand } from "./element.js";
import { REPLAY_WORDS, shortName } from "./replay-words.js";
import { chips, flip } from "./score.js";
import type { SoundStep } from "./score.js";
import { REST } from "./timeline.js";
import type { Pose } from "./timeline.js";

export interface ReplaySeat {
  readonly avatar: string;
  readonly name: string;
  readonly seat: SeatIndex;
  readonly stack: number | null;
}

export const replaySeatsOf = (hand: MomentHand): readonly ReplaySeat[] =>
  hand.lastHand.dealtIn.map(({ player, seat }) => {
    const person = hand.people.find((each) => each.player === player);

    return {
      avatar: person?.avatar ?? "",
      name: person?.name ?? "Someone",
      seat,
      stack: hand.stacks?.find((each) => each.seat === seat)?.stack ?? null,
    };
  });

export type SpriteArt =
  | {
      readonly avatar: string;
      readonly expression: Expression;
      readonly kind: "Face";
      readonly name: string;
      readonly size: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "Label";
      readonly size: number;
      readonly text: string;
      readonly tone: "Ink" | "Muted";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly card: string;
      readonly kind: "Card";
      readonly turn: number;
      readonly width: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "Pill";
      readonly text: string;
      readonly tone: "Paper" | "Red";
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "Button"; readonly x: number; readonly y: number };

export interface Key {
  readonly at: number;
  readonly pose: Pose;
}

export interface ReplaySprite {
  readonly art: SpriteArt;
  readonly keys: readonly Key[];
  readonly shownAt: number;
}

export interface ReplayPlan {
  readonly cardAt: number;
  readonly timeline: readonly { readonly at: number; readonly ms: number }[];
  readonly cues: readonly SoundStep[];
  readonly length: number;
  readonly sprites: readonly ReplaySprite[];
  readonly tableMs: number;
}

export const TABLE_LEAST_MS = 4400;

export const TABLE_MOST_MS = 11_400;

export const CARD_MS = 3600;

const CENTRE = { x: 540, y: 800 };

const REACH = { x: 395, y: 320 };

const POT = { x: 540, y: 690 };

const CAPTION = { x: 540, y: 352 };

const BOARD_TOP = 740;

const HIDDEN: Pose = { ...REST, opacity: 0 };

interface Spot {
  readonly inner: number;
  readonly seat: SeatIndex;
  readonly size: number;
  readonly x: number;
  readonly y: number;
}

const FACE_SIZES = [220, 220, 220, 190, 160, 136, 136, 112, 112, 112];

const faceSize = (count: number) => FACE_SIZES[count] ?? 112;

export const spotsOf = (
  seats: readonly SeatIndex[],
  lead: SeatIndex
): readonly Spot[] => {
  const ordered = seats.toSorted((one, other) => one - other);
  const start = Math.max(0, ordered.indexOf(lead));
  const turned = [...ordered.slice(start), ...ordered.slice(0, start)];
  const size = faceSize(turned.length);

  return turned.map((seat, index) => {
    const angle = ((90 + (index * 360) / turned.length) * Math.PI) / 180;
    const x = Math.round(CENTRE.x + REACH.x * Math.cos(angle));
    const y = Math.round(CENTRE.y + REACH.y * Math.sin(angle));

    return { inner: x <= CENTRE.x ? 1 : -1, seat, size, x, y };
  });
};

const holeWidth = (spot: Spot) => Math.round(spot.size * 0.44);

const holeCentre = (spot: Spot) =>
  spot.x + spot.inner * (spot.size / 2 + holeWidth(spot) * 0.62);

const holePlace = (spot: Spot, index: number) => {
  const width = holeWidth(spot);
  const centre = holeCentre(spot);

  return {
    turn: index === 0 ? -7 : 6,
    width,
    x: Math.round(centre - width * 0.8 + index * width * 0.62),
    y: Math.round(spot.y + spot.size * 0.12 - width * 0.7),
  };
};

const betPlace = (spot: Spot) => ({
  x: Math.round(spot.x + spot.inner * (spot.size / 2 + 56)),
  y: Math.round(spot.y - spot.size * 0.32),
});

const oddsPlace = (spot: Spot) => ({
  x: Math.round(holeCentre(spot)),
  y: Math.round(spot.y + spot.size * 0.12 - holeWidth(spot) * 0.7 - 34),
});

const nameBaseline = (spot: Spot) => spot.y + spot.size / 2 + 34;

const stackBaseline = (spot: Spot) => nameBaseline(spot) + 28;

const buttonPlace = (spot: Spot) => ({
  x: Math.round(spot.x - spot.inner * (spot.size / 2 + 30)),
  y: Math.round(spot.y + spot.size / 2 - 24),
});

const boardWidth = (runs: number) => (runs > 1 ? 76 : 96);

const BOARD_GAP = 8;

const boardPlace = (runs: number, run: number, slot: number) => {
  const width = boardWidth(runs);
  const span = width * 5 + BOARD_GAP * 4;

  return {
    turn: 0,
    width,
    x: Math.round(CENTRE.x - span / 2 + slot * (width + BOARD_GAP)),
    y: Math.round(BOARD_TOP + (run - 1) * (width * 1.4 + 10)),
  };
};

type Beat =
  | { readonly kind: "Act"; readonly step: ActedStep; readonly quiet: boolean }
  | { readonly kind: "Award"; readonly step: AwardedStep }
  | { readonly kind: "Deal" }
  | { readonly kind: "Folds"; readonly seats: readonly SeatIndex[] }
  | { readonly kind: "Gather"; readonly pot: number }
  | { readonly kind: "Intro" }
  | { readonly kind: "Muck"; readonly seat: SeatIndex }
  | { readonly kind: "Odds"; readonly step: OddsStep }
  | { readonly kind: "Posts"; readonly steps: readonly PostedStep[] }
  | {
      readonly kind: "Return";
      readonly amount: number;
      readonly seat: SeatIndex;
    }
  | { readonly kind: "Runs"; readonly runs: number }
  | {
      readonly kind: "Shown";
      readonly pace: "Slow" | "Steady";
      readonly step: ShownStep;
    }
  | {
      readonly kind: "Street";
      readonly runout: boolean;
      readonly step: StreetStep;
    };

type StepOf<Tag extends ReplayStep["_tag"]> = Extract<
  ReplayStep,
  { _tag: Tag }
>;

type ActedStep = StepOf<"Acted">;

type AwardedStep = StepOf<"Awarded">;

type OddsStep = StepOf<"Odds">;

type PostedStep = StepOf<"Posted">;

type ShownStep = StepOf<"Shown">;

type StreetStep = StepOf<"StreetDealt">;

const shouts = (step: ActedStep) => step.allIn || step.act !== "Call";

const actionBeats = (
  acted: readonly ActedStep[],
  keep: number
): readonly Beat[] => {
  const loud = acted.filter(
    (step) => step.act !== "Fold" && step.act !== "Check"
  );

  const kept = new Set(loud.slice(-keep));
  const beats: Beat[] = [];
  let folds: SeatIndex[] = [];

  const flush = () => {
    if (folds.length > 0) {
      beats.push({ kind: "Folds", seats: folds });
      folds = [];
    }
  };

  for (const step of acted) {
    if (step.act === "Fold") {
      folds = [...folds, step.seat];
    } else if (step.act !== "Check") {
      flush();
      beats.push({
        kind: "Act",
        quiet: !kept.has(step) && !step.allIn,
        step,
      });
    }
  }

  flush();

  return beats;
};

interface Telling {
  river: boolean;
  tabled: boolean;
}

const onlyBeat = (beat: Beat): readonly Beat[] => [beat];

const NO_BEATS: readonly Beat[] = [];

const stepBeats = (step: ReplayStep, telling: Telling): readonly Beat[] =>
  ReplaySteps.$match(step, {
    Acted: () => NO_BEATS,
    Awarded: (each) => onlyBeat({ kind: "Award", step: each }),
    Dealt: () => onlyBeat({ kind: "Deal" }),
    Gathered: ({ pot }) => onlyBeat({ kind: "Gather", pot }),
    Mucked: ({ seat }) => onlyBeat({ kind: "Muck", seat }),
    Odds: (each) => onlyBeat({ kind: "Odds", step: each }),
    Posted: () => NO_BEATS,
    Returned: ({ amount, seat }) => onlyBeat({ amount, kind: "Return", seat }),
    Runs: ({ runs }) =>
      runs > 1 ? onlyBeat({ kind: "Runs", runs }) : NO_BEATS,
    Shown: (each) =>
      onlyBeat({
        kind: "Shown",
        pace: telling.river || !telling.tabled ? "Slow" : "Steady",
        step: each,
      }),
    StreetDealt: (each) =>
      onlyBeat({ kind: "Street", runout: telling.tabled, step: each }),
  });

const beatsOf = (replay: Replay, keep: number): readonly Beat[] => {
  const beats: Beat[] = [{ kind: "Intro" }];
  const posts = replay.steps.filter((step) => ReplaySteps.$is("Posted")(step));
  const acted: ActedStep[] = [];
  const telling: Telling = { river: false, tabled: false };

  if (posts.length > 0) {
    beats.push({ kind: "Posts", steps: posts });
  }

  for (const step of replay.steps) {
    if (ReplaySteps.$is("Acted")(step)) {
      acted.push(step);
    } else if (!ReplaySteps.$is("Posted")(step)) {
      beats.push(
        ...actionBeats(acted.splice(0), keep),
        ...stepBeats(step, telling)
      );
      telling.tabled ||= ReplaySteps.$is("Shown")(step);
      telling.river ||=
        ReplaySteps.$is("StreetDealt")(step) && step.street === "River";
    }
  }

  beats.push(...actionBeats(acted, keep));

  return beats;
};

const NOT_IN_RECORD = -1;

const recordIndexOf = (beat: Beat): number =>
  Match.value(beat).pipe(
    Match.discriminatorsExhaustive("kind")({
      Act: ({ step }) => step.at,
      Award: ({ step }) => step.at,
      Deal: () => NOT_IN_RECORD,
      Folds: () => NOT_IN_RECORD,
      Gather: () => NOT_IN_RECORD,
      Intro: () => NOT_IN_RECORD,
      Muck: () => NOT_IN_RECORD,
      Odds: ({ step }) => step.at,
      Posts: ({ steps }) => steps[0]?.at ?? NOT_IN_RECORD,
      Return: () => NOT_IN_RECORD,
      Runs: () => NOT_IN_RECORD,
      Shown: ({ step }) => step.at,
      Street: ({ step }) => step.at,
    })
  );

const actHold = (beat: Extract<Beat, { kind: "Act" }>) => {
  if (beat.quiet) {
    return 0;
  }

  return shouts(beat.step) ? 800 : 550;
};

const extraCards = (step: StreetStep) => Math.max(0, step.cards.length - 1);

const holdOf = (beat: Beat): number =>
  Match.value(beat).pipe(
    Match.discriminatorsExhaustive("kind")({
      Act: actHold,
      Award: () => 1000,
      Deal: () => 600,
      Folds: () => 380,
      Gather: () => 400,
      Intro: () => 500,
      Muck: () => 300,
      Odds: () => 1200,
      Posts: () => 500,
      Return: () => 300,
      Runs: () => 600,
      Shown: ({ pace }) => (pace === "Slow" ? 1000 : 600),
      Street: ({ runout, step }) =>
        runout ? 950 + extraCards(step) * 220 : 600 + extraCards(step) * 140,
    })
  );

const firm = (beat: Beat) =>
  beat.kind === "Shown" || beat.kind === "Odds" || beat.kind === "Award";

interface Pace {
  readonly firm: number;
  readonly loose: number;
}

const lengthOf = (beats: readonly Beat[], pace: Pace) =>
  beats.reduce(
    (total, beat) =>
      total + holdOf(beat) * (firm(beat) ? pace.firm : pace.loose),
    0
  );

export const paceOf = (beat: Beat, pace: Pace) =>
  holdOf(beat) * (firm(beat) ? pace.firm : pace.loose);

const MOST_KEPT = 3;

const SHORTEST_LOOSE = 0.62;

const SHORTEST_FIRM = 0.5;

const LONGEST_STRETCH = 1.5;

interface Paced {
  readonly beats: readonly Beat[];
  readonly pace: Pace;
}

const fitted = (beats: readonly Beat[]): Pace => {
  const firmMs = lengthOf(beats, { firm: 1, loose: 0 });
  const looseMs = Math.max(1, lengthOf(beats, { firm: 0, loose: 1 }));
  const natural = firmMs + looseMs;

  if (natural < TABLE_LEAST_MS) {
    const loose = Math.min(
      LONGEST_STRETCH,
      (TABLE_LEAST_MS - firmMs) / looseMs
    );

    return { firm: 1, loose };
  }

  if (natural <= TABLE_MOST_MS) {
    return { firm: 1, loose: 1 };
  }

  const loose = Math.max(SHORTEST_LOOSE, (TABLE_MOST_MS - firmMs) / looseMs);

  if (firmMs + looseMs * loose <= TABLE_MOST_MS) {
    return { firm: 1, loose };
  }

  const firmPace = Math.max(
    SHORTEST_FIRM,
    (TABLE_MOST_MS - looseMs * loose) / Math.max(1, firmMs)
  );

  const squeezed = firmMs * firmPace + looseMs * loose;
  const last = Math.min(1, TABLE_MOST_MS / squeezed);

  return { firm: firmPace * last, loose: loose * last };
};

export const pacedBeats = (replay: Replay): Paced => {
  let keep = MOST_KEPT;
  let beats = beatsOf(replay, keep);

  while (lengthOf(beats, { firm: 1, loose: 1 }) > TABLE_MOST_MS && keep > 1) {
    keep -= 1;
    beats = beatsOf(replay, keep);
  }

  return { beats, pace: fitted(beats) };
};

interface Slot {
  readonly art: SpriteArt;
  readonly index: number;
}

interface Builder {
  readonly cues: SoundStep[];
  readonly slots: Map<string, Slot>;
  readonly sprites: { art: SpriteArt; keys: Key[]; shownAt: number }[];
}

const FADE_MS = 140;

const lastPose = (keys: readonly Key[]) => keys.at(-1)?.pose ?? HIDDEN;

const lastAt = (keys: readonly Key[]) => keys.at(-1)?.at ?? 0;

type Entrance = "Deal" | "Drop" | "Fade" | "Flip" | "Present" | "Stamp";

const entranceKeys = (
  entrance: Entrance,
  at: number,
  from: { readonly x: number; readonly y: number }
): readonly Key[] =>
  Match.value(entrance).pipe(
    Match.withReturnType<readonly Key[]>(),
    Match.when("Deal", () => [
      { at, pose: { ...HIDDEN, dx: from.x, dy: from.y, scale: 0.6 } },
      {
        at: at + 60,
        pose: { ...REST, dx: from.x * 0.8, dy: from.y * 0.8, scale: 0.7 },
      },
      { at: at + 300, pose: REST },
    ]),
    Match.when("Drop", () => [
      { at, pose: { ...HIDDEN, dy: -36 } },
      { at: at + 240, pose: REST },
    ]),
    Match.when("Fade", () => [
      { at, pose: HIDDEN },
      { at: at + FADE_MS, pose: REST },
    ]),
    Match.when("Flip", () => [
      { at, pose: { ...REST, squeeze: 0.02 } },
      { at: at + 170, pose: REST },
    ]),
    Match.when("Present", () => [{ at: 0, pose: REST }]),
    Match.when("Stamp", () => [
      { at, pose: { ...HIDDEN, scale: 1.35 } },
      { at: at + 60, pose: { ...REST, scale: 1.3 } },
      { at: at + 260, pose: REST },
    ]),
    Match.exhaustive
  );

const settleKeys = (keys: Key[], at: number) => {
  const when = Math.max(at, lastAt(keys));

  keys.push({ at: when, pose: lastPose(keys) });

  return when;
};

const hide = (builder: Builder, name: string, at: number, ms = FADE_MS) => {
  const slot = builder.slots.get(name);
  const sprite = slot === undefined ? undefined : builder.sprites[slot.index];

  if (sprite === undefined) {
    return;
  }

  const when = settleKeys(sprite.keys, at);

  sprite.keys.push({
    at: when + ms,
    pose: { ...lastPose(sprite.keys), opacity: 0 },
  });
  builder.slots.delete(name);
};

const show = (
  builder: Builder,
  name: string,
  art: SpriteArt,
  timing: {
    readonly at: number;
    readonly entrance: Entrance;
    readonly from?: { readonly x: number; readonly y: number };
  }
) => {
  const current = builder.slots.get(name);

  if (
    current !== undefined &&
    JSON.stringify(current.art) === JSON.stringify(art)
  ) {
    return;
  }

  hide(builder, name, timing.at);

  const keys = [
    ...entranceKeys(timing.entrance, timing.at, timing.from ?? { x: 0, y: 0 }),
  ];

  builder.sprites.push({
    art,
    keys,
    shownAt: timing.entrance === "Present" ? 0 : timing.at,
  });
  builder.slots.set(name, { art, index: builder.sprites.length - 1 });
};

const glide = (
  builder: Builder,
  name: string,
  motion: {
    readonly at: number;
    readonly by: { readonly x: number; readonly y: number };
    readonly ms: number;
  }
) => {
  const slot = builder.slots.get(name);
  const sprite = slot === undefined ? undefined : builder.sprites[slot.index];

  if (sprite === undefined) {
    return;
  }

  const when = settleKeys(sprite.keys, motion.at);

  sprite.keys.push({
    at: when + motion.ms,
    pose: {
      ...lastPose(sprite.keys),
      dx: motion.by.x,
      dy: motion.by.y,
      opacity: 0,
      scale: 0.8,
    },
  });
  builder.slots.delete(name);
};

interface Table {
  readonly bets: Map<SeatIndex, number>;
  readonly expressions: Map<SeatIndex, Expression>;
  readonly folded: Set<SeatIndex>;
  readonly runs: number;
  readonly seats: ReadonlyMap<SeatIndex, ReplaySeat>;
  readonly spots: ReadonlyMap<SeatIndex, Spot>;
  readonly stacks: Map<SeatIndex, number>;
}

const nameOf = (table: Table, seat: SeatIndex) =>
  table.seats.get(seat)?.name ?? "Someone";

const LABEL_NAME = 28;

const LABEL_STACK = 24;

const faceArtOf = (
  table: Table,
  spot: Spot,
  expression: Expression
): SpriteArt => ({
  avatar: table.seats.get(spot.seat)?.avatar ?? "",
  expression,
  kind: "Face",
  name: shortName(nameOf(table, spot.seat)),
  size: spot.size,
  x: spot.x - spot.size / 2,
  y: spot.y - spot.size / 2,
});

const setFace = (
  builder: Builder,
  table: Table,
  seat: SeatIndex,
  expression: Expression,
  at: number
) => {
  const spot = table.spots.get(seat);

  if (spot === undefined || table.expressions.get(seat) === expression) {
    return;
  }

  table.expressions.set(seat, expression);
  show(builder, `face:${seat}`, faceArtOf(table, spot, expression), {
    at,
    entrance: at === 0 ? "Present" : "Fade",
  });
};

const setStack = (
  builder: Builder,
  table: Table,
  seat: SeatIndex,
  at: number
) => {
  const spot = table.spots.get(seat);

  if (spot === undefined || !table.stacks.has(seat)) {
    return;
  }

  show(
    builder,
    `stack:${seat}`,
    {
      kind: "Label",
      size: LABEL_STACK,
      text:
        (table.stacks.get(seat) ?? 0) === 0
          ? REPLAY_WORDS.allInStack
          : REPLAY_WORDS.stack(table.stacks.get(seat) ?? 0),
      tone: "Muted",
      x: spot.x,
      y: stackBaseline(spot),
    },
    { at, entrance: at === 0 ? "Present" : "Fade" }
  );
};

const setBet = (
  builder: Builder,
  table: Table,
  seat: SeatIndex,
  at: number,
  red: boolean
) => {
  const spot = table.spots.get(seat);
  const amount = table.bets.get(seat) ?? 0;

  if (spot === undefined) {
    return;
  }

  if (amount === 0) {
    hide(builder, `bet:${seat}`, at);

    return;
  }

  show(
    builder,
    `bet:${seat}`,
    {
      kind: "Pill",
      text: REPLAY_WORDS.stack(amount),
      tone: red ? "Red" : "Paper",
      ...betPlace(spot),
    },
    { at, entrance: "Stamp" }
  );
};

const caption = (builder: Builder, text: string, at: number) => {
  show(
    builder,
    "caption",
    {
      kind: "Label",
      size: 34,
      text,
      tone: "Muted",
      x: CAPTION.x,
      y: CAPTION.y,
    },
    { at, entrance: "Fade" }
  );
};

const potArt = (amount: number): SpriteArt => ({
  kind: "Pill",
  text: REPLAY_WORDS.pot(amount),
  tone: "Red",
  ...POT,
});

const commit = (table: Table, seat: SeatIndex, amount: number) => {
  table.stacks.set(seat, Math.max(0, (table.stacks.get(seat) ?? 0) - amount));
};

const holeKeys = (seat: SeatIndex, index: number) => `hole:${seat}:${index}`;

const flipHole = (
  builder: Builder,
  table: Table,
  seat: SeatIndex,
  cards: readonly Card[],
  at: number
) => {
  const spot = table.spots.get(seat);

  if (spot === undefined) {
    return;
  }

  for (const [index, card] of cards.entries()) {
    const name = holeKeys(seat, index);

    const face: SpriteArt = {
      card: cardText(card),
      kind: "Card",
      ...holePlace(spot, index),
    };

    const current = builder.slots.get(name);

    if (
      current !== undefined &&
      JSON.stringify(current.art) === JSON.stringify(face)
    ) {
      continue;
    }

    const back =
      current === undefined ? undefined : builder.sprites[current.index];

    if (back !== undefined) {
      const when = settleKeys(back.keys, at + index * 90);

      back.keys.push(
        { at: when + 140, pose: { ...lastPose(back.keys), squeeze: 0.02 } },
        { at: when + 141, pose: HIDDEN }
      );
      builder.slots.delete(name);
    }

    show(builder, name, face, { at: at + index * 90 + 140, entrance: "Flip" });
  }
};

const dealHole = (builder: Builder, table: Table, at: number) => {
  let delay = 0;

  for (const spot of table.spots.values()) {
    for (const index of [0, 1]) {
      show(
        builder,
        holeKeys(spot.seat, index),
        { card: "", kind: "Card", ...holePlace(spot, index) },
        {
          at: at + delay,
          entrance: "Deal",
          from: { x: CENTRE.x - spot.x, y: CENTRE.y - spot.y },
        }
      );
      delay += 22;
    }
  }
};

const foldHole = (
  builder: Builder,
  table: Table,
  seat: SeatIndex,
  at: number
) => {
  const spot = table.spots.get(seat);

  if (spot === undefined) {
    return;
  }

  for (const index of [0, 1]) {
    glide(builder, holeKeys(seat, index), {
      at,
      by: { x: (CENTRE.x - spot.x) * 0.3, y: (CENTRE.y - spot.y) * 0.3 },
      ms: 300,
    });
  }
};

type BeatOf<Kind extends Beat["kind"]> = Extract<Beat, { kind: Kind }>;

const NO_CUES: readonly SoundStep[] = [];

interface Stage {
  readonly at: number;
  readonly builder: Builder;
  readonly table: Table;
}

const introBeat = ({ builder, table }: Stage) => {
  for (const spot of table.spots.values()) {
    setFace(builder, table, spot.seat, "Resting", 0);
    show(
      builder,
      `name:${spot.seat}`,
      {
        kind: "Label",
        size: LABEL_NAME,
        text: shortName(nameOf(table, spot.seat)),
        tone: "Ink",
        x: spot.x,
        y: nameBaseline(spot),
      },
      { at: 0, entrance: "Present" }
    );
    setStack(builder, table, spot.seat, 0);
  }

  return NO_CUES;
};

const postsBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Posts">) => {
  let antes = 0;

  for (const step of beat.steps) {
    commit(table, step.seat, step.amount);

    if (step.post === "Ante" || step.post === "Dead") {
      antes += step.amount;
    } else {
      table.bets.set(step.seat, (table.bets.get(step.seat) ?? 0) + step.amount);
      setBet(builder, table, step.seat, at, false);
    }

    setStack(builder, table, step.seat, at);
  }

  if (antes > 0) {
    show(builder, "pot", potArt(antes), { at, entrance: "Stamp" });
  }

  return chips(at / 1000, 4, 0.5, Math.round(at));
};

const dealBeat = ({ at, builder, table }: Stage) => {
  dealHole(builder, table, at);

  for (const spot of table.spots.values()) {
    setFace(builder, table, spot.seat, "LookingDown", at + 320);
    setFace(builder, table, spot.seat, "Resting", at + 680);
  }

  return [...flip(at / 1000), ...flip((at + 260) / 1000)];
};

const actCaption = (step: ActedStep, name: string) => {
  if (step.allIn) {
    return step.act === "Call"
      ? REPLAY_WORDS.callsAllIn(name)
      : REPLAY_WORDS.allIn(name, step.to);
  }

  return Match.value(step.act).pipe(
    Match.when("Call", () => REPLAY_WORDS.call(name)),
    Match.when("Raise", () => REPLAY_WORDS.raise(name, step.to)),
    Match.orElse(() => REPLAY_WORDS.bet(name, step.to))
  );
};

const actBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Act">) => {
  const { step } = beat;

  commit(table, step.seat, step.added);
  table.bets.set(step.seat, step.to);
  setStack(builder, table, step.seat, at);
  setBet(builder, table, step.seat, at, step.allIn || step.act === "Raise");

  if (beat.quiet) {
    return NO_CUES;
  }

  if (shouts(step)) {
    setFace(builder, table, step.seat, "Thinking", at);
  }

  caption(builder, actCaption(step, nameOf(table, step.seat)), at);

  return chips(at / 1000, step.allIn ? 9 : 5, 0.6, Math.round(at));
};

const foldsBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Folds">) => {
  for (const seat of beat.seats) {
    table.folded.add(seat);
    foldHole(builder, table, seat, at);
    setFace(builder, table, seat, "Folded", at);
  }

  return NO_CUES;
};

const gatherBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Gather">) => {
  for (const [seat, amount] of table.bets) {
    const spot = table.spots.get(seat);

    if (spot !== undefined && amount > 0) {
      const place = betPlace(spot);

      glide(builder, `bet:${seat}`, {
        at,
        by: { x: POT.x - place.x, y: POT.y - place.y },
        ms: 320,
      });
    }
  }

  table.bets.clear();
  show(builder, "pot", potArt(beat.pot), { at: at + 300, entrance: "Stamp" });

  return chips((at + 200) / 1000, 6, 0.45, Math.round(at));
};

const firstSlotOf = (street: StreetStep["street"]) =>
  Match.value(street).pipe(
    Match.when("Flop", () => 0),
    Match.when("Turn", () => 3),
    Match.orElse(() => 4)
  );

const streetBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Street">) => {
  const { cards, run, street } = beat.step;
  const first = firstSlotOf(street);
  const gap = beat.runout ? 260 : 160;

  for (const [index, card] of cards.entries()) {
    show(
      builder,
      `board:${run}:${first + index}`,
      {
        card: cardText(card),
        kind: "Card",
        ...boardPlace(table.runs, run, first + index),
      },
      { at: at + index * gap, entrance: "Drop" }
    );
  }

  return cards.flatMap((_, index) => flip((at + index * gap) / 1000));
};

const shownBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Shown">) => {
  flipHole(builder, table, beat.step.seat, beat.step.cards, at);

  return flip((at + 140) / 1000);
};

const oddsBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Odds">) => {
  for (const chance of beat.step.chances) {
    const spot = table.spots.get(chance.seat);

    if (spot !== undefined) {
      show(
        builder,
        `odds:${chance.seat}`,
        {
          kind: "Pill",
          text: REPLAY_WORDS.odds(chance.percent),
          tone: "Paper",
          ...oddsPlace(spot),
        },
        { at, entrance: "Stamp" }
      );
    }
  }

  return NO_CUES;
};

const returnBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Return">) => {
  table.stacks.set(beat.seat, (table.stacks.get(beat.seat) ?? 0) + beat.amount);
  table.bets.set(
    beat.seat,
    Math.max(0, (table.bets.get(beat.seat) ?? 0) - beat.amount)
  );
  setBet(builder, table, beat.seat, at, false);
  setStack(builder, table, beat.seat, at);

  return NO_CUES;
};

const awardCaption = (table: Table, step: AwardedStep, total: number) => {
  const [first] = step.shares;

  return step.shares.length > 1 || first === undefined
    ? REPLAY_WORDS.split(total)
    : REPLAY_WORDS.wins(nameOf(table, first.seat), first.amount);
};

const awardBeat = ({ at, builder, table }: Stage, beat: BeatOf<"Award">) => {
  const { shares } = beat.step;
  const [first] = shares;
  const total = shares.reduce((sum, share) => sum + share.amount, 0);
  const spot = first === undefined ? undefined : table.spots.get(first.seat);

  for (const seat of table.spots.keys()) {
    hide(builder, `odds:${seat}`, at);
  }

  show(builder, "pot", potArt(total), { at, entrance: "Fade" });

  if (spot !== undefined) {
    glide(builder, "pot", {
      at,
      by: { x: spot.x - POT.x, y: spot.y - POT.y },
      ms: 420,
    });
  }

  for (const share of shares) {
    table.stacks.set(
      share.seat,
      (table.stacks.get(share.seat) ?? 0) + share.amount
    );
    setStack(builder, table, share.seat, at + 420);
    setFace(builder, table, share.seat, "Happy", at + 300);
  }

  for (const seat of table.spots.keys()) {
    if (
      !table.folded.has(seat) &&
      !shares.some((share) => share.seat === seat)
    ) {
      setFace(builder, table, seat, "Gutted", at + 300);
    }
  }

  caption(builder, awardCaption(table, beat.step, total), at + 200);

  return chips((at + 300) / 1000, 12, 0.8, Math.round(at));
};

const muckBeat = ({ at, builder, table }: Stage, seat: SeatIndex) => {
  foldHole(builder, table, seat, at);

  return NO_CUES;
};

const runsBeat = ({ at, builder }: Stage, runs: number) => {
  caption(builder, REPLAY_WORDS.runs(runs), at);

  return NO_CUES;
};

const beatAt = (stage: Stage, beat: Beat): readonly SoundStep[] =>
  Match.value(beat).pipe(
    Match.discriminatorsExhaustive("kind")({
      Act: (each) => actBeat(stage, each),
      Award: (each) => awardBeat(stage, each),
      Deal: () => dealBeat(stage),
      Folds: (each) => foldsBeat(stage, each),
      Gather: (each) => gatherBeat(stage, each),
      Intro: () => introBeat(stage),
      Muck: ({ seat }) => muckBeat(stage, seat),
      Odds: (each) => oddsBeat(stage, each),
      Posts: (each) => postsBeat(stage, each),
      Return: (each) => returnBeat(stage, each),
      Runs: ({ runs }) => runsBeat(stage, runs),
      Shown: (each) => shownBeat(stage, each),
      Street: (each) => streetBeat(stage, each),
    })
  );

export const replayPlan = (
  replay: Replay,
  facts: {
    readonly lead: SeatIndex;
    readonly seats: readonly ReplaySeat[];
  }
): ReplayPlan => {
  const { beats, pace } = pacedBeats(replay);
  const spots = spotsOf(replay.dealtIn, facts.lead);

  const runs = Math.max(
    1,
    ...replay.steps.flatMap((step) =>
      ReplaySteps.$is("StreetDealt")(step) ? [step.run] : []
    )
  );

  const table: Table = {
    bets: new Map(),
    expressions: new Map(),
    folded: new Set(),
    runs,
    seats: new Map(facts.seats.map((seat) => [seat.seat, seat])),
    spots: new Map(spots.map((spot) => [spot.seat, spot])),
    stacks: new Map(
      facts.seats.flatMap((seat) =>
        seat.stack === null ? [] : [[seat.seat, seat.stack] as const]
      )
    ),
  };

  const builder: Builder = { cues: [], slots: new Map(), sprites: [] };
  const button = table.spots.get(replay.button);

  if (button !== undefined) {
    show(
      builder,
      "button",
      { kind: "Button", ...buttonPlace(button) },
      { at: 0, entrance: "Present" }
    );
  }

  let at = 0;
  const timeline: { at: number; ms: number }[] = [];

  for (const beat of beats) {
    timeline.push({ at: recordIndexOf(beat), ms: at });
    builder.cues.push(...beatAt({ at, builder, table }, beat));
    at += paceOf(beat, pace);
  }

  const cardAt = Math.round(at);

  for (const name of builder.slots.keys()) {
    hide(builder, name, cardAt, 300);
  }

  return {
    cardAt,
    cues: builder.cues,
    length: cardAt + CARD_MS,
    sprites: builder.sprites,
    tableMs: cardAt,
    timeline: timeline.filter((entry) => entry.at >= 0),
  };
};

export const poseAtKeys = (keys: readonly Key[], ms: number): Pose => {
  const [first] = keys;

  if (first === undefined || ms < first.at) {
    return HIDDEN;
  }

  const next = keys.findIndex((key) => key.at > ms);

  if (next === -1) {
    return lastPose(keys);
  }

  const from = keys[next - 1] ?? first;
  const to = keys[next] ?? from;
  const amount = 1 - (1 - (ms - from.at) / Math.max(1, to.at - from.at)) ** 3;
  const mix = (one: number, other: number) => one + (other - one) * amount;

  return {
    dx: mix(from.pose.dx, to.pose.dx),
    dy: mix(from.pose.dy, to.pose.dy),
    opacity: mix(from.pose.opacity, to.pose.opacity),
    scale: mix(from.pose.scale, to.pose.scale),
    squeeze: mix(from.pose.squeeze, to.pose.squeeze),
    turn: mix(from.pose.turn, to.pose.turn),
  };
};
