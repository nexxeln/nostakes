import type { Expression } from "@nostakes/avatar";
import { cardText, evaluate, rankOf } from "@nostakes/engine";
import type { Card, SeatIndex } from "@nostakes/engine";
import { ReplaySteps } from "@nostakes/room";
import type { MomentKind, Replay, ReplayStep, Tier } from "@nostakes/room";

import { FRAME_SIZES } from "../pictures/paper.js";
import type { KeptFrame } from "../pictures/paper.js";
import type { MomentHand } from "./element.js";
import { handName, startingHandName } from "./hand-names.js";
import { STAGE, captionLines, layoutOf } from "./replay-shots.js";
import type { Cast, Chances, Person, Shot } from "./replay-shots.js";
import { SLAM_MS, cleared, sent, staged, stagerOf } from "./replay-stage.js";
import type { Key, ReplaySprite } from "./replay-stage.js";
import { REPLAY_WORDS, shortName } from "./replay-words.js";
import { FAMILIES } from "./score.js";
import type { Family } from "./score.js";
import type {
  Outcome,
  ScoreSheet,
  SmallCue,
  SmallSound,
} from "./sound/sheet.js";
import { REST } from "./timeline.js";

export { poseAtKeys } from "./replay-stage.js";

export type { Key, ReplaySprite, SpriteArt } from "./replay-stage.js";

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

export interface ReplayFacts {
  readonly frame: KeptFrame;
  readonly kind: MomentKind;
  readonly principals: readonly SeatIndex[];
  readonly seats: readonly ReplaySeat[];
  readonly tanked?: readonly SeatIndex[];
  readonly tier: Tier;
}

export type Section = "Build" | "Hook" | "Pause" | "Payoff" | "Tag";

export interface PlannedBeat {
  readonly at: number;
  readonly hold: number;
  readonly section: Section;
}

export interface ReplayPlan {
  readonly beats: readonly PlannedBeat[];
  readonly camera: readonly Key[];
  readonly cardAt: number;
  readonly length: number;
  readonly sections: readonly { readonly at: number; readonly name: Section }[];
  readonly sheet: ScoreSheet;
  readonly sprites: readonly ReplaySprite[];
  readonly timeline: readonly { readonly at: number; readonly ms: number }[];
}

export const TAG_MS = 2400;

const WHOLE_HAND_KINDS: ReadonlySet<MomentKind> = new Set([
  "SameHand",
  "SevenDeuce",
  "SplitRuns",
]);

export const tellsTheHand = (kind: MomentKind, tier: Tier) =>
  tier >= 2 || WHOLE_HAND_KINDS.has(kind);

export const SHORTEST_MS = 12_000;

export const LONGEST_MS = 25_000;

const HOOK_MS = 1900;

const PAUSE_MS = 1900;

const BREATH_MS = 400;

const HIT_MS = 1700;

const PAYOFF_MS = 1800;

const LOOSEST = 1.45;

const TIGHTEST = 0.35;

const SWING_POINTS = 20;

const CLIMB_POINTS = 8;

const NO_IDEA_PERCENT = 12;

const SURE_PERCENT = 85;

const MOST_LOUD = 3;

const HOLE_CARDS = 2;

const FLOP_CARDS = 3;

const FULL_BOARD = 5;

type StepOf<Tag extends ReplayStep["_tag"]> = Extract<
  ReplayStep,
  { _tag: Tag }
>;

type OddsStep = StepOf<"Odds">;

type ActedStep = StepOf<"Acted">;

type StreetStep = StepOf<"StreetDealt">;

type AwardedStep = StepOf<"Awarded">;

interface DraftSeat {
  bet: number;
  cards: readonly string[];
  expression: Expression;
  folded: boolean;
  loud: boolean;
  note: string;
  stack: number | null;
}

interface Draft {
  boards: string[][];
  caption: readonly string[];
  facing: number;
  focus: SeatIndex;
  odds: Chances | null;
  pot: number;
  readonly seats: Map<SeatIndex, DraftSeat>;
  shot: Shot;
  slammed: string;
}

type Mark = "Hit" | "Pause" | "Result";

interface Show {
  readonly apply: (offset?: number) => void;
  readonly cue: (kind: SmallSound, offset: number, seat?: SeatIndex) => void;
  readonly cut: (shot: Shot, focus?: SeatIndex) => void;
  readonly draft: Draft;
  readonly fly: (name: string, by: { x: number; y: number }) => void;
  readonly mark: (what: Mark, offset?: number) => void;
  readonly punch: () => void;
  readonly push: (to: number) => void;
  readonly seat: (seat: SeatIndex) => DraftSeat;
  readonly seen: (record: number, offset: number) => void;
  readonly shake: (strength: number) => void;
}

interface Beat {
  readonly firm: boolean;
  readonly hold: number;
  readonly play: (show: Show) => void;
  readonly section: Section;
}

interface Swing {
  readonly gainer: SeatIndex;
  readonly step: OddsStep;
  readonly victim: SeatIndex;
}

type Decisive =
  | { readonly kind: "Call"; readonly step: ActedStep }
  | { readonly kind: "Card"; readonly swing: Swing }
  | { readonly kind: "Fold"; readonly step: ActedStep }
  | { readonly kind: "None" };

interface Told {
  readonly cast: Cast;
  readonly decisive: Decisive;
  readonly lead: SeatIndex;
  readonly loud: ReadonlySet<ActedStep>;
  readonly names: ReadonlyMap<SeatIndex, string>;
  readonly other: SeatIndex | null;
  readonly tabled: ReadonlyMap<SeatIndex, readonly Card[]>;
  readonly winners: ReadonlyMap<number, readonly SeatIndex[]>;
}

