import { DEFAULT_SETTINGS } from "@nostakes/room";
import { Option, Result, Schema } from "effect";

import { openDraft } from "./rules.js";
import { settingsFrom } from "./settings.js";
import { EXTRAS, forNewRoom, setupChange } from "./setup.js";
import type { ExtraKind, RequestedSettings } from "./setup.js";

export const StartingRuleSchema = Schema.Literals([
  "seven-deuce",
  "bomb-pot",
  "run-it-twice",
  "straddle",
]);

export type StartingRule = typeof StartingRuleSchema.Type;

export const STARTING_RULE_PARAM = "rules";

const EXTRA_OF: Readonly<Record<StartingRule, ExtraKind>> = {
  "bomb-pot": "BombPot",
  "run-it-twice": "Runs",
  "seven-deuce": "Bounty",
  straddle: "Straddle",
};

export const startingRuleIn = (search: string): Option.Option<StartingRule> =>
  Option.fromNullishOr(
    new URLSearchParams(search).get(STARTING_RULE_PARAM)
  ).pipe(Option.flatMap(Schema.decodeUnknownOption(StartingRuleSchema)));

export const startingRules = (
  rule: StartingRule
): Option.Option<RequestedSettings> =>
  Option.fromNullishOr(
    EXTRAS.find((extra) => extra.kind === EXTRA_OF[rule])
  ).pipe(
    Option.flatMap((extra) =>
      Result.getSuccess(
        settingsFrom(
          setupChange(
            openDraft(DEFAULT_SETTINGS),
            extra.line.field.path,
            extra.on
          )
        )
      )
    ),
    Option.map(forNewRoom)
  );
