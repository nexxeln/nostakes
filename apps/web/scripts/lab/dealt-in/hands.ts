import type { Expression } from "@nostakes/avatar";
import { Effect } from "effect";

import { BIG_BLIND, SMALL_BLIND, STARTING_STACK } from "./cast.js";
import type { FriendId, SeatId } from "./cast.js";
import type { Controls } from "./controls.js";
import { chipsText } from "./markup.js";
import type { Stage } from "./stage.js";

export interface EndingFace {
  readonly cards: readonly string[];
  readonly expression: Expression;
  readonly who: SeatId;
  readonly won: boolean;
}

export interface Ending {
  readonly also: string;
  readonly board: readonly string[];
  readonly faces: readonly EndingFace[];
  readonly family: "Celebration" | "Groan" | "Reveal";
  readonly kind: "Bluff" | "Cooler" | "SevenDeuce";
  readonly lifted: readonly string[];
  readonly line: string;
  readonly painful: boolean;
  readonly pot: number;
  readonly tier: 1 | 2 | 3;
  readonly title: string;
  readonly transfers: readonly {
    readonly amount: number;
    readonly from: FriendId;
  }[];
}

export type Outcome = Ending | "Folded";

export interface Table {
  readonly controls: Controls;
  readonly firstHand: boolean;
  readonly stage: Stage;
}

type Hole = readonly [string, string];

type Flop = readonly [string, string, string];

interface Opening {
  readonly hole: Hole;
  readonly hostLine: string;
  readonly named: readonly [string, string];
}

const OPEN = 80;

const BOUNTY = 50;

const ACT_MS = 5200;

const SHOVE = STARTING_STACK - OPEN;

const FRIENDS_IN_ORDER: readonly FriendId[] = [
  "priya",
  "bo",
  "mara",
  "jonas",
  "kit",
];

const together = { concurrency: "unbounded" } as const;

const opening = (table: Table, { hole, hostLine, named }: Opening) =>
  Effect.gen(function* openTheHand() {
    const { controls, stage } = table;
    const { pace } = stage;

    controls.holding(...named);
    stage.seal.classList.add("on");
    yield* stage.deal(hole);
    yield* Effect.all(
      [
        stage.post("priya", SMALL_BLIND, "SB"),
        stage.post("bo", BIG_BLIND, "BB"),
      ],
      together
    );
    controls.tell("Hold your cards to peek");
    stage.hand.classList.add("beckon");
    yield* pace.wait(table.firstHand ? 1900 : 1200);
    stage.seal.classList.remove("on");
    yield* controls.showPeek;
    yield* stage.fold("mara");
    stage.express("jonas", "Thinking");
    yield* pace.wait(500);
    stage.express("jonas", "Resting");
    yield* stage.post("jonas", OPEN);
    stage.act("jonas", `Raise ${OPEN}`, "hot");
    yield* stage.say("jonas", "Raise.", 1200);
    yield* stage.say("kit", "3 a.m. in Lisbon. Fold.", 1900);
    yield* stage.fold("kit");
    stage.speak("mara", hostLine, 3600);
    controls.tell("Tap the chip to call", "Or drag it up to raise.");

    return yield* controls.offer({
      auto: { kind: "call" },
      foldable: true,
      ms: ACT_MS,
      pot: 3 * OPEN,
      raise: { max: STARTING_STACK, min: 2 * OPEN },
      toCall: OPEN,
    });
  });

const raised = (stage: Stage, to: number) =>
  Effect.gen(function* raiseIt() {
    yield* stage.post("you", to);
    stage.act(
      "you",
      to === STARTING_STACK ? "All in" : `Raise ${chipsText(to)}`,
      "hot"
    );
    yield* stage.pace.wait(500);
    yield* stage.say("priya", "Fold. Again.", 1400);
    yield* stage.fold("priya");
  });

const called = (stage: Stage) =>
  Effect.gen(function* callIt() {
    yield* stage.post("you", OPEN);
    stage.act("you", `Call ${OPEN}`);
    yield* stage.say("priya", "Fold. Again.", 1400);
    yield* stage.fold("priya");
    yield* stage.post("bo", OPEN);
    stage.act("bo", `Call ${OPEN}`);
    yield* stage.say("bo", "I call.", 1200);
    yield* stage.collect;
  });

const callAllIn = (table: Table, amount: number) =>
  Effect.gen(function* callTheShove() {
    const { controls, stage } = table;

    controls.tell("Tap the chip to call");
    yield* controls.offer({
      auto: { kind: "call" },
      foldable: false,
      ms: 3400,
      pot: 0,
      raise: undefined,
      toCall: amount,
    });
    yield* stage.post("you", amount);
    stage.act("you", "Call", "hot");
  });