const percentOf = (step: OddsStep, seat: SeatIndex | null) =>
  step.chances.find((chance) => chance.seat === seat)?.percent;

const chancesOf = (step: OddsStep | null, told: Told): Chances | null => {
  if (step === null) {
    return null;
  }

  const lead = percentOf(step, told.lead);
  const other = percentOf(step, told.other);

  return lead === undefined || other === undefined ? null : { lead, other };
};

const winnersOf = (replay: Replay) => {
  const winners = new Map<number, SeatIndex[]>();

  for (const step of replay.steps) {
    if (ReplaySteps.$is("Awarded")(step)) {
      winners.set(step.run, [
        ...new Set([
          ...(winners.get(step.run) ?? []),
          ...step.shares.map((share) => share.seat),
        ]),
      ]);
    }
  }

  return winners;
};

const swingOf = (
  replay: Replay,
  lead: SeatIndex,
  other: SeatIndex | null,
  winners: ReadonlyMap<number, readonly SeatIndex[]>
): Swing | null => {
  const before = new Map<number, OddsStep>();
  let shared: OddsStep | null = null;
  let best: { readonly gain: number; readonly swing: Swing } | null = null;

  if (other === null) {
    return null;
  }

  for (const step of replay.steps) {
    if (!ReplaySteps.$is("Odds")(step)) {
      continue;
    }

    const earlier = before.get(step.run) ?? shared;
    const won = winners.get(step.run) ?? [];

    if (earlier !== null && step.board.length > earlier.board.length) {
      for (const [gainer, victim] of [
        [lead, other],
        [other, lead],
      ] as const) {
        const gain =
          (percentOf(step, gainer) ?? 0) - (percentOf(earlier, gainer) ?? 0);

        if (
          gain >= SWING_POINTS &&
          won.includes(gainer) &&
          !won.includes(victim) &&
          (best === null || gain >= best.gain)
        ) {
          best = { gain, swing: { gainer, step, victim } };
        }
      }
    }

    before.set(step.run, step);

    if (before.size === 1) {
      shared = step;
    }
  }

  return best?.swing ?? null;
};

const lastActed = (
  replay: Replay,
  wanted: (step: ActedStep) => boolean
): ActedStep | undefined =>
  replay.steps.filter(ReplaySteps.$is("Acted")).findLast(wanted);

const decisiveOf = (
  replay: Replay,
  facts: ReplayFacts,
  lead: SeatIndex,
  swing: Swing | null
): Decisive => {
  const showdown = replay.steps.some(
    (step) => ReplaySteps.$is("Odds")(step) && step.board.length === FULL_BOARD
  );

  if (facts.kind === "HeroCall") {
    const call = lastActed(
      replay,
      (step) => step.act === "Call" && step.seat === lead
    );

    if (call !== undefined) {
      return { kind: "Call", step: call };
    }
  }

  if (facts.kind === "Bluff" || (facts.kind === "SevenDeuce" && !showdown)) {
    const fold = lastActed(replay, (step) => step.act === "Fold");

    if (fold !== undefined) {
      return { kind: "Fold", step: fold };
    }
  }

  return swing === null ? { kind: "None" } : { kind: "Card", swing };
};

const otherOf = (replay: Replay, facts: ReplayFacts, lead: SeatIndex) => {
  const [, named] = facts.principals;

  if (named !== undefined && named !== lead) {
    return named;
  }

  const folded = replay.steps
    .filter(ReplaySteps.$is("Acted"))
    .filter((step) => step.act === "Fold")
    .map((step) => step.seat);

  const still = replay.dealtIn.filter(
    (seat) => seat !== lead && !folded.includes(seat)
  );

  return (
    still.find((seat) => replay.tabled.some((each) => each.seat === seat)) ??
    still[0] ??
    folded.findLast((seat) => seat !== lead) ??
    null
  );
};

const loudOf = (replay: Replay): ReadonlySet<ActedStep> => {
  const wagers = replay.steps
    .filter(ReplaySteps.$is("Acted"))
    .filter((step) => step.act !== "Fold" && step.act !== "Check");

  return new Set([
    ...wagers.slice(-MOST_LOUD),
    ...wagers.filter((step) => step.allIn),
  ]);
};

const toldOf = (replay: Replay, facts: ReplayFacts): Told => {
  const lead = facts.principals[0] ?? replay.dealtIn[0] ?? replay.button;
  const other = otherOf(replay, facts, lead);
  const winners = winnersOf(replay);

  const person = (seat: SeatIndex): Person => {
    const found = facts.seats.find((each) => each.seat === seat);

    return {
      avatar: found?.avatar ?? "",
      name: shortName(found?.name ?? "Someone"),
      seat,
    };
  };

  return {
    cast: {
      lead: person(lead),
      other: other === null ? null : person(other),
      rest: replay.dealtIn
        .filter((seat) => seat !== lead && seat !== other)
        .map(person),
      top: (FRAME_SIZES[facts.frame].height - STAGE.height) / 2,
    },
    decisive: decisiveOf(
      replay,
      facts,
      lead,
      swingOf(replay, lead, other, winners)
    ),
    lead,
    loud: loudOf(replay),
    names: new Map(facts.seats.map((seat) => [seat.seat, seat.name] as const)),
    other,
    tabled: new Map(replay.tabled.map((each) => [each.seat, each.cards])),
    winners,
  };
};

const nameOf = (told: Told, seat: SeatIndex) =>
  told.names.get(seat) ?? "Someone";

const holeOf = (told: Told, seat: SeatIndex): readonly string[] => {
  const shown = (told.tabled.get(seat) ?? []).map(cardText);

  return [
    ...shown,
    ...Array.from({ length: HOLE_CARDS - shown.length }, () => ""),
  ];
};

