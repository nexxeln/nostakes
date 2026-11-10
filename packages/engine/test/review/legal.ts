import { Option } from "effect";

import { chipCount, seat } from "../fixtures.js";

export const legal = (
  index: number,
  canCheck: boolean,
  call: number | null,
  raise: readonly [number, number] | null
) => ({
  call: call === null ? Option.none() : Option.some(chipCount(call)),
  canCheck,
  raise:
    raise === null
      ? Option.none()
      : Option.some({
          maxTo: chipCount(raise[1]),
          minTo: chipCount(raise[0]),
        }),
  seat: seat(index),
});
