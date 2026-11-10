import { Events, evaluate } from "../src/index.js";
import type { Card, Event, SeatIndex } from "../src/index.js";

type PotAwarded = Extract<Event, { readonly _tag: "PotAwarded" }>;

export interface Choice {
  readonly mucked: boolean;
  readonly seat: SeatIndex;
}

export const claimsAfterChoices = (
  eligible: readonly (readonly SeatIndex[])[],
  choices: readonly Choice[]
) => {
  const claims = eligible.map((seats) => [...seats]);

  for (const choice of choices) {
    if (choice.mucked) {
      for (const [index, claimants] of claims.entries()) {
        if (claimants.length > 1 && claimants.includes(choice.seat)) {
          claims[index] = claimants.filter((seat) => seat !== choice.seat);
        }
      }
    }
  }

  return claims;
};

export const mustTable = (
  claims: readonly (readonly SeatIndex[])[],
  tabled: ReadonlyMap<SeatIndex, number>,
  seat: SeatIndex,
  rank: number
) =>
  claims.some((claimants) => {
    const rivals = claimants
      .filter((other) => other !== seat)
      .flatMap((other) => {
        const shown = tabled.get(other);

        return shown === undefined ? [] : [shown];
      });

    return (
      claimants.includes(seat) &&
      rivals.length > 0 &&
      rivals.every((rival) => rival <= rank)
    );
  });

const contestedBy = (
  claims: readonly (readonly SeatIndex[])[],
  seat: SeatIndex
) =>
  claims.some((claimants) => claimants.length > 1 && claimants.includes(seat));

export interface ShowdownReplay {
  readonly asked: readonly SeatIndex[];
  readonly hidden: ReadonlySet<SeatIndex>;
  readonly problems: readonly string[];
}

const sortedText = (seats: readonly number[]) =>
  seats.toSorted((left, right) => left - right).join(",");

const dealtCards = (hand: readonly Event[]) => {
  const holes = new Map<number, readonly Card[]>();
  const board: Card[] = [];

  for (const event of hand) {
    if (Events.$is("HoleCardsDealt")(event)) {
      holes.set(event.seat, event.cards);
    }

    if (Events.$is("StreetDealt")(event)) {
      board.push(...event.cards);
    }
  }

  return { board, holes };
};

const awardProblems = (
  awards: readonly PotAwarded[],
  claims: readonly (readonly SeatIndex[])[],
  tabled: ReadonlyMap<SeatIndex, number>
) => {
  const problems: string[] = [];

  for (const [index, award] of awards.entries()) {
    const claimants = claims[index] ?? [];

    const best = Math.max(
      ...claimants.map((seat) => tabled.get(seat) ?? Number.NEGATIVE_INFINITY)
    );

    const expected =
      claimants.length === 1
        ? claimants
        : claimants.filter((seat) => tabled.get(seat) === best);

    const winners = sortedText(award.winners.map((winner) => winner.seat));

    if (winners !== sortedText(expected)) {
      problems.push(
        `pot ${award.pot} went to ${winners}, not ${sortedText(expected)}`
      );
    }
  }

  const numbers = awards.map((award) => award.pot).join(",");

  if (numbers !== awards.map((_, index) => index + 1).join(",")) {
    problems.push(`pots awarded ${numbers}`);
  }

  return problems;
};

export const replayShowdown = (hand: readonly Event[]): ShowdownReplay => {
  const started = hand.find(Events.$is("ShowdownStarted"));

  if (started === undefined) {
    return { asked: [], hidden: new Set(), problems: [] };
  }

  const { board, holes } = dealtCards(hand);

  const rankOf = (seat: SeatIndex) =>
    evaluate([...(holes.get(seat) ?? []), ...board]);

  const awards = hand.filter(Events.$is("PotAwarded"));
  const eligible = awards.map((award) => award.eligible);
  const choices: Choice[] = [];
  const tabled = new Map<SeatIndex, number>();
  const asked: SeatIndex[] = [];
  const problems: string[] = [];

  const due = () => {
    const claims = claimsAfterChoices(eligible, choices);

    return started.order.find(
      (seat) =>
        !choices.some((choice) => choice.seat === seat) &&
        contestedBy(claims, seat)
    );
  };

  for (const event of hand) {
    if (Events.$is("HandTabled")(event) || Events.$is("HandMucked")(event)) {
      const expected = due();

      if (expected !== event.seat) {
        problems.push(
          `seat ${event.seat} chose while seat ${expected} was due`
        );
      }

      asked.push(event.seat);
    }

    if (
      Events.$is("HandMucked")(event) &&
      mustTable(
        claimsAfterChoices(eligible, choices),
        tabled,
        event.seat,
        rankOf(event.seat)
      )
    ) {
      problems.push(
        `seat ${event.seat} mucked a hand that beats or ties the tabled hands`
      );
    }

    if (
      Events.$is("HandTabled")(event) &&
      (event.cards.join(",") !== (holes.get(event.seat) ?? []).join(",") ||
        event.rank !== rankOf(event.seat))
    ) {
      problems.push(`seat ${event.seat} tabled cards it was not dealt`);
    }

    if (Events.$is("HandTabled")(event)) {
      tabled.set(event.seat, event.rank);
    }

    if (Events.$is("HandTabled")(event) || Events.$is("HandMucked")(event)) {
      choices.push({
        mucked: Events.$is("HandMucked")(event),
        seat: event.seat,
      });
    }
  }

  const left = due();

  return {
    asked,
    hidden: new Set(started.order.filter((seat) => !tabled.has(seat))),
    problems: [
      ...problems,
      ...(left === undefined ? [] : [`seat ${left} was never asked`]),
      ...awardProblems(awards, claimsAfterChoices(eligible, choices), tabled),
    ],
  };
};
