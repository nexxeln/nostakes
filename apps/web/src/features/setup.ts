import { ChipsSchema, splitEvenly } from "@nostakes/engine";
import { RequestedSettingsSchema } from "@nostakes/room";
import type { RoomSettings } from "@nostakes/room";
import { Effect, Option, Result, Schema } from "effect";

import type { SettingsDraft } from "./model.js";
import type { OpenView } from "./room.js";
import { RULES } from "./rules-copy.js";
import type { Preset, RuleCopy } from "./rules-copy.js";
import {
  isRelevant,
  openDraft,
  RULE_LINES,
  rulesCardOf,
  withPreset,
} from "./rules.js";
import type { RuleLine } from "./rules.js";
import { settingsFrom } from "./settings.js";

export type RequestedSettings = typeof RequestedSettingsSchema.Type;

export const beforeFirstHand = (view: OpenView) =>
  Option.isNone(view.hand) && Option.isNone(view.lastHand);

export const rulesInForce = (view: OpenView): RoomSettings => ({
  ...view.settings,
  table: Option.getOrElse(view.queued.rules, () => view.settings.table),
});

export const roomDraft = (view: OpenView): SettingsDraft =>
  openDraft(rulesInForce(view));

const lineAt = (path: string): readonly RuleLine[] =>
  RULE_LINES.filter(({ field }) => field.path === path).slice(0, 1);

export const BLIND_LINES: readonly RuleLine[] = [
  "table.smallBlind",
  "table.bigBlind",
].flatMap(lineAt);

export const BUY_IN_LINES: readonly RuleLine[] = [
  "buyIn.min",
  "buyIn.max",
].flatMap(lineAt);

export type ExtraKind = "Bounty" | "BombPot" | "Runs" | "Straddle";

export interface Extra {
  readonly kind: ExtraKind;
  readonly line: RuleLine;
  readonly on: string;
  readonly off: string;
  readonly isOn: (draft: SettingsDraft) => boolean;
  readonly amounts: readonly RuleLine[];
}

const numberAt = (draft: SettingsDraft, path: string) => {
  const value = Number(draft[path] ?? "");

  return Number.isFinite(value) ? value : 0;
};

const switched = (line: RuleLine) =>
  line.copy.control.kind === "Switch" ? line.copy.control : { off: "", on: "" };

const tagged = (
  kind: ExtraKind,
  path: string,
  amounts: readonly string[]
): readonly Extra[] =>
  lineAt(path).map((line) => {
    const { off, on } = switched(line);

    return {
      amounts: amounts.flatMap(lineAt),
      isOn: (draft: SettingsDraft) => draft[path] === on,
      kind,
      line,
      off,
      on,
    };
  });

const counted = (
  kind: ExtraKind,
  path: string,
  on: number,
  off: number
): readonly Extra[] =>
  lineAt(path).map((line) => ({
    amounts: [],
    isOn: (draft: SettingsDraft) => numberAt(draft, path) > off,
    kind,
    line,
    off: String(off),
    on: String(on),
  }));

export const EXTRAS: readonly Extra[] = [
  ...tagged("Bounty", "table.sevenDeuce._tag", ["table.sevenDeuce.amount"]),
  ...tagged("BombPot", "table.bombPot._tag", [
    "table.bombPot.ante",
    "table.bombPot.everyHands",
  ]),
  ...counted("Runs", "table.maxRuns", 2, 1),
  ...counted("Straddle", "table.straddle.underTheGun", 1, 0),
];

const capitalized = (text: string) =>
  text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

export const extraLabel = (extra: Extra, draft: SettingsDraft) =>
  extra.line.copy.control.kind === "Switch"
    ? extra.line.copy.label
    : Option.match(
        extra.line.copy.brief(
          extra.isOn(draft)
            ? draft
            : { ...draft, [extra.line.field.path]: extra.on }
        ),
        {
          onNone: () => extra.line.copy.label,
          onSome: capitalized,
        }
      );

export const extraFlipped = (extra: Extra, draft: SettingsDraft) =>
  extra.isOn(draft) ? extra.off : extra.on;

export const shownAmounts = (extra: Extra, draft: SettingsDraft) =>
  extra.isOn(draft)
    ? extra.amounts.filter((line) => isRelevant(line, draft))
    : [];

const chipsIn = (text: string | undefined) =>
  Schema.decodeUnknownOption(ChipsSchema)(Number(text ?? ""));

const timesWhole = (amount: string | undefined, unit: number) =>
  Option.flatMap(chipsIn(amount), (chips) => {
    const { remainder, share } = splitEvenly(chips, unit);

    return remainder === 0 ? Option.some(share) : Option.none();
  });

