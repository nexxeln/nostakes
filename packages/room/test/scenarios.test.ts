import { describe, expect, it } from "@effect/vitest";
import {
  Actions,
  CardFromText,
  ChipsSchema,
  Events,
  Seats,
} from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { AmountSchema, NetSchema } from "@nostakes/ledger";
import { Option, Result, Schema } from "effect";

import {
  Audiences,
  RoomCommands,
  RoomEvents,
  RoomViews,
  deckFromBytes,
  settlement,
  viewFor,
} from "../src/index.js";
import type { RoomEvent, RoomState } from "../src/index.js";
import {
  ann,
  as,
  bob,
  bytesForDeck,
  cat,
  dan,
  join,
  ms,
  openOf,
  openedBy,
  run,
  runAll,
  seat,
  server,
  settings,
  sit,
} from "./fixtures.js";

const card = Schema.decodeSync(CardFromText);

const cards = (text: string) => text.split(" ").map((word) => card(word));

const act = (who: typeof ann, action: Action, at: number) =>
  RoomCommands.Act({ action, at: ms(at), by: as(who) });

const deal = (at: number, leading: string) =>
  RoomCommands.Deal({
    at: ms(at),
    by: server,
    shuffleBytes: bytesForDeck(leading),
  });

const tableEvents = (events: readonly RoomEvent[]) =>
  events.flatMap((event) =>
    RoomEvents.$is("Table")(event) ? [event.event] : []
  );

const stacks = (state: RoomState) =>
  openOf(state).table.seats.map((current) =>
    Seats.$is("Occupied")(current) ? current.stack : 0
  );

const seatedThree = runAll(openedBy(ann), [
  join(bob),
  join(cat),
  sit(ann, 0, 100),
  sit(bob, 1, 100),
  sit(cat, 2, 100),
  RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
]);

const firstHand = runAll(seatedThree, [
  deal(10, "7c Qd Ah 2d 9h As Kd 9s 5h 3c Jd"),
  act(ann, Actions.RaiseTo({ to: ChipsSchema.make(100) }), 11),
  act(bob, Actions.Call(), 12),
  act(cat, Actions.Fold(), 13),
]);

const rebought = run(
  firstHand,
  RoomCommands.RequestChips({
    amount: ChipsSchema.make(100),
    at: ms(20),
    by: as(bob),
  })
);

const secondHand = runAll(rebought.state, [
  deal(30, "Kh 8d 4c Kc 3s Tc 2c 7h 9d Jc 4s"),
  act(bob, Actions.Fold(), 31),
  act(cat, Actions.Call(), 32),
  act(ann, Actions.Check(), 33),
  act(cat, Actions.Check(), 34),
  act(ann, Actions.Check(), 35),
  act(cat, Actions.Check(), 36),
  act(ann, Actions.Check(), 37),
  act(cat, Actions.Check(), 38),
  act(ann, Actions.Check(), 39),
]);

const thirdHand = runAll(secondHand, [
  deal(50, "2c 3d 4h 5s 6c 7d"),
  act(cat, Actions.Fold(), 51),
  act(ann, Actions.Fold(), 52),
]);

