import { describe, expect, it } from "@effect/vitest";
import { Schema, SchemaAST } from "effect";

import { RoomEventSchema, RoomSettingsSchema } from "../src/index.js";
import { settings } from "./fixtures.js";

const decodeSettings = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomSettingsSchema))
);

const decodeEvent = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema))
);

const SETTINGS_BEFORE_SHOWDOWNS = `{
  "approval": { "chips": false, "seats": false },
  "betweenHandsSeconds": 0,
  "buyIn": { "max": 1000, "min": 100 },
  "runChoiceSeconds": 10,
  "table": {
    "ante": { "_tag": "NoAnte" },
    "bigBlind": 10,
    "maxRuns": 1,
    "rabbitHunt": false,
    "smallBlind": 5,
    "straddle": { "button": false, "underTheGun": 0 }
  },
  "timeBankSeconds": 0,
  "turnSeconds": 0
}`;

const withEveryDefault = {
  ...settings,
  showdownSeconds: 15,
  table: { ...settings.table, showdown: "Automatic" },
};

describe("settings stored before a field existed", () => {
  it("decode with each added field at its default", () => {
    expect(decodeSettings(SETTINGS_BEFORE_SHOWDOWNS)).toStrictEqual(
      withEveryDefault
    );
  });

  it("decode inside a RoomOpened event read back from a room's log", () => {
    const stored = `{
      "_tag": "RoomOpened",
      "at": 0,
      "code": "night",
      "host": "ann",
      "settings": ${SETTINGS_BEFORE_SHOWDOWNS}
    }`;

    expect(decodeEvent(stored)).toMatchObject({
      settings: withEveryDefault,
    });
  });
});

const unlabelled = (ast: SchemaAST.AST, path: string): readonly string[] =>
  SchemaAST.isObjects(ast)
    ? ast.propertySignatures.flatMap((field) => {
        const at = `${path}${String(field.name)}`;

        const labelled =
          SchemaAST.resolveTitle(field.type) !== undefined &&
          SchemaAST.resolveDescription(field.type) !== undefined;

        return [...(labelled ? [] : [at]), ...unlabelled(field.type, `${at}.`)];
      })
    : [];

describe("the host settings screen", () => {
  it("finds a title and a description on every setting", () => {
    expect(unlabelled(RoomSettingsSchema.ast, "")).toStrictEqual([]);
  });
});
