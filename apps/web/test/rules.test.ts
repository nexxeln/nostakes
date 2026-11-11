import { describe, expect, it } from "@effect/vitest";
import { Antes } from "@nostakes/engine";
import { RoomSettingsSchema, TimeBankRefills } from "@nostakes/room";
import type { RoomSettings } from "@nostakes/room";
import { Option, Result, Schema } from "effect";

import { RULES } from "../src/features/rules-copy.js";
import type { RuleControl } from "../src/features/rules-copy.js";
import {
  isRelevant,
  openDraft,
  presetOf,
  presetsInOrder,
  RULE_LINES,
  ruleLinesFor,
  rulesCardOf,
  SETTING_LEAVES,
  withPreset,
} from "../src/features/rules.js";
import { settingsFrom } from "../src/features/settings.js";
import type { SettingField } from "../src/features/settings.js";

const encode = Schema.encodeSync(Schema.toCodecJson(RoomSettingsSchema));

const decode = Schema.decodeSync(RoomSettingsSchema);

const schemaPaths = SETTING_LEAVES.map(({ field }) => field.path);

const optionsOf = (field: SettingField): readonly string[] => {
  if (field.kind === "Choice") {
    return field.options;
  }

  if (field.kind === "Variant") {
    return field.variants.map(({ tag }) => tag);
  }

  return field.kind === "Toggle" ? ["true", "false"] : [];
};

const fits = (control: RuleControl, field: SettingField) => {
  if (control.kind === "Stepper") {
    return field.kind === "Number";
  }

  const options = optionsOf(field).toSorted();

  if (control.kind === "Switch") {
    return options.join(",") === [control.on, control.off].toSorted().join(",");
  }

  return (
    field.kind !== "Toggle" &&
    options.join(",") === Object.keys(control.labels).toSorted().join(",")
  );
};

const words = (text: string) => text.split(/\s+/u).length;

const hidden = (draft: Record<string, string>) =>
  RULE_LINES.flatMap((line) =>
    isRelevant(line, draft) ? [] : [line.copy.path]
  );

const AN_EVENING: RoomSettings = decode({
  approval: { chips: false, seats: false },
  betweenHandsSeconds: 5,
  buyIn: { max: 400, min: 40 },
  dealing: "Automatic",
  leavingMidHand: "ActedFor",
  pauseWhenAwaySeconds: 120,
  peeking: true,
  runChoiceSeconds: 15,
  seats: 9,
  showdownSeconds: 15,
  shuffle: "Checked",
  sitOutAfterTimeouts: 1,
  table: {
    allInHands: "FaceUp",
    ante: Antes.NoAnte(),
    bigBlind: 2,
    blindPosting: "HomeGame",
    maxRuns: 1,
    rabbitHunt: false,
    rabbitHunters: "DealtIn",
    runCount: "Vote",
    showdown: "Interactive",
    showdownOrder: "RiverAggressor",
    smallBlind: 1,
    straddle: { button: false, underTheGun: 0 },
    straddleSize: "Doubling",
    voluntaryShows: "EitherCard",
  },
  timeBankRefill: TimeBankRefills.NoRefill(),
  timeBankSeconds: 60,
  topUps: "UpToMax",
  turnSeconds: 30,
});

const cardText = (draft: Record<string, string>) => {
  const { headline, rest } = rulesCardOf(draft);

  return [headline, rest].map((parts) =>
    parts.map(({ changed, text }) => (changed ? `*${text}*` : text)).join(" · ")
  );
};

describe("the house rules copy", () => {
  it("has a label, a group, and a control for every setting in the room's schema", () => {
    expect(
      schemaPaths.filter((path) => !RULES.some((rule) => rule.path === path))
    ).toEqual([]);
  });

  it("names only settings the room has", () => {
    expect(
      RULES.map(({ path }) => path).filter(
        (path) => !schemaPaths.includes(path)
      )
    ).toEqual([]);
  });

  it("gives each setting a control that offers exactly its values", () => {
    expect(
      RULE_LINES.filter(({ copy, field }) => !fits(copy.control, field)).map(
        ({ copy }) => copy.path
      )
    ).toEqual([]);
  });

  it("keeps every label to a few words and every help to one short sentence", () => {
    for (const { help, label } of RULES) {
      expect(words(label)).toBeLessThanOrEqual(4);
      const sentence = Option.getOrElse(help, () => "One.");

      expect(words(sentence)).toBeLessThanOrEqual(12);
      expect(sentence).toMatch(/^[^.]*\.$/u);
    }
  });

  it("shows a setting it has no words for under Other, by its schema title", () => {
    const lines = ruleLinesFor(
      SETTING_LEAVES,
      RULES.filter(({ path }) => path !== "table.rabbitHunt")
    );

    expect(
      lines
        .filter(({ copy }) => copy.group === "Other")
        .map(({ copy }) => [copy.path, copy.label, copy.control.kind])
    ).toEqual([["table.rabbitHunt", "Rabbit hunt", "Switch"]]);
  });

  it("sums up a plain evening in poker shorthand", () => {
    expect(cardText(openDraft(AN_EVENING))).toEqual([
      "1/2 · 40–400 · 9 seats",
      "30 s clock",
    ]);
  });

  it("calls out what a home game changes", () => {
    expect(cardText(withPreset(openDraft(AN_EVENING), "Home"))).toEqual([
      "1/2 · 40–400 · 9 seats",
      "*45 s clock* · *bank 90 s* · *straddle UTG* · *button straddle* · *run it up to 3* · *auto showdown* · *rabbit hunt* · *6 s between*",
    ]);
  });

  it("hides the rules that do not matter under the others", () => {
    expect(hidden(openDraft(AN_EVENING))).toEqual([
      "knockSeconds",
      "table.ante.amount",
      "table.bombPot.ante",
      "table.bombPot.everyHands",
      "timeBankRefill.everyHands",
      "timeBankRefill.seconds",
      "timeBankRefill.upTo",
      "table.straddleSize",
      "table.runCount",
      "runChoiceSeconds",
      "table.rabbitHunters",
      "table.sevenDeuce.amount",
    ]);
  });

  it.prop(
    "starts each preset from any settings, saves it, and knows it again",
    { settings: RoomSettingsSchema },
    ({ settings }) => {
      for (const preset of presetsInOrder) {
        const draft = withPreset(openDraft(settings), preset);

        expect(Result.isSuccess(settingsFrom(draft))).toBe(true);
        expect(presetOf(draft)).toEqual(Option.some(preset));
      }
    }
  );

  it.prop(
    "opens on exactly the settings in force",
    { settings: RoomSettingsSchema },
    ({ settings }) => {
      expect(Result.map(settingsFrom(openDraft(settings)), encode)).toEqual(
        Result.succeed(encode(settings))
      );
    }
  );
});
