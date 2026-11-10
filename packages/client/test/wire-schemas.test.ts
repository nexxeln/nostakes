import { describe, expectTypeOf, it } from "@effect/vitest";
import { Schema } from "effect";

import type { ClientSchemas } from "../src/index.js";
import { toySchemas, ToyViewSchema } from "./fixtures/toy-room.js";
import type { ToyTypes } from "./fixtures/toy-room.js";

const ViewHoldingBytes = Schema.Struct({
  ...ToyViewSchema.fields,
  total: Schema.BigInt,
});

interface BigTotalTypes extends Omit<ToyTypes, "View"> {
  readonly View: typeof ViewHoldingBytes.Type;
}

describe("the client's schemas", () => {
  it("take only schemas whose encoded form is JSON", () => {
    expectTypeOf(toySchemas).toExtend<ClientSchemas<ToyTypes>>();
    expectTypeOf({
      ...toySchemas,
      view: ViewHoldingBytes,
    }).not.toExtend<ClientSchemas<BigTotalTypes>>();
  });
});