describe("a night of three hands", () => {
  it("wins the first hand with aces, rebuys the busted seat, and records the rebuy when it arrives", () => {
    expect(stacks(firstHand).slice(0, 3)).toStrictEqual([210, 0, 90]);
    expect(rebought.events).toStrictEqual([
      RoomEvents.BoughtIn({
        amount: ChipsSchema.make(100),
        at: ms(20),
        player: bob,
        seat: seat(1),
      }),
    ]);
    expect(stacks(secondHand).slice(0, 3)).toStrictEqual([200, 100, 100]);
    expect(stacks(thirdHand).slice(0, 3)).toStrictEqual([195, 105, 100]);
  });

  it("settles the night so the rebuyer pays the winner", () => {
    const closed = run(
      thirdHand,
      RoomCommands.CloseRoom({ at: ms(60), by: as(ann) })
    );

    const expected = {
      balances: [
        {
          boughtIn: 100,
          cashedOut: 195,
          net: NetSchema.make(95),
          player: ann,
        },
        {
          boughtIn: 200,
          cashedOut: 105,
          net: NetSchema.make(-95),
          player: bob,
        },
        {
          boughtIn: 100,
          cashedOut: 100,
          net: NetSchema.make(0),
          player: cat,
        },
      ],
      transfers: [{ amount: AmountSchema.make(95), from: bob, to: ann }],
    };

    expect(settlement(thirdHand)).toStrictEqual(Result.succeed(expected));
    expect(closed.events.at(-1)).toStrictEqual(
      RoomEvents.RoomClosed({ at: ms(60), settlement: expected })
    );
  });
});

describe("a spectator at a showdown", () => {
  it("sees the winner's shown cards, the board, who was dealt in and who folded, and nothing of the hand that mucked", () => {
    const view = viewFor(secondHand, Audiences.Spectator(), ms(40));

    if (!RoomViews.$is("Open")(view)) {
      throw new Error("expected an open view");
    }

    expect(view.holeCards).toStrictEqual([]);
    expect(view.lastHand).toStrictEqual(
      Option.some({
        awards: [
          {
            amount: ChipsSchema.make(20),
            eligible: [seat(0), seat(2)],
            pot: 1,
            run: 1,
            winners: [{ amount: ChipsSchema.make(20), seat: seat(2) }],
          },
        ],
        boards: [cards("2c 7h 9d Jc 4s")],
        bounty: Option.none(),
        dealtIn: [
          { folded: false, player: ann, seat: seat(0) },
          { folded: true, player: bob, seat: seat(1) },
          { folded: false, player: cat, seat: seat(2) },
        ],
        handNumber: 2,
        mucked: [seat(0)],
        rabbit: [],
        shown: [{ cards: cards("Kh Kc"), player: cat, seat: seat(2) }],
        yourCards: [],
      })
    );
  });
});

describe("straddles", () => {
  it("applies an under-the-gun straddle that was declared and ignores a declaration that cannot apply", () => {
    const fourHanded = runAll(
      openedBy(ann, {
        ...settings,
        table: {
          ...settings.table,
          straddle: { button: false, underTheGun: 1 },
        },
      }),
      [
        join(bob),
        join(cat),
        join(dan),
        sit(ann, 0),
        sit(bob, 1),
        sit(cat, 2),
        sit(dan, 3),
        RoomCommands.DeclareStraddle({ at: ms(3), by: as(dan), on: true }),
        RoomCommands.DeclareStraddle({ at: ms(3), by: as(bob), on: true }),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
      ]
    );

    const dealt = run(fourHanded, deal(10, ""));

    expect(
      tableEvents(dealt.events).filter(
        (event) =>
          Events.$is("BlindPosted")(event) ||
          Events.$is("StraddlePosted")(event)
      )
    ).toStrictEqual([
      Events.BlindPosted({
        allIn: false,
        amount: ChipsSchema.make(5),
        blind: "Small",
        seat: seat(1),
      }),
      Events.BlindPosted({
        allIn: false,
        amount: ChipsSchema.make(10),
        blind: "Big",
        seat: seat(2),
      }),
      Events.StraddlePosted({ amount: ChipsSchema.make(20), seat: seat(3) }),
    ]);
    expect(openOf(dealt.state).straddlers).toStrictEqual([dan, bob]);
  });
});

describe("the byte stream for a chosen deck", () => {
  it("shuffles into the deck it was built for", () => {
    expect(
      Result.map(deckFromBytes(bytesForDeck("Ah As Kd")), (deck) =>
        deck.slice(0, 3)
      )
    ).toStrictEqual(Result.succeed(cards("Ah As Kd")));
  });
});
