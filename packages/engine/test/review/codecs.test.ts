import { describe, expect, it } from "@effect/vitest";
import { Effect, Equal, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  CommandSchema,
  Commands,
  EventSchema,
  RejectionSchema,
  decide,
} from "../../src/index.js";
import type { Command, Event, Rejection } from "../../src/index.js";
import {
  baseConfig,
  calls,
  checks,
  chipCount,
  deckStartingWith,
  folds,
  occupiedTable,
  play,
  runAll,
  seat,
  shownCards,
  startHand,
} from "../fixtures.js";
import { playSession, session } from "../sessions.js";

const commandJson = Schema.toCodecJson(CommandSchema);

const eventJson = Schema.toCodecJson(EventSchema);

const rejectionJson = Schema.toCodecJson(RejectionSchema);

const commandText = (command: Command) =>
  JSON.stringify(Schema.encodeSync(commandJson)(command));

const eventText = (event: Event) =>
  JSON.stringify(Schema.encodeSync(eventJson)(event));

const rejectionText = (rejection: Rejection) =>
  JSON.stringify(Schema.encodeSync(rejectionJson)(rejection));

const isCommand = Schema.is(CommandSchema);

const foldedOut = play(
  startHand(
    occupiedTable(baseConfig, { 0: 100, 1: 100, 2: 100 }),
    deckStartingWith("As Ks Qs Js Ts 9s")
  ).state,
  [
    [0, folds],
    [1, folds],
  ]
).state;

const huntedTwice = runAll(
  play(
    startHand(
      occupiedTable(
        { ...baseConfig, rabbitHunt: true },
        { 0: 100, 1: 100, 2: 100 }
      ),
      deckStartingWith("As Ks Qs Js Ts 9s")
    ).state,
    [
      [0, folds],
      [1, folds],
    ]
  ).state,
  [Commands.RabbitHunt({ seat: seat(0) })]
).state;

const tiedAtShowdown = runAll(
  play(
    startHand(
      occupiedTable(
        { ...baseConfig, showdown: "Interactive" },
        { 0: 100, 1: 100 }
      ),
      deckStartingWith("2c 3c 4d 5d As Ks Qs Js Ts")
    ).state,
    [
      [0, calls],
      [1, checks],
      [1, checks],
      [0, checks],
      [1, checks],
      [0, checks],
      [1, checks],
      [0, checks],
    ]
  ).state,
  [Commands.TableHand({ seat: seat(1) })]
).state;

const decodeCommand = Schema.decodeResult(Schema.fromJsonString(commandJson));

const decodeEvent = Schema.decodeResult(Schema.fromJsonString(eventJson));

const decodeRejection = Schema.decodeResult(
  Schema.fromJsonString(rejectionJson)
);

const roundTrips = <A>(
  original: A,
  text: string,
  decode: (input: string) => Result.Result<A, Schema.SchemaError>,
  encode: (value: A) => string
) =>
  Result.match(decode(text), {
    onFailure: () => false,
    onSuccess: (back) => Equal.equals(back, original) && encode(back) === text,
  });

const traffic = (
  source: typeof session extends Arbitrary.Arbitrary<infer A> ? A : never
) => {
  const played = playSession(source);

  return {
    commands: played.steps
      .map((step) => step.command)
      .filter((command) => isCommand(command)),
    events: played.events,
    rejections: played.steps.flatMap((step) =>
      Result.match(decide(step.before, step.command), {
        onFailure: (rejection) => [rejection],
        onSuccess: () => [],
      })
    ),
  };
};

const tags = (values: readonly { readonly _tag: string }[]) =>
  [...new Set(values.map((value) => value._tag))].toSorted();

const brokenRoundTrips = (sample: ReturnType<typeof traffic>) => [
  ...sample.commands
    .filter(
      (command) =>
        !roundTrips(command, commandText(command), decodeCommand, commandText)
    )
    .map((command) => `command ${command._tag}`),
  ...sample.events
    .filter(
      (event) => !roundTrips(event, eventText(event), decodeEvent, eventText)
    )
    .map((event) => `event ${event._tag}`),
  ...sample.rejections
    .filter(
      (rejection) =>
        !roundTrips(
          rejection,
          rejectionText(rejection),
          decodeRejection,
          rejectionText
        )
    )
    .map((rejection) => `rejection ${rejection._tag}`),
];

const fullDeck = Array.from({ length: 52 }, (_, card) => card);

const deckOf51 = JSON.stringify(fullDeck.slice(1));

const deckWithTwin = JSON.stringify([0, ...fullDeck.slice(1, 51), 0]);

const deckWith52 = JSON.stringify([...fullDeck.slice(0, 51), 52]);

