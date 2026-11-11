import { Option, Schema } from "effect";

import type { SettingsDraft } from "./model.js";

export const RuleGroupSchema = Schema.Literals([
  "Table",
  "Blinds",
  "Clock",
  "Straddles",
  "AllIn",
  "Showdown",
  "BetweenHands",
  "Fairness",
  "Away",
  "Other",
]);

export type RuleGroup = typeof RuleGroupSchema.Type;

export const GROUP_TITLES: Readonly<Record<RuleGroup, string>> = {
  AllIn: "All in",
  Away: "Away",
  BetweenHands: "Between hands",
  Blinds: "Blinds",
  Clock: "Clock",
  Fairness: "Fairness",
  Other: "Other",
  Showdown: "Showdown",
  Straddles: "Straddles",
  Table: "Table",
};

export const GROUP_ORDER: readonly RuleGroup[] = RuleGroupSchema.literals;

export type RuleControl =
  | { readonly kind: "Switch"; readonly off: string; readonly on: string }
  | {
      readonly kind: "Segments";
      readonly labels: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "Stepper";
      readonly min: number;
      readonly start: number;
      readonly step: (draft: SettingsDraft) => number;
      readonly unit: string;
    };

export type CardPlace = "Headline" | "Always" | "WhenChanged";

export interface RuleCopy {
  readonly path: string;
  readonly group: RuleGroup;
  readonly label: string;
  readonly help: Option.Option<string>;
  readonly control: RuleControl;
  readonly relevant: (draft: SettingsDraft) => boolean;
  readonly brief: (draft: SettingsDraft) => Option.Option<string>;
  readonly card: CardPlace;
}

interface RuleExtras {
  readonly help?: string;
  readonly relevant?: (draft: SettingsDraft) => boolean;
  readonly brief?: (draft: SettingsDraft) => Option.Option<string>;
  readonly card?: CardPlace;
}

const toggle = (on = "true", off = "false"): RuleControl => ({
  kind: "Switch",
  off,
  on,
});

const segments = (labels: Readonly<Record<string, string>>): RuleControl => ({
  kind: "Segments",
  labels,
});

const stepper = (
  unit: string,
  min: number,
  step: (draft: SettingsDraft) => number,
  start = min
): RuleControl => ({
  kind: "Stepper",
  min,
  start,
  step,
  unit,
});

const by = (amount: number) => () => amount;

const rule = (
  path: string,
  group: RuleGroup,
  label: string,
  control: RuleControl,
  extras: RuleExtras = {}
): RuleCopy => ({
  brief: extras.brief ?? (() => Option.none()),
  card: extras.card ?? "WhenChanged",
  control,
  group,
  help: Option.fromNullishOr(extras.help),
  label,
  path,
  relevant: extras.relevant ?? (() => true),
});

const numberAt = (draft: SettingsDraft, path: string) => {
  const value = Number(draft[path] ?? "");

  return Number.isFinite(value) ? value : 0;
};

const SECONDS_IN_A_MINUTE = 60;

export const durationText = (seconds: number) =>
  seconds >= SECONDS_IN_A_MINUTE && seconds % SECONDS_IN_A_MINUTE === 0
    ? `${seconds / SECONDS_IN_A_MINUTE} min`
    : `${seconds} s`;

const said = (text: string) => Option.some(text);

const when = (holds: boolean, text: () => string) =>
  holds ? Option.some(text()) : Option.none();

const is = (path: string, value: string) => (draft: SettingsDraft) =>
  draft[path] === value;

const clockRuns = (draft: SettingsDraft) => numberAt(draft, "turnSeconds") > 0;

const runsMoreThanOnce = (draft: SettingsDraft) =>
  numberAt(draft, "table.maxRuns") > 1;

const bigBlindOf = (draft: SettingsDraft) =>
  Math.max(1, numberAt(draft, "table.bigBlind"));

const BUY_IN_STEP_IN_BIG_BLINDS = 10;

