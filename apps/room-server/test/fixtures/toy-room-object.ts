import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Schema } from "effect";

import { roomObject } from "../../src/room-object.js";
import { DEAL_SEED, seededEntropy } from "./test-entropy.js";
import { toyRoom } from "./toy-room.js";

const AlarmAt = Schema.Int;

const withTestHooks = Effect.gen(function* withTestHooks() {
  const state = yield* Cloudflare.DurableObjectState;

  const instance = yield* roomObject(toyRoom, {
    entropy: seededEntropy(DEAL_SEED),
  });

  // @effect-diagnostics-next-line returnEffectInGen:off -- Alchemy's DurableObject contract returns the per-instance Effect.
  return instance.pipe(
    Effect.map((room) => ({
      ...room,
      restart: () =>
        Effect.sync(() => {
          state.raw.abort("restart requested by a test");
        }),
      wakeAt: (at: typeof AlarmAt.Encoded) =>
        Schema.decodeEffect(AlarmAt)(at).pipe(
          Effect.flatMap((time) =>
            Effect.promise(() => state.raw.storage.setAlarm(time))
          ),
          Effect.orDie
        ),
    }))
  );
});

export default class ToyRoom extends Cloudflare.DurableObject<ToyRoom>()(
  "ToyRoom",
  withTestHooks
) {}
