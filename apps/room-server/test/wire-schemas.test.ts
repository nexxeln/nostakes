import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { RoomCodeSchema } from "@nostakes/protocol";
import type { WireCodec } from "@nostakes/protocol";
import { RoomViewSchema } from "@nostakes/room";
import type { RoomView } from "@nostakes/room";
import { Option, Schema } from "effect";

import type { RoomSchemas } from "../src/hosted-room.js";
import { toyRoom, ToyViewSchema } from "./fixtures/toy-room.js";
import type { ToyTypes, ToyView } from "./fixtures/toy-room.js";

const ViewHoldingOptions = Schema.Struct({
  ...ToyViewSchema.fields,
  code: Schema.Option(RoomCodeSchema),
});

const view: ToyView = {
  code: Option.some(RoomCodeSchema.make("K7P2XZ")),
  count: 0,
  dealDue: false,
  host: Option.none(),
  members: [],
  round: 0,
  secret: Option.none(),
  turn: Option.none(),
  you: Option.none(),
};

describe("the hosted room port", () => {
  it("takes only schemas whose encoded form is JSON, so a view holding Option values does not typecheck", () => {
    expectTypeOf(ViewHoldingOptions).not.toExtend<WireCodec<ToyView>>();
    expectTypeOf({
      ...toyRoom.schemas,
      view: ViewHoldingOptions,
    }).not.toExtend<RoomSchemas<ToyTypes>>();
    expectTypeOf(RoomViewSchema).not.toExtend<WireCodec<RoomView>>();
    expectTypeOf(Schema.toCodecJson(RoomViewSchema)).toExtend<
      WireCodec<RoomView>
    >();
  });

  it("would have failed only at runtime: a view holding Options is written as JSON text that the other side cannot read back", () => {
    const wire = Schema.fromJsonString(ViewHoldingOptions);
    const text = Schema.encodeSync(wire)(view);

    expect(JSON.parse(text)).toHaveProperty("code._tag", "Some");
    expect(Option.isNone(Schema.decodeOption(wire)(text))).toBe(true);
  });
});