const fullHole = (told: Told, seat: SeatIndex | null) => {
  const cards = seat === null ? [] : (told.tabled.get(seat) ?? []);

  return cards.length === HOLE_CARDS ? cards : null;
};

const heldBy = (hole: readonly Card[], board: readonly Card[]) =>
  board.length >= FLOP_CARDS
    ? handName(evaluate([...hole, ...board]))
    : startingHandName(hole);

const madeBy = (hole: readonly Card[], board: readonly Card[]) => {
  const last = board.at(-1);

  if (last === undefined) {
    return "";
  }

  if (board.length >= FLOP_CARDS) {
    return handName(evaluate([...hole, ...board]));
  }

  const alike = [...hole, ...board].filter(
    (card) => rankOf(card) === rankOf(last)
  ).length;

  return alike >= 2 && hole.some((card) => rankOf(card) === rankOf(last))
    ? REPLAY_WORDS.twoOfThem(rankOf(last), alike)
    : "";
};

const hookOf = (facts: ReplayFacts, told: Told, dealt: OddsStep | null) => {
  const lead = nameOf(told, told.lead);
  const other = told.other === null ? "" : nameOf(told, told.other);
  const hole = fullHole(told, told.lead);
  const start = hole === null ? "" : startingHandName(hole);

  if (facts.kind === "SevenDeuce") {
    return REPLAY_WORDS.hookSevenDeuce(lead);
  }

  if (facts.kind === "SameHand" && told.other !== null && start.length > 0) {
    return REPLAY_WORDS.hookSame(lead, other, start);
  }

  const chances = chancesOf(dealt, told);

  if (chances !== null && told.other !== null) {
    const about = chances.lead >= chances.other ? told.lead : told.other;

    return REPLAY_WORDS.hookOdds(
      nameOf(told, about),
      Math.max(chances.lead, chances.other)
    );
  }

  if (
    told.other !== null &&
    fullHole(told, told.other) === null &&
    hole !== null
  ) {
    return REPLAY_WORDS.hookSeen(lead, other);
  }

  return start.length > 0
    ? REPLAY_WORDS.hookHolds(lead, start)
    : REPLAY_WORDS.lastCard;
};

const unseenOfRank =
  (step: OddsStep) =>
  (rank: number): number =>
    4 -
    [...step.board, ...step.chances.flatMap((chance) => chance.cards)].filter(
      (card) => rankOf(card) === rank
    ).length;

const outsLine = (told: Told, step: OddsStep) => {
  const outs = step.outs.find(
    (each) => each.seat === told.lead || each.seat === told.other
  );

  if (outs === undefined) {
    return null;
  }

  if (outs.cards.length === 0) {
    if (step.board.length !== FULL_BOARD - 1) {
      return null;
    }

    if (percentOf(step, outs.seat) === 0) {
      return REPLAY_WORDS.dead(nameOf(told, outs.seat));
    }

    return step.outs.every((each) => each.cards.length === 0)
      ? REPLAY_WORDS.tied
      : null;
  }

  return REPLAY_WORDS.needs(
    nameOf(told, outs.seat),
    outs.cards,
    unseenOfRank(step)
  );
};

const actLine = (
  told: Told,
  step: ActedStep,
  odds: Chances | null,
  seen: {
    readonly board: readonly Card[];
    readonly decisive: boolean;
    readonly stackBefore: number | null;
  }
) => {
  const name = nameOf(told, step.seat);
  const { stackBefore } = seen;
  const hole = fullHole(told, step.seat);

  const holding =
    hole !== null && seen.board.length === FULL_BOARD
      ? handName(evaluate([...hole, ...seen.board]))
      : "";

  const mine = (() => {
    if (odds === null) {
      return null;
    }

    if (step.seat === told.lead) {
      return odds.lead;
    }

    return step.seat === told.other ? odds.other : null;
  })();

  if (step.act === "Call") {
    if (mine !== null && mine >= SURE_PERCENT && !seen.decisive) {
      return REPLAY_WORDS.callAhead(name);
    }

    return step.allIn ? REPLAY_WORDS.callAllIn(name) : REPLAY_WORDS.call(name);
  }

  if (mine !== null && mine <= NO_IDEA_PERCENT) {
    return hole !== null && holding.endsWith(" high")
      ? REPLAY_WORDS.bluffs(name, step.to, step.allIn, startingHandName(hole))
      : REPLAY_WORDS.noIdea(name, step.to, step.allIn);
  }

  if (step.allIn) {
    return REPLAY_WORDS.allIn(
      name,
      step.to,
      stackBefore !== null && stackBefore === step.added
    );
  }

  return step.act === "Raise"
    ? REPLAY_WORDS.raise(name, step.to)
    : REPLAY_WORDS.bet(name, step.to);
};

interface Walk {
  readonly announced: Set<number>;
  asked: string;
  readonly beats: Beat[];
  readonly bets: Map<SeatIndex, number>;
  readonly boards: Card[][];
  folds: SeatIndex[];
  odds: OddsStep | null;
  pot: number;
  shared: OddsStep | null;
  readonly stacks: Map<SeatIndex, number>;
}

const add = (
  walk: Walk,
  beat: {
    readonly firm?: boolean;
    readonly hold: number;
    readonly section: Section;
  },
  play: (show: Show) => void
) => {
  walk.beats.push({
    firm: beat.firm ?? false,
    hold: beat.hold,
    play,
    section: beat.section,
  });
};

const quietly = (walk: Walk, play: (show: Show) => void) => {
  add(walk, { firm: true, hold: 0, section: "Build" }, play);
};

