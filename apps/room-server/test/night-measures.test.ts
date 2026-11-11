import { describe, expect, it } from "@effect/vitest";
import { Actions, SeatIndexSchema } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { PlayerIdSchema } from "@nostakes/protocol";
import { RoomEventSchema, RoomViews } from "@nostakes/room";
import type { RoomEvent, RoomView } from "@nostakes/room";
import { Option, Predicate, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { measureAll } from "../src/analytics.js";
import { pointOf } from "../src/measures.js";
import type { Measure } from "../src/measures.js";
import { nightMeasures } from "../src/night-measures.js";
import { DEFAULT_SETTINGS, MemberCommandSchema } from "../src/poker-room.js";
import type { MemberCommand, PokerTypes } from "../src/poker-room.js";
import type { CommitResult } from "../src/room-host.js";
import {
  ana,
  ben,
  cy,
  openPokerHost,
  POKER_HOST_CODE,
} from "./fixtures/poker-host.js";

const Commands = MemberCommandSchema.cases;

const ROOM_KEY = "0123456789abcdef";

const OTHER_CODE = "Q9W3RT";

const welcomeView = (
  room: ReturnType<typeof openPokerHost>,
  player: PlayerId,
  at: number
): Option.Option<RoomView> => {
  const frame = room.decodeFrame(room.welcome(player, Option.none(), at));

  return room.host.codec.server.guards.Welcome(frame)
    ? Option.some(frame.view)
    : Option.none();
};

const toActIn = (view: Option.Option<RoomView>) =>
  view.pipe(
    Option.filter(RoomViews.$is("Open")),
    Option.flatMap((open) =>
      open.hand.pipe(
        Option.flatMap((hand) => hand.toAct),
        Option.flatMap((seat) =>
          Option.fromUndefinedOr(open.seats[seat]).pipe(
            Option.flatMap((seated) => seated.occupant),
            Option.map((occupant) => occupant.player)
          )
        )
      )
    )
  );

const sit = (seat: number): MemberCommand =>
  Commands.RequestSeat.make({
    buyIn: DEFAULT_SETTINGS.buyIn.min,
    seat: SeatIndexSchema.make(seat),
  });

const NameText = Schema.String.check(Schema.isPattern(/^zq[a-z]{6,12}$/u));

const AvatarText = Schema.String.check(Schema.isPattern(/^av[a-z]{8,12}$/u));

const MOVES = [
  "Act",
  "Act",
  "Act",
  "Act",
  "Tick",
  "Tick",
  "Sit",
  "Stand",
  "Leave",
  "Rejoin",
  "Show",
  "Muck",
  "Settings",
  "Start",
] as const;

const Step = Schema.Struct({
  actor: Schema.Literals([0, 1, 2]),
  move: Schema.Literals(MOVES),
  pick: Schema.Literals([0, 1, 2, 3]),
});

const Night = Schema.Struct({
  avatars: Schema.Tuple([AvatarText, AvatarText, AvatarText]),
  names: Schema.Tuple([NameText, NameText, NameText]),
  steps: Schema.Array(Step).check(Schema.isMaxLength(80)),
});

type GeneratedNight = typeof Night.Type;

const PLAYERS = [ana, ben, cy] as const;

const TICK_MS = 7000;

const playGenerated = (generated: GeneratedNight) => {
  const [hostName, benName, cyName] = generated.names;
  const [hostAvatar, benAvatar, cyAvatar] = generated.avatars;

  const room = openPokerHost({
    avatar: hostAvatar,
    name: hostName,
    settings: { ...DEFAULT_SETTINGS, shuffle: "Plain" },
  });

  const batches: (readonly RoomEvent[])[] = [room.opened];
  let at = 1000;
  let id = 0;

  const keep = (result: CommitResult<PokerTypes>) => {
    batches.push(result.events);
  };

  const send = (player: PlayerId, command: MemberCommand) => {
    at += 50;
    id += 1;
    keep(room.send(player, `c${id}`, at, command));
  };

  const tick = (ms: number) => {
    at += ms;

    for (let due = room.runDue(at); Option.isSome(due); due = room.runDue(at)) {
      keep(due.value);
    }
  };

  const toAct = () => toActIn(welcomeView(room, ana, at));

  keep(room.join(ben, (at += 10), benName, benAvatar));
  keep(room.join(cy, (at += 10), cyName, cyAvatar));
  send(ana, sit(0));
  send(ben, sit(1));
  send(cy, sit(2));
  send(ana, Commands.StartGame.make({}));
  tick(10);

  for (const { actor, move, pick } of generated.steps) {
    const player = PLAYERS[actor] ?? ana;

    if (move === "Act") {
      const actions = [
        Actions.Fold(),
        Actions.Check(),
        Actions.Call(),
        Actions.Call(),
      ];

      for (const acting of Option.toArray(toAct())) {
        send(
          acting,
          Commands.Act.make({ action: actions[pick] ?? Actions.Call() })
        );
      }
    } else if (move === "Tick") {
      tick(TICK_MS * (pick + 1));
    } else if (move === "Sit") {
      send(player, sit(actor));
    } else if (move === "Stand") {
      send(player, Commands.LeaveSeat.make({}));
    } else if (move === "Leave") {
      send(player, Commands.LeaveRoom.make({}));
    } else if (move === "Rejoin") {
      send(
        player,
        Commands.Join.make({
          avatar: generated.avatars[actor] ?? hostAvatar,
          name: generated.names[actor] ?? hostName,
        })
      );
    } else if (move === "Show") {
      send(player, Commands.TableHand.make({}));
    } else if (move === "Muck") {
      send(player, Commands.MuckHand.make({}));
    } else if (move === "Settings") {
      send(
        ana,
        Commands.ChangeSettings.make({
          settings: {
            ...DEFAULT_SETTINGS,
            shuffle: "Plain",
            turnSeconds: 20 + pick * 5,
          },
        })
      );
    } else {
      send(ana, Commands.StartGame.make({}));
    }
  }

  send(ana, Commands.CloseRoom.make({}));

  for (let round = 0; round < 40; round += 1) {
    for (const acting of Option.toArray(toAct())) {
      send(acting, Commands.Act.make({ action: Actions.Fold() }));
    }

    tick(TICK_MS);
  }

  return batches;
};

const codec = Schema.toCodecJson(RoomEventSchema);

const encodeEvent = Schema.encodeSync(codec);

const decodeEvent = Schema.decodeSync(codec);

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value);

