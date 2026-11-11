import { describe, expect, it } from "@effect/vitest";
import { RoomSettingsSchema } from "@nostakes/room";
import { Result, Schema } from "effect";

import type { SettingsDraft } from "../src/features/model.js";
import type { RuleControl } from "../src/features/rules-copy.js";
import {
  isRelevant,
  openDraft,
  pressed,
  RULE_LINES,
} from "../src/features/rules.js";
import type { Press } from "../src/features/rules.js";
import { draftOf, settingsFrom } from "../src/features/settings.js";

const encode = Schema.encodeSync(Schema.toCodecJson(RoomSettingsSchema));

const press = (
  draft: SettingsDraft,
  control: RuleControl,
  path: string,
  how: Press
): SettingsDraft => ({ ...draft, [path]: pressed(control, draft, path, how) });

const pressedBack = (
  draft: SettingsDraft,
  control: RuleControl,
  path: string
): SettingsDraft => {
  if (control.kind === "Switch") {
    return press(
      press(draft, control, path, "Toggle"),
      control,
      path,
      "Toggle"
    );
  }

  if (control.kind === "Stepper") {
    return press(press(draft, control, path, "More"), control, path, "Less");
  }

  return { ...draft, [path]: draft[path] ?? "" };
};

describe("the settings screen", () => {
  it.prop(
    "saves exactly the settings it was opened with",
    { settings: RoomSettingsSchema },
    ({ settings }) => {
      expect(Result.map(settingsFrom(draftOf(settings)), encode)).toEqual(
        Result.succeed(encode(settings))
      );
    }
  );

  it.prop(
    "saves exactly the settings in force after every control is pressed and pressed back",
    { settings: RoomSettingsSchema },
    ({ settings }) => {
      let draft = openDraft(settings);

      for (const line of RULE_LINES) {
        if (isRelevant(line, draft)) {
          draft = pressedBack(draft, line.copy.control, line.copy.path);
        }
      }

      expect(Result.map(settingsFrom(draft), encode)).toEqual(
        Result.succeed(encode(settings))
      );
    }
  );
});