const rules = (change: string) =>
  `{"_tag":"ChangeRules","config":{"ante":{"_tag":"NoAnte"},"bigBlind":10,"maxRuns":2,"rabbitHunt":true,"showdown":"Interactive","smallBlind":5,"straddle":{"button":true,"underTheGun":2},${change}}}`;

describe("JSON codecs for phase 2 storage and transport", () => {
  it.prop(
    "every command, event, and rejection of a generated session survives encode, JSON text, and decode unchanged",
    { source: session },
    ({ source }) => {
      expect(brokenRoundTrips(traffic(source))).toStrictEqual([]);
    }
  );

  it.effect(
    "the round-tripped sample covers every command tag, every event tag, and the common rejections",
    () =>
      Effect.gen(function* coverEveryTag() {
        const sources = yield* Arbitrary.sampleEffect(session, {
          count: 40,
          seed: 20_261_110,
        });

        const samples = sources.map(traffic);

        expect(samples.flatMap(brokenRoundTrips)).toStrictEqual([]);
        expect(
          tags(samples.flatMap((sample) => sample.commands))
        ).toStrictEqual([
          "Act",
          "AddChips",
          "ChangeRules",
          "ChooseRuns",
          "MuckHand",
          "RabbitHunt",
          "SetSittingOut",
          "ShowCards",
          "SitDown",
          "StandUp",
          "StartHand",
          "TableHand",
        ]);
        expect(tags(samples.flatMap((sample) => sample.events))).toStrictEqual([
          "AntePosted",
          "BlindPosted",
          "Called",
          "CardsShown",
          "Checked",
          "ChipsAdded",
          "Folded",
          "HandEnded",
          "HandMucked",
          "HandStarted",
          "HandTabled",
          "HandsTabled",
          "HoleCardsDealt",
          "PlayerSat",
          "PlayerStood",
          "PotAwarded",
          "RabbitHunted",
          "RaisedTo",
          "RulesChanged",
          "RunsAgreed",
          "RunsChosen",
          "ShowdownReached",
          "ShowdownStarted",
          "SittingOutChanged",
          "StraddlePosted",
          "StreetDealt",
          "UncalledBetReturned",
        ]);

        const rare = [
          decide(
            occupiedTable(baseConfig, { 0: 100, 1: 100 }),
            Commands.AddChips({ amount: chipCount(0), seat: seat(0) })
          ),
          decide(
            foldedOut,
            Commands.ShowCards({ cards: shownCards("2h"), seat: seat(1) })
          ),
          decide(huntedTwice, Commands.RabbitHunt({ seat: seat(1) })),
          decide(tiedAtShowdown, Commands.MuckHand({ seat: seat(0) })),
        ].flatMap((decision) =>
          Result.match(decision, {
            onFailure: (rejection) => [rejection],
            onSuccess: () => [],
          })
        );

        const rejections = [
          ...samples.flatMap((sample) => sample.rejections),
          ...rare,
        ];

        expect(
          brokenRoundTrips({ commands: [], events: [], rejections })
        ).toStrictEqual([]);
        expect(tags(rejections)).toStrictEqual([
          "AmountNotPositive",
          "CardAlreadyPublic",
          "CardNotHeld",
          "HandInProgress",
          "IllegalAction",
          "NoBettingRound",
          "NoRunChoiceOwed",
          "NoShowdownChoiceOwed",
          "NotEnoughPlayers",
          "NotInLastHand",
          "NotYourTurn",
          "NothingToHunt",
          "PlayerAlreadySeated",
          "RabbitAlreadyHunted",
          "RabbitHuntOff",
          "RunsOutOfRange",
          "SeatEmpty",
          "SeatInHand",
          "SeatTaken",
          "StraddleNotAllowed",
          "WinningHandMustTable",
        ]);
      })
  );

  it("refuses hostile JSON text at the boundary: bad chips, seats, decks, cards, configs, run counts, and unknown tags", () => {
    const hostileCommands: readonly (readonly [string, string])[] = [
      ["negative top-up", '{"_tag":"AddChips","amount":-1,"seat":0}'],
      ["fractional top-up", '{"_tag":"AddChips","amount":1.5,"seat":0}'],
      [
        "top-up above the safe range",
        '{"_tag":"AddChips","amount":9007199254740992,"seat":0}',
      ],
      ["top-up as text", '{"_tag":"AddChips","amount":"10","seat":0}'],
      ["top-up of null", '{"_tag":"AddChips","amount":null,"seat":0}'],
      ["seat 9", '{"_tag":"SitDown","buyIn":100,"player":"p","seat":9}'],
      ["seat -1", '{"_tag":"StandUp","seat":-1}'],
      ["empty player", '{"_tag":"SitDown","buyIn":100,"player":"","seat":0}'],
      ["deck of 51", `{"_tag":"StartHand","deck":${deckOf51},"straddles":[]}`],
      [
        "deck with a duplicate",
        `{"_tag":"StartHand","deck":${deckWithTwin},"straddles":[]}`,
      ],
      [
        "deck with card 52",
        `{"_tag":"StartHand","deck":${deckWith52},"straddles":[]}`,
      ],
      [
        "straddle from seat 9",
        `{"_tag":"StartHand","deck":${JSON.stringify(fullDeck)},"straddles":[9]}`,
      ],
      [
        "negative raise",
        '{"_tag":"Act","action":{"_tag":"RaiseTo","to":-5},"seat":0}',
      ],
      [
        "fractional raise",
        '{"_tag":"Act","action":{"_tag":"RaiseTo","to":2.5},"seat":0}',
      ],
      [
        "unknown action",
        '{"_tag":"Act","action":{"_tag":"Bet","to":20},"seat":0}',
      ],
      ["unknown command", '{"_tag":"Rebuy","seat":0}'],
      ["no runs", '{"_tag":"ChooseRuns","runs":0,"seat":0}'],
      ["fractional runs", '{"_tag":"ChooseRuns","runs":1.5,"seat":0}'],
      ["show no card", '{"_tag":"ShowCards","cards":[],"seat":0}'],
      ["show three cards", '{"_tag":"ShowCards","cards":[1,2,3],"seat":0}'],
      ["show one card twice", '{"_tag":"ShowCards","cards":[4,4],"seat":0}'],
      ["show card 52", '{"_tag":"ShowCards","cards":[52],"seat":0}'],
      ["small blind above big blind", rules('"smallBlind":20')],
      ["zero big blind", rules('"bigBlind":0,"smallBlind":0')],
      ["zero runs", rules('"maxRuns":0')],
      ["ten runs", rules('"maxRuns":10')],
      ["zero ante", rules('"ante":{"_tag":"EveryPlayer","amount":0}')],
      ["unknown ante", rules('"ante":{"_tag":"Straddle","amount":5}')],
      ["seven straddles", rules('"straddle":{"button":true,"underTheGun":7}')],
      ["unknown showdown", rules('"showdown":"Blind"')],
      ["table from seat 9", '{"_tag":"TableHand","seat":9}'],
      ["muck with no seat", '{"_tag":"MuckHand"}'],
      ["not JSON", '{"_tag":"StandUp",'],
    ];

    const hostileEvents: readonly (readonly [string, string])[] = [
      [
        "negative pot",
        '{"_tag":"PotAwarded","amount":-1,"eligible":[0],"pot":1,"run":1,"winners":[]}',
      ],
      [
        "deck of 51 in HandStarted",
        `{"_tag":"HandStarted","bigBlindSeat":1,"button":0,"dealtIn":[0,1],"deck":${deckOf51},"handNumber":1,"smallBlindSeat":0}`,
      ],
      [
        "board card 52",
        '{"_tag":"StreetDealt","cards":[52],"run":1,"street":"Flop"}',
      ],
      [
        "hole cards for seat 9",
        '{"_tag":"HoleCardsDealt","cards":[0,1],"seat":9}',
      ],
      [
        "unknown street",
        '{"_tag":"StreetDealt","cards":[0],"run":1,"street":"Fifth"}',
      ],
      ["unknown event", '{"_tag":"PotStolen","seat":0}'],
    ];

    const hostileRejections: readonly (readonly [string, string])[] = [
      ["unknown rejection", '{"_tag":"TooRich","seat":0}'],
      ["rejection for seat 9", '{"_tag":"SeatEmpty","seat":9}'],
    ];

    const accepted = [
      ...hostileCommands.filter(([, text]) =>
        Result.isSuccess(decodeCommand(text))
      ),
      ...hostileEvents.filter(([, text]) =>
        Result.isSuccess(decodeEvent(text))
      ),
      ...hostileRejections.filter(([, text]) =>
        Result.isSuccess(decodeRejection(text))
      ),
    ].map(([name]) => name);

    expect(accepted).toStrictEqual([]);
    expect([
      Result.isSuccess(decodeCommand(rules('"maxRuns":9'))),
      Result.isSuccess(
        decodeCommand(
          `{"_tag":"StartHand","deck":${JSON.stringify(fullDeck)},"straddles":[3]}`
        )
      ),
      Result.isSuccess(
        decodeEvent(
          '{"_tag":"StreetDealt","cards":[0,1,2],"run":1,"street":"Flop"}'
        )
      ),
      Result.isSuccess(decodeRejection('{"_tag":"SeatEmpty","seat":8}')),
    ]).toStrictEqual([true, true, true, true]);
  });
});