const flushFolds = (walk: Walk, told: Told) => {
  const seats = walk.folds;
  const [only] = seats;

  if (only === undefined) {
    return;
  }

  walk.folds = [];
  add(walk, { hold: 640, section: "Build" }, (show) => {
    show.cut("TwoShot");

    for (const seat of seats) {
      const draft = show.seat(seat);

      draft.folded = true;
      draft.cards = [];
      draft.expression = "Folded";
      draft.bet = 0;
    }

    show.draft.caption = captionLines(
      seats.length === 1
        ? REPLAY_WORDS.fold(nameOf(told, only))
        : REPLAY_WORDS.folds(seats.length)
    );
    show.apply();
    show.cue("Fold", 0, only);
  });
};

const facingOf = (walk: Walk, seat: SeatIndex) =>
  Math.max(0, ...walk.bets.values()) - (walk.bets.get(seat) ?? 0);

const wagered = (walk: Walk, told: Told, step: ActedStep) => {
  const decisive = told.decisive.kind === "Call" && told.decisive.step === step;

  const stackBefore = walk.stacks.get(step.seat) ?? null;
  const facing = facingOf(walk, step.seat);
  const [board = []] = walk.boards;

  const line = actLine(told, step, chancesOf(walk.odds, told), {
    board: [...board],
    decisive,
    stackBefore,
  });

  const hole = fullHole(told, step.seat);
  const holding = hole === null ? "" : heldBy(hole, [...board]);

  walk.bets.set(step.seat, step.to);

  if (stackBefore !== null) {
    walk.stacks.set(step.seat, Math.max(0, stackBefore - step.added));
  }

  const change = (show: Show) => {
    const draft = show.seat(step.seat);

    draft.bet = step.to;
    draft.loud = step.allIn || step.act !== "Call";
    draft.stack =
      draft.stack === null ? null : Math.max(0, draft.stack - step.added);
  };

  if (!told.loud.has(step) && !decisive) {
    quietly(walk, change);

    return;
  }

  flushFolds(walk, told);

  if (decisive) {
    add(walk, { firm: true, hold: PAUSE_MS, section: "Pause" }, (show) => {
      show.cut("CloseUp", step.seat);
      show.seat(step.seat).expression = "Thinking";
      show.draft.facing = facing;
      show.draft.caption = captionLines(
        holding.length > 0
          ? REPLAY_WORDS.pauseHero(facing, holding)
          : REPLAY_WORDS.lastCard
      );
      show.apply();
      show.push(1.08);
      show.mark("Pause");
    });
  }

  add(
    walk,
    {
      firm: decisive,
      hold: step.allIn || decisive ? 1200 : 950,
      section: decisive ? "Payoff" : "Build",
    },
    (show) => {
      show.cut("TwoShot");
      show.draft.facing = 0;
      change(show);

      if (step.act !== "Call") {
        for (const seat of [told.lead, told.other]) {
          if (seat !== null && seat !== step.seat && !show.seat(seat).folded) {
            show.seat(seat).expression = "Thinking";
          }
        }
      }

      show.seat(step.seat).expression = "Resting";
      show.draft.caption = captionLines(line);
      show.apply();
      show.cue(step.allIn ? "AllIn" : "Chips", 0, step.seat);

      if (decisive) {
        show.mark("Hit");
        show.shake(0.6);
      } else if (step.allIn) {
        show.punch();
      }
    }
  );
};

const foldedOut = (
  walk: Walk,
  told: Told,
  step: ActedStep,
  facts: ReplayFacts
) => {
  const facing = facingOf(walk, step.seat);
  const tanked = facts.tanked?.includes(step.seat) ?? false;
  const hole = fullHole(told, told.lead);
  const [board = []] = walk.boards;
  const holding = hole === null ? "" : heldBy(hole, [...board]);

  const pot =
    walk.pot + [...walk.bets.values()].reduce((sum, bet) => sum + bet, 0);

  flushFolds(walk, told);
  add(walk, { firm: true, hold: PAUSE_MS + 200, section: "Pause" }, (show) => {
    show.cut("CloseUp", step.seat);
    show.seat(step.seat).expression = "Thinking";
    show.draft.facing = facing;
    show.draft.caption = captionLines(
      tanked
        ? REPLAY_WORDS.tank(nameOf(told, step.seat))
        : REPLAY_WORDS.pauseCall(
            nameOf(told, step.seat),
            nameOf(told, told.lead)
          )
    );
    show.apply();
    show.push(1.08);
    show.mark("Pause");
  });
  add(walk, { firm: true, hold: 1000, section: "Payoff" }, (show) => {
    const draft = show.seat(step.seat);

    draft.folded = true;
    draft.expression = "Folded";
    draft.bet = 0;
    show.draft.facing = 0;
    show.draft.caption = captionLines(
      REPLAY_WORDS.fold(nameOf(told, step.seat))
    );
    show.fly("close:hole:0", { x: -260, y: 120 });
    show.fly("close:hole:1", { x: -260, y: 120 });
    draft.cards = [];
    show.apply();
    show.cue("Fold", 0, step.seat);
  });
  add(walk, { firm: true, hold: HIT_MS, section: "Payoff" }, (show) => {
    show.cut("CloseUp", told.lead);
    show.seat(told.lead).expression = "Happy";
    show.draft.caption = captionLines(
      hole === null
        ? REPLAY_WORDS.takes(nameOf(told, told.lead), pot)
        : REPLAY_WORDS.nothing(startingHandName(hole), holding)
    );
    show.apply();
    show.mark("Hit");
    show.mark("Result", 650);
    show.shake(1);
  });
};