const buyInStep = (draft: SettingsDraft) =>
  bigBlindOf(draft) * BUY_IN_STEP_IN_BIG_BLINDS;

const straddleBrief = (draft: SettingsDraft) => {
  const count = numberAt(draft, "table.straddle.underTheGun");

  if (count === 0) {
    return Option.none();
  }

  return said(count === 1 ? "straddle UTG" : `${count} straddles`);
};

export const RULES: readonly RuleCopy[] = [
  rule("buyIn.min", "Table", "Smallest buy-in", stepper("", 1, buyInStep)),
  rule("buyIn.max", "Table", "Largest buy-in", stepper("", 1, buyInStep), {
    brief: (draft) => said(`${draft["buyIn.min"]}–${draft["buyIn.max"]}`),
    card: "Headline",
  }),
  rule("seats", "Table", "Seats", stepper("", 2, by(1)), {
    brief: (draft) => said(`${draft.seats} seats`),
    card: "Headline",
  }),
  rule("locked", "Table", "Lock the room", toggle(), {
    brief: (draft) => when(draft.locked === "true", () => "room locked"),
    help: "Nobody new can join, while people already in come and go.",
  }),
  rule("approval.seats", "Table", "Approve seats", toggle(), {
    brief: (draft) =>
      when(draft["approval.seats"] === "true", () => "host seats players"),
  }),
  rule("approval.chips", "Table", "Approve chips", toggle(), {
    brief: (draft) =>
      when(draft["approval.chips"] === "true", () => "host approves chips"),
  }),
  rule(
    "topUps",
    "Table",
    "Top up",
    segments({ BelowMin: "Below min", UpToMax: "Any time", WhenBust: "Bust" }),
    {
      brief: (draft) =>
        when(draft.topUps !== "UpToMax", () =>
          draft.topUps === "WhenBust" ? "top up when bust" : "top up below min"
        ),
      help: "Never past the largest buy-in.",
    }
  ),
  rule("table.smallBlind", "Blinds", "Small blind", stepper("", 1, by(1))),
  rule("table.bigBlind", "Blinds", "Big blind", stepper("", 1, by(1)), {
    brief: (draft) =>
      said(`${draft["table.smallBlind"]}/${draft["table.bigBlind"]}`),
    card: "Headline",
  }),
  rule(
    "table.ante._tag",
    "Blinds",
    "Ante",
    segments({
      BigBlindPays: "Big blind",
      EveryPlayer: "Everyone",
      NoAnte: "None",
    }),
    {
      brief: (draft) =>
        when(draft["table.ante._tag"] !== "NoAnte", () =>
          draft["table.ante._tag"] === "BigBlindPays"
            ? `BB ante ${draft["table.ante.amount"]}`
            : `ante ${draft["table.ante.amount"]}`
        ),
      card: "Headline",
    }
  ),
  rule("table.ante.amount", "Blinds", "Ante size", stepper("", 1, by(1))),
  rule(
    "table.blindPosting",
    "Blinds",
    "New players",
    segments({ Casino: "Post", HomeGame: "Deal in" }),
    {
      brief: (draft) =>
        when(draft["table.blindPosting"] === "Casino", () => "post to come in"),
      help: "Post: post a big blind or wait, and pay missed blinds.",
    }
  ),
  rule("turnSeconds", "Clock", "Turn", stepper("s", 0, by(5)), {
    brief: (draft) =>
      said(
        clockRuns(draft)
          ? `${durationText(numberAt(draft, "turnSeconds"))} clock`
          : "no clock"
      ),
    card: "Always",
    help: "0 turns the clock off.",
  }),
  rule("timeBankSeconds", "Clock", "Time bank", stepper("s", 0, by(15)), {
    brief: (draft) =>
      said(`bank ${durationText(numberAt(draft, "timeBankSeconds"))}`),
    help: "Extra time once the turn clock runs out.",
    relevant: clockRuns,
  }),
  rule(
    "timeBankRefill._tag",
    "Clock",
    "Bank refills",
    toggle("Refill", "NoRefill"),
    {
      brief: (draft) =>
        when(
          draft["timeBankRefill._tag"] === "Refill",
          () =>
            `bank +${durationText(numberAt(draft, "timeBankRefill.seconds"))}`
        ),
      relevant: clockRuns,
    }
  ),
  rule(
    "timeBankRefill.everyHands",
    "Clock",
    "Refill every",
    stepper("hands", 1, by(1), 10)
  ),
  rule(
    "timeBankRefill.seconds",
    "Clock",
    "Refill adds",
    stepper("s", 1, by(5), 10)
  ),
  rule(
    "timeBankRefill.upTo",
    "Clock",
    "Bank up to",
    stepper("s", 1, by(15), 60)
  ),
  rule(
    "table.straddle.underTheGun",
    "Straddles",
    "UTG straddles",
    stepper("", 0, by(1)),
    {
      brief: straddleBrief,
      help: "How many players in a row after the big blind may straddle.",
    }
  ),
  rule("table.straddle.button", "Straddles", "Button straddle", toggle(), {
    brief: (draft) =>
      when(draft["table.straddle.button"] === "true", () => "button straddle"),
  }),
  rule(
    "table.straddleSize",
    "Straddles",
    "Each straddle",
    segments({ Doubling: "Doubles", TwoBigBlinds: "2 BB" }),
    {
      brief: (draft) =>
        when(
          draft["table.straddleSize"] === "TwoBigBlinds",
          () => "straddles 2 BB"
        ),
      help: "Doubles: 2, 4, then 8 big blinds.",
      relevant: (draft) => numberAt(draft, "table.straddle.underTheGun") > 1,
    }
  ),
  rule("table.maxRuns", "AllIn", "Run it up to", stepper("×", 1, by(1)), {
    brief: (draft) =>
      when(runsMoreThanOnce(draft), () =>
        draft["table.runCount"] === "Fixed"
          ? `run it ${draft["table.maxRuns"]} times`
          : `run it up to ${draft["table.maxRuns"]}`
      ),
  }),
  rule(
    "table.runCount",
    "AllIn",
    "Runs",
    segments({ Fixed: "Always most", Vote: "Vote" }),
    {
      help: "Vote: everyone all in picks, and the fewest wins.",
      relevant: runsMoreThanOnce,
    }
  ),
  rule("runChoiceSeconds", "AllIn", "Vote clock", stepper("s", 1, by(5)), {
    relevant: (draft) =>
      runsMoreThanOnce(draft) && draft["table.runCount"] === "Vote",
  }),
  rule(
    "table.allInHands",
    "AllIn",
    "Hands",
    segments({ FaceUp: "Face up", Hidden: "Hidden" }),
    {
      brief: (draft) =>
        when(
          draft["table.allInHands"] === "Hidden",
          () => "all-in hands hidden"
        ),
      help: "Face up turns every hand over before the board is run.",
    }
  ),
  rule(
    "table.showdown",
    "Showdown",
    "Showdown",
    segments({ Automatic: "Auto", Interactive: "Show or muck" }),
    {
      brief: (draft) =>
        when(draft["table.showdown"] === "Automatic", () => "auto showdown"),
      help: "Auto shows every hand that can win.",
    }
  ),
  rule(
    "table.showdownOrder",
    "Showdown",
    "Shows first",
    segments({ LastAggressor: "Last bettor", RiverAggressor: "River bettor" }),
    {
      brief: (draft) =>
        when(
          draft["table.showdownOrder"] === "LastAggressor",
          () => "last bettor shows first"
        ),
      help: "The last to bet on the river, or on any street.",
    }
  ),
  rule("showdownSeconds", "Showdown", "Show clock", stepper("s", 1, by(5)), {
    relevant: is("table.showdown", "Interactive"),
  }),
  rule(
    "table.voluntaryShows",
    "Showdown",
    "Show one card",
    toggle("EitherCard", "BothCards"),
    {
      brief: (draft) =>
        when(
          draft["table.voluntaryShows"] === "BothCards",
          () => "show both or none"
        ),
      help: "After a hand, a player may show just one card.",
    }
  ),
  rule("table.rabbitHunt", "Showdown", "Rabbit hunt", toggle(), {
    brief: (draft) =>
      when(draft["table.rabbitHunt"] === "true", () => "rabbit hunt"),
  }),
  rule(
    "table.rabbitHunters",
    "Showdown",
    "Who hunts",
    segments({ DealtIn: "Anyone dealt in", StillIn: "Still in" }),
    {
      brief: (draft) =>
        when(
          draft["table.rabbitHunters"] === "StillIn",
          () => "hunt if still in"
        ),
      relevant: is("table.rabbitHunt", "true"),
    }
  ),
  rule(
    "moments",
    "BetweenHands",
    "Table moments",
    segments({ All: "All", Off: "Off", SkipPainful: "No bad beats" }),
    {
      brief: (draft) =>
        draft.moments === "Off"
          ? said("no moments")
          : when(draft.moments === "SkipPainful", () => "no bad-beat calls"),
      help: "Calls out big hands, bluffs, and bad beats after a hand.",
    }
  ),
  rule("betweenHandsSeconds", "BetweenHands", "Pause", stepper("s", 0, by(1)), {
    brief: (draft) =>
      said(`${durationText(numberAt(draft, "betweenHandsSeconds"))} between`),
  }),
  rule(
    "dealing",
    "BetweenHands",
    "Deals",
    segments({ Automatic: "Auto", Host: "Host" }),
    {
      brief: (draft) => when(draft.dealing === "Host", () => "host deals"),
      help: "Host: the host deals each hand from the menu.",
    }
  ),
  rule("shuffle", "Fairness", "Checked deck", toggle("Checked", "Plain"), {
    brief: (draft) => when(draft.shuffle === "Plain", () => "unchecked deck"),
    help: "Every device checks each card it sees against a sealed deck.",
  }),
  rule("peeking", "Fairness", "Show peeks", toggle(), {
    brief: (draft) => when(draft.peeking === "false", () => "peeks hidden"),
    help: "Faces look down while a player checks their cards.",
  }),
  rule(
    "pauseWhenAwaySeconds",
    "Away",
    "Pause when all away",
    stepper("s", 0, by(30)),
    {
      brief: (draft) =>
        said(
          `pause after ${durationText(numberAt(draft, "pauseWhenAwaySeconds"))} away`
        ),
      help: "Stop dealing once no seated player is connected.",
    }
  ),
  rule(
    "sitOutAfterTimeouts",
    "Away",
    "Sit out after",
    stepper("timeouts", 0, by(1)),
    {
      brief: (draft) =>
        said(`sit out after ${draft.sitOutAfterTimeouts} timeouts`),
      help: "0 keeps them dealt in.",
      relevant: clockRuns,
    }
  ),
  rule(
    "leavingMidHand",
    "Away",
    "Leaving mid-hand",
    segments({ ActedFor: "Fold for them", PlaysOn: "Plays on" }),
    {
      brief: (draft) =>
        when(draft.leavingMidHand === "PlaysOn", () => "leavers play on"),
      help: "Check or fold for them, or let them finish the hand.",
    }
  ),
];

