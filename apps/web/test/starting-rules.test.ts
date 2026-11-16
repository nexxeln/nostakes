import { describe, expect, it } from "@effect/vitest";
import { DEFAULT_SETTINGS, RequestedSettingsSchema } from "@nostakes/room";
import type { RoomSettings } from "@nostakes/room";
import { Option, Schema, Struct } from "effect";

import { Messages } from "../src/features/message.js";
import { Screens } from "../src/features/model.js";
import type { Flags } from "../src/features/model.js";
import {
  STARTING_RULE_PARAM,
  StartingRuleSchema,
  startingRuleIn,
  startingRules,
} from "../src/features/starting-rules.js";
import { init, update } from "../src/features/update.js";

const HOSTILE = Schema.Literals([
  "locked",
  "lock",
  "approval",
  "approval.joins",
  "joins",
  "Seven-Deuce",
  "seven-deuce ",
  "__proto__",
]);

const SearchSchema = Schema.Struct({
  rest: Schema.String,
  rule: Schema.Union([StartingRuleSchema, HOSTILE, Schema.String]),
});

const searchOf = ({ rest, rule }: typeof SearchSchema.Type) =>
  `?${new URLSearchParams([[STARTING_RULE_PARAM, rule]]).toString()}&${rest}`;

const flagsFor = (search: string): Flags => {
  const linked = startingRuleIn(search).pipe(Option.flatMap(startingRules));

  return {
    deck: "TwoColour",
    invite: Option.none(),
    lastRules: linked,
    learned: [],
    profile: { avatar: "", name: "Ana" },
    reloadedFor: Option.none(),
    rooms: [],
    rulesFromLink: Option.isSome(linked),
    saved: Option.none(),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  };
};

const CreatedSchema = Schema.Struct({
  settings: Schema.Option(RequestedSettingsSchema),
});

const createdSettings = (search: string) => {
  const { model } = init(flagsFor(search));

  const { commands } = update(
    { ...model, screen: Screens.Home({ busy: false, problem: Option.none() }) },
    Messages.SubmittedCreate()
  );

  return (commands ?? []).flatMap(({ args, name }) =>
    name === "CreateRoom"
      ? Option.toArray(Schema.decodeUnknownOption(CreatedSchema)(args))
      : []
  );
};

const outsideTheTable = (settings: RoomSettings) =>
  Struct.omit(settings, ["table"]);

describe("a room opened from a guide's address", () => {
  it.prop(
    "never locks the room or asks for approval, and changes nothing but the table rules",
    { search: SearchSchema },
    ({ search }) => {
      const sent = createdSettings(searchOf(search));

      expect(sent).toHaveLength(1);

      for (const settings of Option.toArray(
        sent[0]?.settings ?? Option.none()
      )) {
        expect(settings.locked).toBe(false);
        expect(settings.approval).toStrictEqual({
          chips: false,
          joins: false,
          seats: false,
        });
        expect(outsideTheTable(settings)).toEqual(
          outsideTheTable(DEFAULT_SETTINGS)
        );
      }
    },
    { arbitrary: { runs: 200 } }
  );

  it("opens with the named rule for every guide", () => {
    for (const rule of StartingRuleSchema.literals) {
      const sent = createdSettings(searchOf({ rest: "", rule }));

      expect(Option.isSome(sent[0]?.settings ?? Option.none())).toBe(true);
    }
  });
});