const acted = (walk: Walk, told: Told, step: ActedStep, facts: ReplayFacts) => {
  if (step.act === "Check") {
    return;
  }

  if (step.act !== "Fold") {
    wagered(walk, told, step);

    return;
  }

  if (told.decisive.kind === "Fold" && told.decisive.step === step) {
    foldedOut(walk, told, step, facts);
  } else {
    walk.folds = [...walk.folds, step.seat];
  }
};

const FIRST_SLOT = { Flop: 0, Preflop: 0, River: 4, Showdown: 4, Turn: 3 };

const cardHold = (street: StreetStep["street"], counted: boolean) => {
  if (street === "Flop") {
    return counted ? 820 : 300;
  }

  return counted ? 1150 : 760;
};

const cardLine = (
  told: Told,
  street: StreetStep,
  index: number,
  moved: { readonly after: Chances | null; readonly before: Chances | null }
) => {
  if (moved.after !== null && moved.before !== null && told.other !== null) {
    const lead = moved.after.lead - moved.before.lead;
    const other = moved.after.other - moved.before.other;

    if (lead >= CLIMB_POINTS && moved.after.lead < 100) {
      return REPLAY_WORDS.climbs(nameOf(told, told.lead), moved.after.lead);
    }

    if (other >= CLIMB_POINTS && moved.after.other < 100) {
      return REPLAY_WORDS.climbs(nameOf(told, told.other), moved.after.other);
    }

    return null;
  }

  return index === 0 &&
    (street.street === "Flop" ||
      street.street === "Turn" ||
      street.street === "River")
    ? REPLAY_WORDS.street(street.street)
    : null;
};

const swungCard = (
  walk: Walk,
  told: Told,
  swing: Swing,
  dealt: {
    readonly card: Card;
    readonly ends: boolean;
    readonly name: string;
    readonly record: number;
    readonly run: number;
  }
) => {
  const before = chancesOf(walk.odds, told);
  const after = chancesOf(swing.step, told);
  const outs = walk.odds?.outs.find((each) => each.seat === swing.gainer);
  const hole = fullHole(told, swing.gainer);
  const made = hole === null ? "" : madeBy(hole, swing.step.board);
  const victimPercent = percentOf(walk.odds ?? swing.step, swing.victim) ?? 0;

  add(walk, { firm: true, hold: PAUSE_MS, section: "Pause" }, (show) => {
    show.cut("CloseUp", swing.victim);
    show.draft.caption = captionLines(
      outs !== undefined && outs.cards.length > 0
        ? REPLAY_WORDS.pauseCards(nameOf(told, swing.victim), outs.cards.length)
        : REPLAY_WORDS.pauseStill(nameOf(told, swing.victim), victimPercent)
    );
    show.apply();
    show.push(1.08);
    show.mark("Pause");
  });
  add(walk, { firm: true, hold: BREATH_MS, section: "Payoff" }, (show) => {
    show.cut("Board");
    show.draft.odds = before;
    show.draft.caption = [];
    show.apply();
  });
  add(walk, { firm: true, hold: HIT_MS, section: "Payoff" }, (show) => {
    show.draft.boards[dealt.run - 1]?.push(cardText(dealt.card));
    show.draft.slammed = dealt.name;
    show.apply(-SLAM_MS);
    show.seen(dealt.record, -SLAM_MS);
    show.mark("Hit");

    if (dealt.ends) {
      show.mark("Result", 700);
    }

    show.shake(1);
    show.draft.odds = after;
    show.seat(swing.victim).expression = "Gutted";
    show.seat(swing.gainer).expression = "Happy";
    show.apply(260);
    show.cue("Bar", 260);
    show.draft.caption = captionLines(
      made.length > 0
        ? REPLAY_WORDS.hand(made)
        : REPLAY_WORDS.ahead(nameOf(told, swing.gainer))
    );
    show.apply(620);
  });
};

const beforeStreet = (walk: Walk, told: Told, street: StreetStep) => {
  const waiting = walk.odds;

  const outs =
    waiting !== null && waiting.run === street.run
      ? outsLine(told, waiting)
      : null;

  const needs =
    outs !== null && outs === walk.asked ? REPLAY_WORDS.lastCard : outs;

  walk.asked = outs ?? walk.asked;
  flushFolds(walk, told);

  if (walk.boards.length > 1 && !walk.announced.has(street.run)) {
    const before = chancesOf(walk.shared, told);

    walk.announced.add(street.run);
    walk.odds = walk.shared;
    add(walk, { hold: 800, section: "Build" }, (show) => {
      show.cut("Board");
      show.draft.odds = before;
      show.draft.caption = captionLines(REPLAY_WORDS.board(street.run));
      show.apply();
    });
  } else if (needs !== null) {
    add(walk, { hold: 1400, section: "Build" }, (show) => {
      show.cut("Board");
      show.draft.caption = captionLines(needs);
      show.apply();
    });
  }
};

