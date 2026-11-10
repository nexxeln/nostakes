import { describe, expect, it } from "@effect/vitest";
import { Schema, SchemaAST } from "effect";

import {
  MemberCommandSchema,
  OpenRequestSchema,
  RoomEventSchema,
  RoomSettingsSchema,
} from "../src/index.js";
import { settings } from "./fixtures.js";

const decodeSettings = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomSettingsSchema))
);

const decodeEvent = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema))
);

const decodeOpenRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(OpenRequestSchema))
);

const decodeMemberCommand = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.toCodecJson(MemberCommandSchema))
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
  peeking: true,
  showdownSeconds: 15,
  shuffle: "Plain",
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
      "code": "NGHT22",
      "host": "ann",
      "settings": ${SETTINGS_BEFORE_SHOWDOWNS}
    }`;

    expect(decodeEvent(stored)).toMatchObject({
      settings: withEveryDefault,
    });
  });
});

describe("the shuffle setting when a sender leaves it out", () => {
  it("reads a stored log from before it existed as a plain shuffle", () => {
    expect(decodeSettings(SETTINGS_BEFORE_SHOWDOWNS).shuffle).toBe("Plain");
  });

  it("opens a new room with a checked shuffle", () => {
    const request = decodeOpenRequest(
      `{"avatar":"","name":"Ann","settings":${SETTINGS_BEFORE_SHOWDOWNS}}`
    );

    expect(request.settings?.shuffle).toBe("Checked");
  });

  it("keeps a host's settings change checked", () => {
    const command = decodeMemberCommand(
      `{"_tag":"ChangeSettings","settings":${SETTINGS_BEFORE_SHOWDOWNS}}`
    );

    expect(
      MemberCommandSchema.guards.ChangeSettings(command) &&
        command.settings.shuffle
    ).toBe("Checked");
  });

  it("keeps a setting a sender spelled out", () => {
    const plain = SETTINGS_BEFORE_SHOWDOWNS.replace(
      '"turnSeconds": 0',
      '"turnSeconds": 0, "shuffle": "Plain"'
    );

    expect(
      decodeOpenRequest(`{"avatar":"","name":"Ann","settings":${plain}}`)
        .settings?.shuffle
    ).toBe("Plain");
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
