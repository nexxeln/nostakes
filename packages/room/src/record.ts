import { ShowdownEntries } from "@nostakes/engine";
import type { Event } from "@nostakes/engine";
import { Match, Option } from "effect";

import type { HandRecord } from "./state.js";

const updated = (record: HandRecord, event: Event): HandRecord =>
  Match.value(event).pipe(
    Match.tag("StreetDealt", ({ cards, run }) => ({
      ...record,
      boards: record.boards.map((board, index) =>
        index === run - 1 ? [...board, ...cards] : board
      ),
    })),
    Match.tag("RunsAgreed", ({ runs }) => ({
      ...record,
      boards: Array.from({ length: runs }, () => record.boards[0] ?? []),
    })),
    Match.tag("PotAwarded", ({ amount, eligible, pot, run, winners }) => ({
      ...record,
      awards: [...record.awards, { amount, eligible, pot, run, winners }],
    })),
    Match.tag("ShowdownReached", ({ order }) => ({
      ...record,
      mucked: [
        ...record.mucked,
        ...order
          .filter(ShowdownEntries.$is("Mucked"))
          .map((entry) => entry.seat)
          .filter((seat) => !record.mucked.includes(seat)),
      ],
    })),
    Match.tag("HandMucked", ({ seat }) => ({
      ...record,
      mucked: [...record.mucked, seat],
    })),
    Match.tag("RabbitHunted", ({ cards }) => ({ ...record, rabbit: cards })),
    Match.tag("BountyPaid", ({ payers, seat }) => ({
      ...record,
      bounty: Option.some({ payers, seat }),
    })),
    Match.orElse(() => record)
  );

export const recorded = (
  record: Option.Option<HandRecord>,
  event: Event
): Option.Option<HandRecord> =>
  Match.value(event).pipe(
    Match.tag("HandStarted", ({ handNumber }) =>
      Option.some({
        awards: [],
        boards: [[]],
        bounty: Option.none(),
        handNumber,
        mucked: [],
        rabbit: [],
      })
    ),
    Match.orElse(() =>
      record.pipe(Option.map((current) => updated(current, event)))
    )
  );