const dealtStreet = (
  walk: Walk,
  told: Told,
  street: StreetStep,
  following: readonly OddsStep[],
  last: boolean
) => {
  const board = walk.boards[street.run - 1] ?? [];
  const first = FIRST_SLOT[street.street];

  const endsOnACard =
    told.decisive.kind === "Card" || told.decisive.kind === "None";

  beforeStreet(walk, told, street);

  for (const [index, card] of street.cards.entries()) {
    const counted = following[index] ?? null;
    const before = chancesOf(walk.odds, told);
    const after = chancesOf(counted, told);
    const name = `board:${street.run - 1}:${first + index}`;
    const ends = last && index === street.cards.length - 1;

    const swing =
      told.decisive.kind === "Card" && told.decisive.swing.step === counted
        ? told.decisive.swing
        : null;

    board.push(card);

    if (swing === null) {
      const line = cardLine(told, street, index, { after, before });

      add(
        walk,
        { hold: cardHold(street.street, after !== null), section: "Build" },
        (show) => {
          show.cut("Board");
          show.draft.boards[street.run - 1]?.push(cardText(card));
          show.draft.caption = line === null ? [] : captionLines(line);
          show.apply();
          show.seen(street.at, 0);
          show.cue("Card", 0);

          if (after !== null) {
            show.draft.odds = after;
            show.apply(240);
            show.cue("Bar", 240);
          }

          if (ends && endsOnACard) {
            show.mark("Result", 240);
          }
        }
      );
    } else {
      swungCard(walk, told, swing, {
        card,
        ends,
        name,
        record: street.at,
        run: street.run,
      });
    }

    walk.odds = counted ?? walk.odds;
  }

  if (walk.boards.length > 1 && board.length === FULL_BOARD) {
    const won = told.winners.get(street.run) ?? [];
    const [winner] = won;

    add(walk, { hold: 950, section: "Build" }, (show) => {
      show.draft.caption = captionLines(
        won.length === 1 && winner !== undefined
          ? REPLAY_WORDS.boardTo(street.run, nameOf(told, winner))
          : REPLAY_WORDS.boardSplit(street.run)
      );
      show.apply();
    });
  }
};

const awardLine = (
  told: Told,
  facts: ReplayFacts,
  awards: readonly AwardedStep[]
) => {
  const totals = new Map<SeatIndex, number>();

  for (const award of awards) {
    for (const share of award.shares) {
      totals.set(share.seat, (totals.get(share.seat) ?? 0) + share.amount);
    }
  }

  const [first, second] = [...totals.entries()].toSorted(
    ([, one], [, other]) => other - one
  );

  if (first === undefined) {
    return { line: REPLAY_WORDS.lastCard, totals };
  }

  if (second !== undefined) {
    return { line: REPLAY_WORDS.split(first[1]), totals };
  }

  return {
    line:
      facts.kind === "HeroCall" && first[0] === told.lead
        ? REPLAY_WORDS.right(nameOf(told, told.lead))
        : REPLAY_WORDS.takes(nameOf(told, first[0]), first[1]),
    totals,
  };
};

const FACE_CENTRES = { left: 236, right: 844, y: 458 };

const POT_CENTRE = { x: 540, y: 1222 };

const paidOut = (
  walk: Walk,
  told: Told,
  facts: ReplayFacts,
  awards: readonly AwardedStep[]
) => {
  const { line, totals } = awardLine(told, facts, awards);
  const pot = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  const winners = [...totals.keys()];
  const [winner] = winners;

  flushFolds(walk, told);
  add(walk, { firm: true, hold: PAYOFF_MS, section: "Payoff" }, (show) => {
    show.cut("TwoShot");
    show.draft.pot = pot;

    if (show.draft.boards.length > 1) {
      show.draft.odds = null;
    }

    for (const [seat, draft] of show.draft.seats) {
      draft.bet = 0;

      if (winners.includes(seat)) {
        draft.expression = "Happy";
      } else if (!draft.folded && (seat === told.lead || seat === told.other)) {
        draft.expression = "Gutted";
      }
    }

    show.draft.caption = captionLines(line);
    show.apply();
    show.mark("Result");

    if (winners.length === 1 && winner !== undefined) {
      const x = winner === told.lead ? FACE_CENTRES.left : FACE_CENTRES.right;

      show.fly("pot", {
        x:
          (winner === told.lead || winner === told.other ? x : 540) -
          POT_CENTRE.x,
        y: FACE_CENTRES.y - POT_CENTRE.y,
      });
      show.draft.pot = 0;
    }

    for (const [seat, amount] of totals) {
      const draft = show.seat(seat);

      draft.stack = draft.stack === null ? null : draft.stack + amount;
    }

    show.apply(460);
    show.cue("Chips", 300, winner);
  });
};

type BountyStep = StepOf<"Bounty">;

const BOUNTY_MS = 1900;

const bountyPaid = (walk: Walk, told: Told, bounty: BountyStep) => {
  const total = bounty.payers.reduce((sum, payer) => sum + payer.amount, 0);
  const [only] = bounty.payers;

  add(walk, { firm: true, hold: BOUNTY_MS, section: "Payoff" }, (show) => {
    show.cut("TwoShot");

    for (const payer of bounty.payers) {
      const draft = show.seat(payer.seat);

      draft.note = REPLAY_WORDS.bountyNote(-payer.amount);
      draft.loud = false;
      draft.stack =
        draft.stack === null ? null : Math.max(0, draft.stack - payer.amount);
    }

    const winner = show.seat(bounty.seat);

    winner.note = REPLAY_WORDS.bountyNote(total);
    winner.loud = true;
    winner.expression = "Happy";
    winner.stack = winner.stack === null ? null : winner.stack + total;
    show.draft.caption = captionLines(
      bounty.payers.length === 1 && only !== undefined
        ? REPLAY_WORDS.bountyFrom(
            nameOf(told, only.seat),
            nameOf(told, bounty.seat),
            total
          )
        : REPLAY_WORDS.bounty(nameOf(told, bounty.seat), total)
    );
    show.apply();
    show.cue("Chips", 0, bounty.seat);
    show.cue("Stamp", 0, bounty.seat);
  });
};

const BOMB_MS = 1200;

const bombCalled = (walk: Walk, ante: number) => {
  add(walk, { hold: BOMB_MS, section: "Build" }, (show) => {
    show.draft.caption = captionLines(REPLAY_WORDS.bombPot(ante));
    show.apply();
    show.cue("AllIn", 0);
  });
};