export const PresetSchema = Schema.Literals([
  "Standard",
  "Home",
  "Casino",
  "Fast",
]);

export type Preset = typeof PresetSchema.Type;

export const PRESET_LABELS: Readonly<Record<Preset, string>> = {
  Casino: "Casino",
  Fast: "Fast",
  Home: "Home",
  Standard: "Standard",
};

const STYLE_PATHS = [
  "table.blindPosting",
  "turnSeconds",
  "timeBankSeconds",
  "timeBankRefill._tag",
  "table.straddle.underTheGun",
  "table.straddle.button",
  "table.straddleSize",
  "table.maxRuns",
  "table.runCount",
  "runChoiceSeconds",
  "table.allInHands",
  "table.showdown",
  "table.showdownOrder",
  "showdownSeconds",
  "table.voluntaryShows",
  "table.rabbitHunt",
  "table.rabbitHunters",
  "betweenHandsSeconds",
] as const;

type StylePath = (typeof STYLE_PATHS)[number];

const style = (values: Readonly<Record<StylePath, string>>) => values;

export const PRESETS: Readonly<
  Record<Preset, Readonly<Record<StylePath, string>>>
> = {
  Casino: style({
    betweenHandsSeconds: "3",
    runChoiceSeconds: "15",
    showdownSeconds: "15",
    "table.allInHands": "FaceUp",
    "table.blindPosting": "Casino",
    "table.maxRuns": "1",
    "table.rabbitHunt": "false",
    "table.rabbitHunters": "DealtIn",
    "table.runCount": "Vote",
    "table.showdown": "Interactive",
    "table.showdownOrder": "RiverAggressor",
    "table.straddle.button": "false",
    "table.straddle.underTheGun": "1",
    "table.straddleSize": "Doubling",
    "table.voluntaryShows": "BothCards",
    "timeBankRefill._tag": "NoRefill",
    timeBankSeconds: "60",
    turnSeconds: "30",
  }),
  Fast: style({
    betweenHandsSeconds: "2",
    runChoiceSeconds: "10",
    showdownSeconds: "10",
    "table.allInHands": "FaceUp",
    "table.blindPosting": "HomeGame",
    "table.maxRuns": "2",
    "table.rabbitHunt": "false",
    "table.rabbitHunters": "DealtIn",
    "table.runCount": "Fixed",
    "table.showdown": "Automatic",
    "table.showdownOrder": "RiverAggressor",
    "table.straddle.button": "false",
    "table.straddle.underTheGun": "0",
    "table.straddleSize": "Doubling",
    "table.voluntaryShows": "EitherCard",
    "timeBankRefill._tag": "NoRefill",
    timeBankSeconds: "30",
    turnSeconds: "15",
  }),
  Home: style({
    betweenHandsSeconds: "6",
    runChoiceSeconds: "15",
    showdownSeconds: "15",
    "table.allInHands": "FaceUp",
    "table.blindPosting": "HomeGame",
    "table.maxRuns": "3",
    "table.rabbitHunt": "true",
    "table.rabbitHunters": "DealtIn",
    "table.runCount": "Vote",
    "table.showdown": "Automatic",
    "table.showdownOrder": "RiverAggressor",
    "table.straddle.button": "true",
    "table.straddle.underTheGun": "1",
    "table.straddleSize": "Doubling",
    "table.voluntaryShows": "EitherCard",
    "timeBankRefill._tag": "NoRefill",
    timeBankSeconds: "90",
    turnSeconds: "45",
  }),
  Standard: style({
    betweenHandsSeconds: "5",
    runChoiceSeconds: "15",
    showdownSeconds: "15",
    "table.allInHands": "FaceUp",
    "table.blindPosting": "HomeGame",
    "table.maxRuns": "1",
    "table.rabbitHunt": "false",
    "table.rabbitHunters": "DealtIn",
    "table.runCount": "Vote",
    "table.showdown": "Interactive",
    "table.showdownOrder": "RiverAggressor",
    "table.straddle.button": "false",
    "table.straddle.underTheGun": "0",
    "table.straddleSize": "Doubling",
    "table.voluntaryShows": "EitherCard",
    "timeBankRefill._tag": "NoRefill",
    timeBankSeconds: "60",
    turnSeconds: "30",
  }),
};

export const STANDARD = new Map<string, string>(
  Object.entries({
    ...PRESETS.Standard,
    "approval.chips": "false",
    "approval.seats": "false",
    dealing: "Automatic",
    leavingMidHand: "ActedFor",
    locked: "false",
    moments: "All",
    pauseWhenAwaySeconds: "120",
    peeking: "true",
    shuffle: "Checked",
    sitOutAfterTimeouts: "1",
    "table.ante._tag": "NoAnte",
    topUps: "UpToMax",
  })
);
