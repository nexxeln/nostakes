import { Array as Arr, Option, Order, Result } from "effect";

import { uint32, utf8 } from "./bytes.js";
import { framed, taggedHash } from "./hashing.js";
import {
  BeaconRoundMismatch,
  DuplicateContribution,
  NoOutsideRandomness,
} from "./rejection.js";
import { Contributions, SeedSchema } from "./schemas.js";
import type { Contribution, HandContext, Seal, Seed } from "./schemas.js";

const sourceOf = (contribution: Contribution) =>
  Contributions.$match(contribution, {
    Beacon: () => "the beacon",
    Player: ({ seat }) => `seat ${seat}`,
  });

const rankOf = (contribution: Contribution) =>
  Contributions.$match(contribution, {
    Beacon: () => -1,
    Player: ({ seat }) => seat,
  });

const canonical = Order.mapInput(Order.Number, rankOf);

const encoded = (contribution: Contribution) =>
  Contributions.$match(contribution, {
    Beacon: ({ randomness, round }) =>
      framed([utf8("beacon"), uint32(round), randomness]),
    Player: ({ seat, value }) => framed([utf8("player"), uint32(seat), value]),
  });

const beaconRoundOf = (contributions: readonly Contribution[]) =>
  Arr.findFirst(contributions, Contributions.$is("Beacon")).pipe(
    Option.map(({ round }) => round)
  );

const sameRound = Option.makeEquivalence(
  (left: number, right: number) => left === right
);

export const combine = (
  context: HandContext,
  seal: Seal,
  contributions: readonly Contribution[]
): Result.Result<
  Seed,
  NoOutsideRandomness | DuplicateContribution | BeaconRoundMismatch
> => {
  const ordered = Arr.sort(contributions, canonical);

  const repeated = ordered.find(
    (contribution, index) =>
      index > 0 &&
      rankOf(contribution) === rankOf(ordered[index - 1] ?? contribution)
  );

  if (repeated !== undefined) {
    return Result.fail(
      new DuplicateContribution({ source: sourceOf(repeated) })
    );
  }

  const used = beaconRoundOf(ordered);

  if (!sameRound(seal.beaconRound, used)) {
    return Result.fail(
      new BeaconRoundMismatch({ sealed: seal.beaconRound, used })
    );
  }

  if (ordered.length === 0) {
    return Result.fail(new NoOutsideRandomness({ hand: context.hand }));
  }

  return Result.succeed(
    SeedSchema.make(
      taggedHash("seed", [
        utf8(context.room),
        uint32(context.hand),
        ...seal.roots,
        ...ordered.map(encoded),
      ])
    )
  );
};