export const followBigBlind = (
  draft: SettingsDraft,
  next: SettingsDraft
): SettingsDraft => {
  const before = chipsIn(draft["table.bigBlind"]).pipe(
    Option.filter((value) => value > 0)
  );

  const after = chipsIn(next["table.bigBlind"]).pipe(
    Option.filter((value) => value > 0)
  );

  const scaled = Option.flatMap(Option.all([before, after]), ([old, now]) =>
    Option.all([
      timesWhole(draft["buyIn.min"], old),
      timesWhole(draft["buyIn.max"], old),
    ]).pipe(
      Option.map(([least, most]) => ({
        ...next,
        "buyIn.max": String(most * now),
        "buyIn.min": String(least * now),
      }))
    )
  );

  return Option.match(scaled, {
    onNone: () => next,
    onSome: (moved) =>
      Result.isSuccess(settingsFrom(moved)) ||
      Result.isFailure(settingsFrom(next))
        ? moved
        : next,
  });
};

export const setupChange = (
  draft: SettingsDraft,
  path: string,
  value: string
): SettingsDraft => {
  const next = { ...draft, [path]: value };

  return path === "table.bigBlind" ? followBigBlind(draft, next) : next;
};

export const setupPreset = (draft: SettingsDraft, preset: Preset) =>
  withPreset(draft, preset);

export const debounced = (path: string) =>
  RULES.find((copy: RuleCopy) => copy.path === path)?.control.kind ===
  "Stepper";

export const SETUP_SETTLE_MS = 700;

export const unlocked = (settings: RequestedSettings): RequestedSettings => ({
  ...settings,
  locked: false,
});

const decodeRemembered = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.toCodecJson(RequestedSettingsSchema))
);

const encodeRemembered = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(RequestedSettingsSchema))
);

export const rememberedRules = (
  stored: Option.Option<string>
): Option.Option<RequestedSettings> =>
  stored.pipe(Option.flatMap(decodeRemembered), Option.map(unlocked));

export const rulesToRemember = (view: OpenView) =>
  encodeRemembered(unlocked(rulesInForce(view)));

export interface FeltRules {
  readonly headline: string;
  readonly extras: string;
}

const briefsOf = (lines: readonly RuleLine[], draft: SettingsDraft) =>
  lines.flatMap((line) =>
    isRelevant(line, draft) ? Option.toArray(line.copy.brief(draft)) : []
  );

const MONEY_PATHS = ["table.bigBlind", "buyIn.max", "table.ante._tag"];

export const shorthandOf = (draft: SettingsDraft): FeltRules => ({
  extras: briefsOf(
    EXTRAS.map(({ line }) => line),
    draft
  ).join(" · "),
  headline: briefsOf(
    MONEY_PATHS.flatMap((path) => lineAt(path)),
    draft
  ).join(" · "),
});

export const feltRulesOf = (view: OpenView): Option.Option<FeltRules> =>
  beforeFirstHand(view)
    ? Option.some(shorthandOf(roomDraft(view)))
    : Option.none();

export const rememberedShorthand = (settings: RequestedSettings) => {
  const draft = openDraft(settings);
  const { extras } = shorthandOf(draft);

  const headline = rulesCardOf(draft)
    .headline.map(({ text }) => text)
    .join(" · ");

  return extras.length === 0 ? headline : `${headline} · ${extras}`;
};

export const seatedCount = (view: OpenView) =>
  view.seats.filter(
    ({ occupant, seat }) =>
      seat < view.settings.seats && Option.isSome(occupant)
  ).length;

export const PLAYERS_TO_DEAL = 2;

export interface Opened<Entry> {
  readonly entry: Entry;
  readonly rulesDropped: boolean;
}

export const openWithRules = <Entry, E, R>(
  settings: Option.Option<RequestedSettings>,
  open: (
    settings: Option.Option<RequestedSettings>
  ) => Effect.Effect<Entry, E, R>
): Effect.Effect<Opened<Entry>, E, R> => {
  const chosen = settings.pipe(Option.map(unlocked));
  const plain = () => open(Option.none());

  return Option.isNone(chosen)
    ? plain().pipe(Effect.map((entry) => ({ entry, rulesDropped: false })))
    : open(chosen).pipe(
        Effect.matchEffect({
          onFailure: () =>
            plain().pipe(
              Effect.map((entry) => ({ entry, rulesDropped: true }))
            ),
          onSuccess: (entry) => Effect.succeed({ entry, rulesDropped: false }),
        })
      );
};
