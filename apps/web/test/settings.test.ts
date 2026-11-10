import { describe, expect, it } from "@effect/vitest";
import { RoomSettingsSchema } from "@nostakes/room";
import { Result, Schema } from "effect";

import {
  draftOf,
  SETTINGS_FORM,
  settingsFrom,
} from "../src/features/settings.js";
import type { SettingField } from "../src/features/settings.js";

const encode = Schema.encodeSync(Schema.toCodecJson(RoomSettingsSchema));

const leaves = (fields: readonly SettingField[]): readonly SettingField[] =>
  fields.flatMap((field) => {
    if (field.kind === "Group") {
      return leaves(field.fields);
    }

    if (field.kind === "Variant") {
      return [
        field,
        ...leaves(field.variants.flatMap(({ fields: inner }) => inner)),
      ];
    }

    return [field];
  });

describe("the settings screen", () => {
  it("can edit every field of the room's settings", () => {
    expect(
      leaves(SETTINGS_FORM)
        .filter((field) => field.kind === "Unsupported")
        .map(({ path }) => path)
    ).toEqual([]);
  });

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
    "refuses a draft with a field left empty",
    { settings: RoomSettingsSchema },
    ({ settings }) => {
      const draft = { ...draftOf(settings), "table.bigBlind": "" };

      expect(Result.isFailure(settingsFrom(draft))).toBe(true);
    }
  );
});