const openingOf = (replay: Replay, facts: ReplayFacts, told: Told): Walk => {
  const walk: Walk = {
    announced: new Set(),
    asked: "",
    beats: [],
    bets: new Map(),
    boards: [[]],
    folds: [],
    odds: null,
    pot: 0,
    shared: null,
    stacks: new Map(
      facts.seats.flatMap((seat) =>
        seat.stack === null ? [] : [[seat.seat, seat.stack] as const]
      )
    ),
  };

  const posts = replay.steps.filter(ReplaySteps.$is("Posted"));

  for (const post of posts) {
    const stack = walk.stacks.get(post.seat);

    if (stack !== undefined) {
      walk.stacks.set(post.seat, Math.max(0, stack - post.amount));
    }

    if (post.post === "Ante" || post.post === "Dead") {
      walk.pot += post.amount;
    } else {
      walk.bets.set(post.seat, (walk.bets.get(post.seat) ?? 0) + post.amount);
    }
  }

  const dealt =
    replay.steps
      .filter(ReplaySteps.$is("Odds"))
      .find((step) => step.board.length === 0) ?? null;

  const opening = {
    bets: new Map(walk.bets),
    odds: chancesOf(dealt, told),
    pot: walk.pot,
    stacks: new Map(walk.stacks),
  };

  const line = hookOf(facts, told, dealt);

  walk.odds = dealt;
  add(walk, { firm: true, hold: HOOK_MS, section: "Hook" }, (show) => {
    for (const seat of replay.dealtIn) {
      show.draft.seats.set(seat, {
        bet: opening.bets.get(seat) ?? 0,
        cards: holeOf(told, seat),
        expression: "Resting",
        folded: false,
        loud: false,
        note: "",
        stack: opening.stacks.get(seat) ?? null,
      });
    }

    show.draft.pot = opening.pot;
    show.draft.odds = opening.odds;
    show.draft.caption = captionLines(line);
    show.cut("TwoShot");
    show.apply();
    show.push(1.035);
  });

  if (replay.bombAnte !== null) {
    bombCalled(walk, replay.bombAnte);
  }

  return walk;
};

const gathered = (walk: Walk, pot: number) => {
  walk.bets.clear();
  walk.pot = pot;
  quietly(walk, (show) => {
    for (const draft of show.draft.seats.values()) {
      draft.bet = 0;
      draft.loud = false;
    }

    show.draft.pot = pot;
  });
};

const returned = (walk: Walk, step: StepOf<"Returned">) => {
  walk.bets.set(
    step.seat,
    Math.max(0, (walk.bets.get(step.seat) ?? 0) - step.amount)
  );
  walk.stacks.set(step.seat, (walk.stacks.get(step.seat) ?? 0) + step.amount);
  quietly(walk, (show) => {
    const draft = show.seat(step.seat);

    draft.bet = Math.max(0, draft.bet - step.amount);
    draft.stack = draft.stack === null ? null : draft.stack + step.amount;
  });
};

const ranTwice = (walk: Walk, told: Told, runs: number) => {
  const [shared = []] = walk.boards;

  walk.shared = walk.odds;

  for (let run = walk.boards.length; run < runs; run += 1) {
    walk.boards.push([...shared]);
  }

  if (runs < 2) {
    return;
  }

  flushFolds(walk, told);
  add(walk, { hold: 1000, section: "Build" }, (show) => {
    const [board = []] = show.draft.boards;

    show.cut("TwoShot");
    show.draft.boards = Array.from({ length: runs }, () => [...board]);
    show.draft.caption = captionLines(REPLAY_WORDS.runs(runs));
    show.apply();
  });
};

const beatsOf = (replay: Replay, facts: ReplayFacts, told: Told) => {
  const walk = openingOf(replay, facts, told);
  const awards: AwardedStep[] = [];
  const bounties: BountyStep[] = [];
  const counted = new Set<OddsStep>();
  const streets = replay.steps.filter(ReplaySteps.$is("StreetDealt"));

  for (const [index, step] of replay.steps.entries()) {
    ReplaySteps.$match(step, {
      Acted: (each) => {
        acted(walk, told, each, facts);
      },
      Awarded: (each) => {
        awards.push(each);
      },
      Bounty: (each) => {
        bounties.push(each);
      },
      Dealt: () => 0,
      Gathered: ({ pot }) => {
        gathered(walk, pot);
      },
      Mucked: ({ seat }) => {
        quietly(walk, (show) => {
          if (!told.tabled.has(seat)) {
            show.seat(seat).cards = [];
          }
        });
      },
      Odds: (each) => {
        if (!counted.has(each)) {
          walk.odds = each;
          quietly(walk, (show) => {
            show.draft.odds = chancesOf(each, told);
          });
        }
      },
      Posted: () => 0,
      Returned: (each) => {
        returned(walk, each);
      },
      Runs: ({ runs }) => {
        ranTwice(walk, told, runs);
      },
      Shown: () => 0,
      StreetDealt: (each) => {
        const following: OddsStep[] = [];

        for (const next of replay.steps.slice(index + 1)) {
          if (!ReplaySteps.$is("Odds")(next) || next.at !== each.at) {
            break;
          }

          following.push(next);
          counted.add(next);
        }

        dealtStreet(walk, told, each, following, each === streets.at(-1));
      },
    });
  }

  paidOut(walk, told, facts, awards);

  for (const bounty of bounties) {
    bountyPaid(walk, told, bounty);
  }

  return walk.beats;
};

const pacedOf = (beats: readonly Beat[]) => {
  const firm = beats
    .filter((beat) => beat.firm)
    .reduce((total, beat) => total + beat.hold, 0);

  const loose = Math.max(
    1,
    beats
      .filter((beat) => !beat.firm)
      .reduce((total, beat) => total + beat.hold, 0)
  );

  const natural = firm + loose + TAG_MS;

  if (natural > LONGEST_MS) {
    return Math.max(TIGHTEST, (LONGEST_MS - TAG_MS - firm) / loose);
  }

  return natural < SHORTEST_MS
    ? Math.min(LOOSEST, (SHORTEST_MS - TAG_MS - firm) / loose)
    : 1;
};

