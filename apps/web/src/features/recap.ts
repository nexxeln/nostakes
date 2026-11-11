import { ExpressionSchema } from "@nostakes/avatar";
import { cardText } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import type { NightRecap, RecapMoment } from "@nostakes/room";
import { Option, Schema } from "effect";

import { chipsText } from "./moments/captions.js";
import type { Person } from "./moments/element.js";
import { pictureOf } from "./moments/scene.js";
import type { MomentPicture } from "./moments/schema.js";
import { isolated } from "./names.js";
import { netText } from "./pictures/settle-up.js";
import { nameOf, peopleOf } from "./room.js";
import type { ClosedView } from "./room.js";

export const RecapFaceSchema = Schema.Struct({
  avatar: Schema.String,
  expression: ExpressionSchema,
  name: Schema.String,
});

export const RecapCardSchema = Schema.Struct({
  biggestPot: Schema.Option(
    Schema.Struct({
      hand: Schema.Int,
      pot: Schema.Int,
      takers: Schema.Array(RecapFaceSchema),
    })
  ),
  hands: Schema.Int,
  length: Schema.String,
  moments: Schema.Array(
    Schema.Struct({
      cards: Schema.Array(Schema.String),
      face: RecapFaceSchema,
      hand: Schema.Int,
      lines: Schema.Array(Schema.String),
      title: Schema.String,
    })
  ),
  winner: Schema.Option(
    Schema.Struct({ face: RecapFaceSchema, net: Schema.Int })
  ),
});

export type RecapCard = typeof RecapCardSchema.Type;

const MINUTE_MS = 60_000;

const MINUTES_PER_HOUR = 60;

export const nightLength = (recap: NightRecap) =>
  Option.match(recap.span, {
    onNone: () => "",
    onSome: ({ from, to }) => {
      const minutes = Math.max(1, Math.floor((to - from) / MINUTE_MS));
      const hours = Math.floor(minutes / MINUTES_PER_HOUR);
      const left = minutes % MINUTES_PER_HOUR;

      if (hours === 0) {
        return `${minutes} min`;
      }

      return left === 0 ? `${hours} h` : `${hours} h ${left} min`;
    },
  });

export const handsLine = (recap: NightRecap) => {
  const hands = recap.hands === 1 ? "1 hand" : `${recap.hands} hands`;
  const length = nightLength(recap);

  return length.length === 0 ? hands : `${hands} in ${length}`;
};

const people = (view: ClosedView) => peopleOf(view);

const avatarOf = (view: ClosedView, player: PlayerId) =>
  people(view).find((person) => person.player === player)?.avatar ?? "";

const faceOf = (
  view: ClosedView,
  player: PlayerId,
  expression: typeof ExpressionSchema.Type
) => ({
  avatar: avatarOf(view, player),
  expression,
  name: nameOf(view, player),
});

export const nightWinner = (view: ClosedView) => {
  const [first, second] = view.settlement.balances.toSorted(
    (left, right) => right.net - left.net
  );

  return Option.fromUndefinedOr(first).pipe(
    Option.filter(
      ({ net }) => net > 0 && (second === undefined || second.net < net)
    )
  );
};

const lastHandOf = (recapped: RecapMoment) => ({
  awards: [],
  boards: recapped.boards,
  bounty: Option.none(),
  dealtIn: recapped.players.map(({ player, seat }) => ({
    folded: false,
    player,
    seat,
  })),
  handNumber: recapped.hand,
  mucked: [],
  rabbit: [],
  shown: recapped.players.map(({ player, seat, shown }) => ({
    cards: shown,
    player,
    seat,
  })),
  yourCards: [],
});

const pictured = (
  everyone: readonly Person[],
  recapped: RecapMoment
): MomentPicture =>
  pictureOf(everyone, lastHandOf(recapped), {
    also: Option.none(),
    lead: recapped.moment,
  });

export const recapPictureOf = (view: ClosedView, recapped: RecapMoment) =>
  pictured(people(view), recapped);

const SHORT_NAME = 12;

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

export const firstName = (name: string) => name.split(" ")[0] ?? name;

export const shortName = (name: string) => {
  const letters = Array.from(GRAPHEMES.segment(name), ({ segment }) => segment);

  return letters.length > SHORT_NAME
    ? `${letters
        .slice(0, SHORT_NAME - 1)
        .join("")
        .trimEnd()}\u2026`
    : name;
};

export const NAME_FORMS: readonly ((name: string) => string)[] = [
  (name) => name,
  firstName,
  (name) => shortName(firstName(name)),
];

export const captionLines = (
  view: ClosedView,
  recapped: RecapMoment
): readonly string[] => [
  ...new Set(
    NAME_FORMS.map(
      (form) =>
        pictured(
          people(view).map((person) => ({
            ...person,
            name: form(person.name),
          })),
          recapped
        ).line
    )
  ),
];

export const potTakers = (names: readonly string[]) => {
  if (names.length > 2) {
    return "split";
  }

  return `to ${names.join(" and ")}`;
};

export const takersText = (view: ClosedView, takers: readonly PlayerId[]) =>
  potTakers(takers.map((player) => isolated(nameOf(view, player))));

export interface RecapLine {
  readonly detail: string;
  readonly key: string;
  readonly title: string;
}

export const recapLines = (view: ClosedView): readonly RecapLine[] => {
  const { recap } = view;

  const winner = nightWinner(view).pipe(
    Option.map(({ net, player }) => ({
      detail: netText(net),
      key: "winner",
      title: `${isolated(nameOf(view, player))} took the night`,
    }))
  );

  const biggest = recap.biggestPot.pipe(
    Option.map(({ hand, pot, takers }) => ({
      detail: `hand ${hand}`,
      key: "pot",
      title: `Biggest pot, ${chipsText(pot)}, ${takersText(view, takers)}`,
    }))
  );

  return [
    ...Option.toArray(winner),
    ...Option.toArray(biggest),
    ...recap.moments.map((recapped) => {
      const picture = recapPictureOf(view, recapped);

      return {
        detail: picture.line,
        key: `moment-${recapped.hand}`,
        title: picture.title,
      };
    }),
  ];
};

export const recapCardOf = (view: ClosedView): RecapCard => {
  const { recap } = view;

  return {
    biggestPot: recap.biggestPot.pipe(
      Option.map(({ hand, pot, takers }) => ({
        hand,
        pot,
        takers: takers.map((player) => faceOf(view, player, "Happy")),
      }))
    ),
    hands: recap.hands,
    length: nightLength(recap),
    moments: recap.moments.map((recapped) => {
      const picture = recapPictureOf(view, recapped);
      const [lead] = picture.faces;

      return {
        cards: lead?.cards ?? [],
        face: {
          avatar: lead?.avatar ?? "",
          expression: lead?.expression ?? "Happy",
          name: lead?.name ?? "",
        },
        hand: recapped.hand,
        lines: captionLines(view, recapped),
        title: picture.title,
      };
    }),
    winner: nightWinner(view).pipe(
      Option.map(({ net, player }) => ({
        face: faceOf(view, player, "Happy"),
        net,
      }))
    ),
  };
};

export const recapCardsShown = (card: RecapCard) =>
  card.moments.flatMap(({ cards }) => cards);

export const shownInRecap = (recap: NightRecap) =>
  recap.moments.flatMap(({ players }) =>
    players.flatMap(({ shown }) => shown.map(cardText))
  );