const rewrite = (
  value: Schema.Json,
  key: string,
  leaf: (key: string, value: Schema.Json) => Schema.Json,
  skipped: ReadonlySet<string>
): Schema.Json => {
  if (skipped.has(key)) {
    return value;
  }

  if (isJsonArray(value)) {
    return leaf(
      key,
      value.map((child) => rewrite(child, key, leaf, skipped))
    );
  }

  return isJsonObject(value)
    ? Object.fromEntries(
        Object.keys(value).map((child) => [
          child,
          rewrite(value[child] ?? null, child, leaf, skipped),
        ])
      )
    : leaf(key, value);
};

const DECK = 52;

const CARD_KEYS: ReadonlySet<string> = new Set(["cards", "deck"]);

const CHIP_KEYS: ReadonlySet<string> = new Set([
  "added",
  "amount",
  "boughtIn",
  "buyIn",
  "cashedOut",
  "net",
  "stack",
  "to",
]);

const RULES_KEYS: ReadonlySet<string> = new Set(["config", "settings"]);

const otherCards = (key: string, value: Schema.Json): Schema.Json =>
  CARD_KEYS.has(key) && isJsonArray(value)
    ? value.map((card) => (Predicate.isNumber(card) ? (card + 1) % DECK : card))
    : value;

const otherChips = (key: string, value: Schema.Json): Schema.Json =>
  CHIP_KEYS.has(key) && Predicate.isNumber(value) ? value * 2 : value;

const renamed =
  (names: ReadonlyMap<string, string>) =>
  (_key: string, value: Schema.Json): Schema.Json =>
    Predicate.isString(value) ? (names.get(value) ?? value) : value;

const transformed = (
  batches: readonly (readonly RoomEvent[])[],
  leaf: (key: string, value: Schema.Json) => Schema.Json,
  skipped: ReadonlySet<string> = new Set()
) =>
  batches.map((events) =>
    events.map((event) =>
      decodeEvent(rewrite(encodeEvent(event), "", leaf, skipped))
    )
  );

const measuredNight = (batches: readonly (readonly RoomEvent[])[]) => {
  let tally = nightMeasures.empty;
  const found: Measure[] = [];

  for (const events of batches) {
    const [next, measured] = measureAll(
      nightMeasures,
      tally,
      events,
      Option.none()
    );

    tally = next;
    found.push(...measured);
  }

  return found;
};

describe("the night's data points over generated nights", () => {
  it.prop(
    "never change when the cards, the chips at a seat, or anyone's name, face, id, or room code change, and never contain any of them",
    { night: Arbitrary.schema(Night) },
    ({ night }) => {
      const batches = playGenerated(night);
      const measured = measuredNight(batches);

      expect(measured.some(({ kind }) => kind === "HandFinished")).toBe(true);
      expect(measuredNight(transformed(batches, otherCards))).toEqual(measured);
      expect(
        measuredNight(transformed(batches, otherChips, RULES_KEYS))
      ).toEqual(measured);

      const identities: readonly string[] = [
        ...PLAYERS,
        ...night.names,
        ...night.avatars,
        POKER_HOST_CODE,
      ];

      const players = new Set<string>(PLAYERS);

      const others = new Map(
        identities.map((identity, index) => {
          if (identity === POKER_HOST_CODE) {
            return [identity, OTHER_CODE];
          }

          return [
            identity,
            players.has(identity)
              ? PlayerIdSchema.make(`other${index}`.padEnd(16, "x"))
              : `zqother${"x".repeat(index + 1)}`,
          ];
        })
      );

      expect(measuredNight(transformed(batches, renamed(others)))).toEqual(
        measured
      );

      const blobs = measured.flatMap((each) => pointOf(ROOM_KEY, each).blobs);

      expect(
        identities.filter((identity) =>
          blobs.some((blob) => blob.includes(identity))
        )
      ).toEqual([]);
    },
    { arbitrary: { runs: 25 } }
  );
});
