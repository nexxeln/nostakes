import { describe, expect, it } from "@effect/vitest";
import {
  haltedStandings,
  HttpRefusalSchema,
  joinRefused,
  knockStandings,
  knockingPass,
  revokedStandings,
  PROTOCOL_VERSION,
  RoomPassSchema,
  StandingsRequestSchema,
  clientMessage,
  serverMessage,
} from "@nostakes/protocol";
import { sha256 } from "@nostakes/shuffle";
import { Predicate, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

import { pokerRoom } from "../src/poker-room.js";
import { WIRE_CONTRACTS } from "./wire-contract.js";
import type { WireParts } from "./wire-contract.js";

const ANNOTATIONS = new Set(["$comment", "description", "examples", "title"]);

const NAMED_SCHEMAS = new Set(["$defs", "patternProperties", "properties"]);

const isJsonList = (value: Schema.Json): value is readonly Schema.Json[] =>
  Array.isArray(value);

const isJsonRecord = (
  value: Schema.Json
): value is Readonly<Record<string, Schema.Json>> =>
  Predicate.isObject(value) && !Array.isArray(value);

const withoutAnnotations = (value: Schema.Json, names = false): Schema.Json => {
  if (isJsonList(value)) {
    return value.map((item) => withoutAnnotations(item));
  }

  if (!isJsonRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, inner]) =>
      !names && ANNOTATIONS.has(key)
        ? []
        : [[key, withoutAnnotations(inner, !names && NAMED_SCHEMAS.has(key))]]
    )
  );
};

const utf8 = new TextEncoder();

const digestOf = (schema: Schema.Top) =>
  Hex.encode(
    sha256(
      utf8.encode(
        JSON.stringify(
          withoutAnnotations(
            Schema.decodeUnknownSync(Schema.Json)(
              Schema.toJsonSchemaDocument(schema)
            )
          )
        )
      )
    )
  ).slice(0, 16);

const { schemas } = pokerRoom;

const wire = {
  clientFrame: clientMessage(schemas.memberCommand, schemas.signal),
  command: schemas.memberCommand,
  event: schemas.redacted,
  httpRefusal: HttpRefusalSchema,
  joinKnocking: knockingPass(schemas.knock),
  joinRefusal: joinRefused(schemas.rejection),
  joinRequest: schemas.joinRequest,
  openRequest: schemas.openRequest,
  rejection: schemas.rejection,
  roomPass: RoomPassSchema,
  serverFrame: serverMessage({
    event: schemas.redacted,
    rejection: schemas.rejection,
    signal: schemas.signal,
    view: schemas.view,
  }),
  standings: Schema.Struct({
    request: StandingsRequestSchema,
    response: Schema.Union([
      haltedStandings(schemas.view),
      revokedStandings(schemas.revoked),
      knockStandings(schemas.knock),
    ]),
  }),
  view: schemas.view,
} satisfies Record<keyof WireParts, Schema.Top>;

const current: WireParts = {
  clientFrame: digestOf(wire.clientFrame),
  command: digestOf(wire.command),
  event: digestOf(wire.event),
  httpRefusal: digestOf(wire.httpRefusal),
  joinKnocking: digestOf(wire.joinKnocking),
  joinRefusal: digestOf(wire.joinRefusal),
  joinRequest: digestOf(wire.joinRequest),
  openRequest: digestOf(wire.openRequest),
  rejection: digestOf(wire.rejection),
  roomPass: digestOf(wire.roomPass),
  serverFrame: digestOf(wire.serverFrame),
  standings: digestOf(wire.standings),
  view: digestOf(wire.view),
};

describe("the wire contract", () => {
  it("matches the contract recorded for this protocol version: a change to any part needs PROTOCOL_VERSION bumped and this entry appended to test/wire-contract.ts", () => {
    expect({ parts: current, protocol: PROTOCOL_VERSION }).toEqual(
      WIRE_CONTRACTS.at(-1)
    );
  });

  it("records one contract per protocol version, counting up from 1, and each version changed the wire", () => {
    expect(WIRE_CONTRACTS.map(({ protocol }) => protocol)).toEqual(
      Array.from({ length: WIRE_CONTRACTS.length }, (_, index) => index + 1)
    );

    for (const [index, contract] of WIRE_CONTRACTS.entries()) {
      const before = WIRE_CONTRACTS[index - 1];

      if (before !== undefined) {
        expect(contract.parts).not.toEqual(before.parts);
      }
    }
  });

  it("ignores wording that is not on the wire, and sees a renamed field", () => {
    const plain = Schema.Struct({ amount: Schema.Int });

    expect(
      digestOf(plain.annotate({ description: "chips", title: "Amount" }))
    ).toBe(digestOf(plain));
    expect(digestOf(Schema.Struct({ description: Schema.Int }))).not.toBe(
      digestOf(Schema.Struct({ title: Schema.Int }))
    );
    expect(digestOf(Schema.Struct({ chips: Schema.Int }))).not.toBe(
      digestOf(plain)
    );
  });
});