const OUTCOMES: Readonly<Record<Family, Outcome>> = {
  Celebration: "Win",
  Groan: "Loss",
  Relief: "Split",
  Reveal: "Win",
};

export const outcomeOf = (kind: MomentKind): Outcome =>
  OUTCOMES[FAMILIES[kind]];

export const BEAT_GRID_MS = 100;

const LAYERS: Readonly<Record<ReplaySprite["art"]["kind"], number>> = {
  Bar: 0,
  Caption: 5,
  Card: 2,
  Face: 1,
  Label: 3,
  Pill: 4,
};

const SHAKES = [16, -13, 9, -6, 3, 0];

const SHAKE_STEP = 34;

const PUNCH = 1.045;

export const replayPlan = (replay: Replay, facts: ReplayFacts): ReplayPlan => {
  const told = toldOf(replay, facts);
  const beats = beatsOf(replay, facts, told);
  const pace = pacedOf(beats);
  const stager = stagerOf();
  const camera: Key[] = [{ at: 0, pose: REST }];
  const cues: SmallCue[] = [];
  const marks = new Map<Mark, number>();
  const sections: { at: number; name: Section }[] = [];
  const planned: PlannedBeat[] = [];
  const timeline: { at: number; ms: number }[] = [];

  const draft: Draft = {
    boards: [[]],
    caption: [],
    facing: 0,
    focus: told.lead,
    odds: null,
    pot: 0,
    seats: new Map(),
    shot: "TwoShot",
    slammed: "",
  };

  const clock = { at: 0, cutting: true };

  const rested = (when: number) => {
    const last = camera.at(-1);

    if (last !== undefined && last.pose.scale !== 1) {
      camera.push({ at: Math.max(last.at, when - 1), pose: last.pose });
    }

    camera.push({ at: when, pose: REST });
  };

  for (const beat of beats) {
    const start = clock.at;

    const hold =
      Math.round((beat.hold * (beat.firm ? 1 : pace)) / BEAT_GRID_MS) *
      BEAT_GRID_MS;

    if (hold > 0 && sections.at(-1)?.name !== beat.section) {
      sections.push({ at: start, name: beat.section });
    }

    if (hold > 0) {
      planned.push({ at: start, hold, section: beat.section });
    }

    beat.play({
      apply: (offset = 0) => {
        staged(
          stager,
          layoutOf(draft, told.cast),
          start + offset,
          clock.cutting
        );
        clock.cutting = false;
      },
      cue: (kind, offset, seat) => {
        const pan =
          (seat === told.lead && -0.4) || (seat === told.other && 0.4) || 0;

        cues.push({ atMs: start + offset, kind, pan });
      },
      cut: (shot, focus) => {
        if (
          draft.shot !== shot ||
          (focus !== undefined && draft.focus !== focus)
        ) {
          clock.cutting = true;
          rested(start);
        }

        draft.shot = shot;
        draft.focus = focus ?? draft.focus;
      },
      draft,
      fly: (name, by) => {
        sent(stager, name, { at: start, by, ms: 420 });
      },
      mark: (what, offset = 0) => {
        if (!marks.has(what)) {
          marks.set(what, start + offset);
        }
      },
      punch: () => {
        camera.push(
          { at: start, pose: { ...REST, scale: PUNCH } },
          { at: start + 280, pose: REST }
        );
      },
      push: (to) => {
        rested(start);
        camera.push({ at: start + hold - 1, pose: { ...REST, scale: to } });
      },
      seat: (seat) => {
        const found = draft.seats.get(seat) ?? {
          bet: 0,
          cards: [],
          expression: "Resting",
          folded: false,
          loud: false,
          note: "",
          stack: null,
        };

        draft.seats.set(seat, found);

        return found;
      },
      seen: (record, offset) => {
        timeline.push({ at: record, ms: start + offset });
      },
      shake: (strength) => {
        rested(start);
        camera.push(
          ...SHAKES.map((dx, index) => ({
            at: start + (index + 1) * SHAKE_STEP,
            pose: {
              ...REST,
              dx: dx * strength,
              dy: (index % 2 === 0 ? -5 : 4) * strength * (dx === 0 ? 0 : 1),
            },
          }))
        );
      },
    });
    draft.slammed = "";
    clock.at += hold;
  }

  const cardAt = clock.at;

  cleared(stager, cardAt - 110, 110);
  rested(cardAt);
  sections.push({ at: cardAt, name: "Tag" });

  const hit = marks.get("Hit") ?? null;
  const pause = marks.get("Pause") ?? null;

  return {
    beats: [...planned, { at: cardAt, hold: TAG_MS, section: "Tag" }],
    camera: camera.toSorted((one, other) => one.at - other.at),
    cardAt,
    length: cardAt + TAG_MS,
    sections,
    sheet: {
      cues: cues.toSorted((one, other) => one.atMs - other.atMs),
      hitMs: pause === null ? null : hit,
      lengthMs: cardAt + TAG_MS,
      outcome: outcomeOf(facts.kind),
      pauseMs: hit === null ? null : pause,
      resultMs: Math.min(cardAt, marks.get("Result") ?? cardAt),
      seed: replay.handNumber,
      tagMs: cardAt,
    },
    sprites: stager.sprites.toSorted(
      (one, other) => LAYERS[one.art.kind] - LAYERS[other.art.kind]
    ),
    timeline,
  };
};
