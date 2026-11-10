import { TokenSchema } from "@nostakes/protocol";
import { Schema } from "effect";

import { clientCodec } from "../../src/index.js";
import type { ClientSchemas } from "../../src/index.js";

export const ToyCommandSchema = Schema.TaggedUnion({
  Add: { amount: Schema.Int },
  Shout: { words: Schema.String },
});

export const ToyEventSchema = Schema.TaggedUnion({
  Added: { amount: Schema.Int, total: Schema.Int },
});

export const ToyViewSchema = Schema.Struct({ total: Schema.Int });

export const ToyRejectionSchema = Schema.Struct({ reason: Schema.String });

export interface ToyTypes {
  readonly Command: typeof ToyCommandSchema.Type;
  readonly Event: typeof ToyEventSchema.Type;
  readonly View: typeof ToyViewSchema.Type;
  readonly Rejection: typeof ToyRejectionSchema.Type;
}

export const toySchemas: ClientSchemas<ToyTypes> = {
  command: ToyCommandSchema,
  event: ToyEventSchema,
  rejection: ToyRejectionSchema,
  view: ToyViewSchema,
};

export const toyCodec = clientCodec(toySchemas);

export const TOKEN = Schema.decodeSync(TokenSchema)("a".repeat(43));

export const ROOM_URL = "ws://room.test/rooms/K7P2XZ/socket";