const shoveOnFlop = (table: Table, flop: Flop, boWords: string) =>
  Effect.gen(function* shoveTheFlop() {
    const { stage } = table;

    yield* stage.turnUp(flop);
    stage.act("bo", "Check", "quiet");
    yield* stage.think("jonas", 900);
    yield* stage.post("jonas", SHOVE);
    stage.act("jonas", "All in", "hot");
    yield* stage.say("jonas", "All in.", 1500);
    stage.express("jonas", "Resting");
    yield* callAllIn(table, SHOVE);
    yield* stage.say("bo", boWords, 1100);
    yield* stage.fold("bo");
    yield* stage.collect;
  });

const bounty = (stage: Stage) =>
  Effect.gen(function* collectBounty() {
    yield* stage.say("mara", `Bounty. ${BOUNTY} each, pay up.`, 2200);

    const [priya = 0, bo = 0, mara = 0, jonas = 0, kit = 0] = yield* Effect.all(
      FRIENDS_IN_ORDER.map((from) => stage.pay(from, "you", BOUNTY)),
      together
    );

    const total = priya + bo + mara + jonas + kit;

    stage.tab("you", `Bounty +${chipsText(total)}`);
    yield* stage.pace.wait(1400);
    yield* stage.say("bo", "Screenshot that.", 2000);

    return { bo, jonas, kit, mara, priya, total };
  });

const cheer = (stage: Stage) => {
  stage.express("you", "Happy");
  stage.express("jonas", "Gutted");
  stage.express("bo", "Happy");
  stage.express("kit", "Happy");
};

const stole = (table: Table, hole: Hole, to: number) =>
  Effect.gen(function* stealIt() {
    const { controls, stage } = table;

    yield* raised(stage, to);
    yield* stage.say("bo", "Not with these.", 1300);
    yield* stage.fold("bo");
    yield* stage.think("jonas", 2400);
    yield* stage.say("jonas", "You have aces. Fine.", 1700);
    yield* stage.fold("jonas");
    stage.giveBack("you", to - OPEN);
    yield* stage.collect;

    const pot = stage.potOf();

    yield* stage.award("you", pot);
    stage.hand.classList.add("open");
    controls.tell("Seven-deuce.", "The worst hand in poker.");
    cheer(stage);
    yield* stage.pace.wait(900);
    yield* stage.say("jonas", "Seven. Deuce.", 1600);

    const paid = yield* bounty(stage);

    const ending: Ending = {
      also: "Seven-deuce for You",
      board: [],
      faces: [{ cards: hole, expression: "Happy", who: "you", won: true }],
      family: "Reveal",
      kind: "Bluff",
      lifted: [...hole],
      line: `${chipsText(to)} on seven-two. Nobody called.`,
      painful: false,
      pot,
      tier: 2,
      title: "Stone-cold bluff",
      transfers: [
        { amount: OPEN + paid.jonas, from: "jonas" },
        { amount: BIG_BLIND + paid.bo, from: "bo" },
        { amount: SMALL_BLIND + paid.priya, from: "priya" },
        { amount: paid.mara, from: "mara" },
        { amount: paid.kit, from: "kit" },
      ],
    };

    return ending;
  });

const SEVEN_DEUCE_FLOP: Flop = ["Ks", "7h", "2s"];

const flopped = (table: Table, hole: Hole) =>
  Effect.gen(function* flopTwoPair() {
    const { controls, stage } = table;
    const { pace } = stage;

    yield* called(stage);
    controls.holding("Two pair.", "Sevens and twos.");
    yield* shoveOnFlop(table, SEVEN_DEUCE_FLOP, "Nope.");
    stage.reveal("jonas", ["As", "Kd"]);
    stage.act("jonas", "Pair of kings");
    yield* stage.say("jonas", "Top pair. Pay me.", 1700);
    stage.hand.classList.add("open");
    stage.act("you", "Sevens and twos", "hot");
    controls.tell("Seven-deuce.", "The worst hand in poker.");
    stage.express("jonas", "Gutted");
    yield* pace.wait(1100);
    yield* stage.turnUp(["9d"]);
    yield* pace.wait(500);
    yield* stage.turnUp(["3c"]);
    stage.lift(["7h", "2s", "Ks"]);

    const pot = stage.potOf();

    yield* stage.award("you", pot);
    cheer(stage);
    yield* stage.say("jonas", "With seven-deuce.", 1700);

    const paid = yield* bounty(stage);

    const ending: Ending = {
      also: "",
      board: [...SEVEN_DEUCE_FLOP, "9d", "3c"],
      faces: [{ cards: hole, expression: "Happy", who: "you", won: true }],
      family: "Celebration",
      kind: "SevenDeuce",
      lifted: ["7d", "2c", "7h", "2s", "Ks"],
      line: `You won with the worst hand in poker. The table paid ${chipsText(paid.total)}.`,
      painful: false,
      pot,
      tier: 1,
      title: "Seven-deuce",
      transfers: [
        { amount: STARTING_STACK + paid.jonas, from: "jonas" },
        { amount: OPEN + paid.bo, from: "bo" },
        { amount: SMALL_BLIND + paid.priya, from: "priya" },
        { amount: paid.mara, from: "mara" },
        { amount: paid.kit, from: "kit" },
      ],
    };

    return ending;
  });

