import { Option } from "effect";

import { isYou } from "./room.js";
import type { OpenView } from "./room.js";

type Occupant = Option.Option.Value<OpenView["seats"][number]["occupant"]>;

export interface Entry {
  readonly dead: number;
  readonly live: number;
  readonly posting: boolean;
  readonly sealedWithout: boolean;
}

export interface EntryWords {
  readonly action: string;
  readonly line: string;
  readonly note: string;
}

const owesABlind = ({ owes }: Occupant) => owes.big || owes.small || owes.entry;

const dealtInto = (view: OpenView, seat: number) =>
  Option.exists(view.hand, ({ players }) =>
    players.some((player) => player.seat === seat)
  ) ||
  Option.exists(view.fairness.sealed, ({ seats }) =>
    seats.some((sealed) => sealed === seat)
  );

const owing = (view: OpenView, seat: number, occupant: Occupant) =>
  view.settings.table.blindPosting === "Casino" &&
  !occupant.sittingOut &&
  owesABlind(occupant) &&
  !dealtInto(view, seat);

export const entryOf = (view: OpenView): Option.Option<Entry> => {
  const yours = view.seats.flatMap(({ occupant, seat }) =>
    Option.match(occupant, {
      onNone: () => [],
      onSome: (seated) =>
        isYou(view, seated.player) ? [{ seat, seated }] : [],
    })
  );

  return Option.fromNullishOr(yours[0]).pipe(
    Option.filter(({ seat, seated }) => owing(view, seat, seated)),
    Option.map(({ seated }) => ({
      dead: seated.owes.small ? view.settings.table.smallBlind : 0,
      live:
        seated.owes.big || seated.owes.entry ? view.settings.table.bigBlind : 0,
      posting: seated.posts,
      sealedWithout: Option.isSome(view.fairness.sealed),
    }))
  );
};

export const waitingNote = (
  view: OpenView,
  seat: number,
  occupant: Occupant
) => {
  if (!owing(view, seat, occupant)) {
    return "";
  }

  return occupant.posts ? "Posting in" : "Waits for BB";
};

const amountWords = ({ dead, live }: Entry) => {
  if (live === 0) {
    return `${dead} dead`;
  }

  return dead === 0 ? `${live}` : `${live} + ${dead} dead`;
};

export const entryWords = (entry: Entry): EntryWords => {
  const amount = amountWords(entry);

  const note = entry.sealedWithout
    ? "The next hand is already set, so this counts from the one after."
    : "";

  return entry.posting
    ? {
        action: "Wait for the big blind instead",
        line: `Posting ${amount} to come in`,
        note,
      }
    : {
        action: `Post ${amount} to come in`,
        line: "Waiting for the big blind",
        note,
      };
};
