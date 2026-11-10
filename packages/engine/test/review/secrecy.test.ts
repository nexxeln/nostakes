import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import type * as Arbitrary from "effect/Arbitrary";

import {
  CardAlreadyPublic,
  CardNotHeld,
  Commands,
  Events,
  ShowdownEntries,
  decide,
} from "../../src/index.js";
import type { Card, Command, Event, Rejection } from "../../src/index.js";
import { playSession, session } from "../sessions.js";
import { commandMatrix } from "./matrix.js";

type Source = typeof session extends Arbitrary.Arbitrary<infer A> ? A : never;

const cardsCarried = (event: Event): readonly Card[] =>
  Events.$match(event, {
    AntePosted: () => [],
    BlindPosted: () => [],
    Called: () => [],
    CardsShown: ({ cards }) => cards,
    Checked: () => [],
    ChipsAdded: () => [],
    Folded: () => [],
    HandEnded: () => [],
    HandMucked: () => [],
    HandStarted: ({ deck }) => deck,
    HandTabled: ({ cards }) => cards,
    HandsTabled: ({ hands }) => hands.flatMap((hand) => hand.cards),
    HoleCardsDealt: ({ cards }) => cards,
    PlayerSat: () => [],
    PlayerStood: () => [],
    PotAwarded: () => [],
    RabbitHunted: ({ cards }) => cards,
    RaisedTo: () => [],
    RulesChanged: () => [],
    RunsAgreed: () => [],
    RunsChosen: () => [],
    ShowdownReached: ({ order }) =>
      order.flatMap((entry) =>
        ShowdownEntries.$match(entry, {
          Mucked: () => [],
          Shown: ({ cards }) => cards,
        })
      ),
    ShowdownStarted: () => [],
    SittingOutChanged: () => [],
    StraddlePosted: () => [],
    StreetDealt: ({ cards }) => cards,
    UncalledBetReturned: () => [],
  });

const PRIVATE_CARRIERS = new Set(["HandStarted", "HoleCardsDealt"]);

const muckLeaks = (events: readonly Event[]) => {
  const leaks: string[] = [];
  const holes = new Map<number, readonly Card[]>();
  const mucked = new Map<number, readonly Card[]>();
  let unshown = new Set<number>();

  for (const event of events) {
    if (Events.$is("HandStarted")(event)) {
      holes.clear();
      mucked.clear();
    }

    if (Events.$is("HoleCardsDealt")(event)) {
      holes.set(event.seat, event.cards);
    }

    const shownBy = Events.$is("CardsShown")(event) ? event.seat : -1;

    for (const [owner, hidden] of mucked) {
      const named = cardsCarried(event).filter((card) => hidden.includes(card));

      if (
        named.length > 0 &&
        owner !== shownBy &&
        !PRIVATE_CARRIERS.has(event._tag)
      ) {
        leaks.push(`${event._tag} names a card seat ${owner} mucked`);
      }
    }

    if (Events.$is("ShowdownReached")(event)) {
      for (const entry of event.order) {
        if (ShowdownEntries.$is("Mucked")(entry)) {
          mucked.set(entry.seat, holes.get(entry.seat) ?? []);
        }
      }
    }

    if (Events.$is("ShowdownStarted")(event)) {
      unshown = new Set(event.order);
    }

    if (Events.$is("HandTabled")(event)) {
      unshown.delete(event.seat);
    }

    if (Events.$is("HandMucked")(event)) {
      mucked.set(event.seat, holes.get(event.seat) ?? []);
    }

    if (Events.$is("HandEnded")(event)) {
      for (const owner of unshown) {
        mucked.set(owner, holes.get(owner) ?? []);
      }

      unshown = new Set();
    }
  }

  return leaks;
};

const cardsNamedBy = (command: Command): readonly Card[] =>
  Commands.$is("ShowCards")(command) ? command.cards : [];

const isCardNotHeld = Schema.is(CardNotHeld);

const isCardAlreadyPublic = Schema.is(CardAlreadyPublic);

const cardsInRejection = (rejection: Rejection): readonly Card[] =>
  isCardNotHeld(rejection) || isCardAlreadyPublic(rejection)
    ? [rejection.card]
    : [];

const rejectionLeaks = (source: Source) =>
  playSession(source)
    .steps.filter((_, index) => index % 9 === 0)
    .flatMap((step) =>
      commandMatrix(step.before).flatMap((command) =>
        Result.match(decide(step.before, command), {
          onFailure: (rejection) =>
            cardsInRejection(rejection)
              .filter((card) => !cardsNamedBy(command).includes(card))
              .map((card) => `${rejection._tag} names card ${card}`),
          onSuccess: () => [],
        })
      )
    );

describe("secrecy beyond the existing property (rule 'a mucked hand never appears in any later event')", () => {
  it.prop(
    "only HandStarted and HoleCardsDealt carry cards that are not public, and a hand that was mucked or won without showing never reappears later unless its owner shows it",
    { source: session },
    ({ source }) => {
      const { events } = playSession(source);

      const carriers = new Set(
        events
          .filter((event) => cardsCarried(event).length > 0)
          .map((event) => event._tag)
      );

      expect(
        [...carriers].filter(
          (tag) =>
            !PRIVATE_CARRIERS.has(tag) &&
            ![
              "CardsShown",
              "HandTabled",
              "HandsTabled",
              "RabbitHunted",
              "ShowdownReached",
              "StreetDealt",
            ].includes(tag)
        )
      ).toStrictEqual([]);
      expect(muckLeaks(events)).toStrictEqual([]);
    }
  );

  it.prop(
    "a rejection names no card except one the command itself named",
    { source: session },
    ({ source }) => {
      expect(rejectionLeaks(source)).toStrictEqual([]);
    },
    { arbitrary: { runs: 25 }, timeout: 300_000 }
  );
});