const folded = (stage: Stage, who: FriendId, words: string) =>
  Effect.gen(function* foldIt() {
    stage.hand.classList.add("thrown");
    stage.express("you", "Folded");
    yield* stage.say(who, words, 1900);
    yield* stage.pace.wait(1100);

    const outcome: Outcome = "Folded";

    return outcome;
  });

export const sevenDeuce = (table: Table): Effect.Effect<Outcome> =>
  Effect.gen(function* playSevenDeuce() {
    const hole: Hole = ["7d", "2c"];

    const choice = yield* opening(table, {
      hole,
      hostLine: "Host's rule tonight: seven-deuce bounty.",
      named: ["Seven-deuce.", "The worst hand in poker."],
    });

    if (choice.kind === "fold") {
      return yield* folded(table.stage, "priya", "Sensible. Boring.");
    }

    return choice.kind === "raise"
      ? yield* stole(table, hole, choice.to)
      : yield* flopped(table, hole);
  });

const ACES_FLOP: Flop = ["Kh", "8c", "3d"];

const acesAllIn = (table: Table, to: number) =>
  Effect.gen(function* getItInBeforeTheFlop() {
    const { stage } = table;

    yield* raised(stage, to);
    yield* stage.say("bo", "Too rich.", 1100);
    yield* stage.fold("bo");
    yield* stage.think("jonas", 700);
    yield* stage.post("jonas", STARTING_STACK);
    stage.act("jonas", "All in", "hot");
    yield* stage.say("jonas", "All in.", 1500);
    stage.express("jonas", "Resting");

    if (to < STARTING_STACK) {
      yield* callAllIn(table, STARTING_STACK);
    }

    yield* stage.collect;
  });

const acesRunOut = (table: Table, flopIsOut: boolean) =>
  Effect.gen(function* runItOut() {
    const { controls, stage } = table;
    const { pace } = stage;

    stage.reveal("jonas", ["Ks", "Kc"]);
    stage.hand.classList.add("open");
    controls.tell("Aces.", "Against kings.");
    yield* stage.say("jonas", "Kings. Sorry.", 1500);

    if (!flopIsOut) {
      yield* stage.turnUp(ACES_FLOP);
    }

    stage.act("jonas", "Three kings", "hot");
    stage.express("jonas", "Happy");
    stage.express("you", "Gutted");
    yield* stage.say("kit", "Oh no.", 1300);
    yield* pace.wait(700);
    yield* stage.turnUp(["5s"]);
    yield* pace.wait(900);
    yield* stage.turnUp(["Ad"]);
    stage.lift(["Ad", "Kh", "8c"]);
    stage.act("you", "Three aces", "hot");
    cheer(stage);
  });

export const aces = (table: Table): Effect.Effect<Outcome> =>
  Effect.gen(function* playAces() {
    const { stage } = table;
    const hole: Hole = ["As", "Ah"];

    const choice = yield* opening(table, {
      hole,
      hostLine: "Antes, straddles, run it twice. Host decides.",
      named: ["Aces.", "Try to look bored."],
    });

    if (choice.kind === "fold") {
      return yield* folded(stage, "bo", "You folded what.");
    }

    if (choice.kind === "raise") {
      yield* acesAllIn(table, choice.to);
    } else {
      yield* called(stage);
      yield* shoveOnFlop(table, ACES_FLOP, "Too rich.");
    }

    yield* acesRunOut(table, choice.kind === "call");

    const pot = stage.potOf();

    yield* stage.award("you", pot);
    yield* stage.say("jonas", "Of course.", 1500);
    yield* stage.say("kit", "I stayed up for this.", 2000);
    yield* stage.pace.wait(600);

    const ending: Ending = {
      also: "",
      board: [...ACES_FLOP, "5s", "Ad"],
      faces: [
        { cards: ["Ks", "Kc"], expression: "Gutted", who: "jonas", won: false },
        { cards: hole, expression: "Happy", who: "you", won: true },
      ],
      family: "Groan",
      kind: "Cooler",
      lifted: ["As", "Ah", "Ad", "Kh", "8c"],
      line: "Three kings, and still second best.",
      painful: true,
      pot,
      tier: 3,
      title: "Ice cold",
      transfers: [
        { amount: STARTING_STACK, from: "jonas" },
        { amount: choice.kind === "raise" ? BIG_BLIND : OPEN, from: "bo" },
        { amount: SMALL_BLIND, from: "priya" },
      ],
    };

    return ending;
  });
