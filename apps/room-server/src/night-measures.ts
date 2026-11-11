import type { Event as TableEvent } from "@nostakes/engine";
import { RoomSettingsSchema } from "@nostakes/room";
import type { RoomEvent, RoomSettings } from "@nostakes/room";
import { Match, Option, Predicate, Schema } from "effect";

import type { RoomMeasures } from "./analytics.js";
import { measure } from "./measures.js";
import type { Measure, MeasureKind } from "./measures.js";
import { DEFAULT_SETTINGS } from "./poker-room.js";
import type { PokerTypes } from "./poker-room.js";

interface HandTally {
  readonly number: number;
  readonly players: number;
  readonly showdown: boolean;
}

export interface NightTally {
  readonly openedAt: Option.Option<number>;
  readonly lastAt: number;
  readonly settings: RoomSettings;
  readonly members: number;
  readonly seated: ReadonlySet<number>;
  readonly sat: ReadonlySet<string>;
  readonly hands: number;
  readonly hand: Option.Option<HandTally>;
  readonly checkedHand: Option.Option<number>;
  readonly dealt: boolean;
  readonly closed: boolean;
}

export const emptyNight: NightTally = {
  checkedHand: Option.none(),
  closed: false,
  dealt: false,
  hand: Option.none(),
  hands: 0,
  lastAt: 0,
  members: 0,
  openedAt: Option.none(),
  sat: new Set(),
  seated: new Set(),
  settings: DEFAULT_SETTINGS,
};

type Step = readonly [NightTally, readonly Measure[]];

const still = (tally: NightTally): Step => [tally, []];

const RULE_DEPTH = 2;

const encodeSettings = Schema.encodeSync(
  Schema.toCodecJson(RoomSettingsSchema)
);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

const leaves = (
  value: Schema.Json,
  path: readonly string[]
): readonly (readonly [string, string])[] =>
  isJsonObject(value)
    ? Object.keys(value).flatMap((key) =>
        leaves(value[key] ?? null, [...path, key])
      )
    : [[path.join("."), JSON.stringify(value)]];

export const changedRules = (before: RoomSettings, after: RoomSettings) => {
  const was = new Map(leaves(encodeSettings(before), []));
  const now = new Map(leaves(encodeSettings(after), []));

  const changed = [...new Set([...was.keys(), ...now.keys()])].flatMap((path) =>
    was.get(path) === now.get(path)
      ? []
      : [path.split(".").slice(0, RULE_DEPTH).join(".")]
  );

  return [...new Set(changed)].toSorted().join(",");
};

const sinceOpen = (tally: NightTally, at: number) =>
  Option.match(tally.openedAt, {
    onNone: () => 0,
    onSome: (opened) => at - opened,
  });

const rulesChanged = (tally: NightTally, settings: RoomSettings): Step => {
  const rules = changedRules(tally.settings, settings);
  const next = { ...tally, settings };

  return rules === ""
    ? still(next)
    : [next, [measure("RulesChanged", { rules })]];
};

const seatTaken = (tally: NightTally, player: string, seat: number): Step => {
  if (tally.seated.has(seat)) {
    return still(tally);
  }

  const seated = new Set(tally.seated).add(seat);
  const sat = new Set(tally.sat).add(player);

  return [
    { ...tally, sat, seated },
    [measure("SeatTaken", { players: sat.size, seated: seated.size })],
  ];
};

const seatLeft = (tally: NightTally, seat: number): Step =>
  still({
    ...tally,
    seated: new Set([...tally.seated].filter((taken) => taken !== seat)),
  });

const onTable = (tally: NightTally, event: TableEvent, at: number): Step =>
  Match.value(event).pipe(
    Match.tag("PlayerSat", ({ player, seat }) =>
      seatTaken(tally, player, seat)
    ),
    Match.tag("PlayerStood", ({ seat }) => seatLeft(tally, seat)),
    Match.tag("HandStarted", ({ dealtIn, handNumber }): Step => {
      const hand = {
        number: handNumber,
        players: dealtIn.length,
        showdown: false,
      };

      return [
        { ...tally, dealt: true, hand: Option.some(hand) },
        tally.dealt
          ? []
          : [
              measure("FirstHand", {
                players: dealtIn.length,
                sinceOpenMs: sinceOpen(tally, at),
              }),
            ],
      ];
    }),
    Match.tag("ShowdownReached", () =>
      still({
        ...tally,
        hand: tally.hand.pipe(
          Option.map((hand) => ({ ...hand, showdown: true }))
        ),
      })
    ),
    Match.tag("HandEnded", ({ handNumber }): Step => {
      const hand = tally.hand.pipe(
        Option.filter(({ number }) => number === handNumber),
        Option.getOrElse(() => ({
          number: handNumber,
          players: 0,
          showdown: false,
        }))
      );

      return [
        { ...tally, hand: Option.none(), hands: tally.hands + 1 },
        [
          measure("HandFinished", {
            deal: Option.contains(tally.checkedHand, handNumber)
              ? "Checked"
              : "Plain",
            ending: hand.showdown ? "Showdown" : "Uncontested",
            hand: handNumber,
            players: hand.players,
          }),
        ],
      ];
    }),
    Match.tag("RulesChanged", ({ config }) =>
      rulesChanged(tally, { ...tally.settings, table: config })
    ),
    Match.tag("BountyPaid", ({ payers }): Step => [
      tally,
      [measure("BountyPaid", { payers: payers.length })],
    ]),
    Match.orElse(() => still(tally))
  );

const onRoom = (
  tally: NightTally,
  event: RoomEvent,
  device: Option.Option<string>
): Step =>
  Match.value(event).pipe(
    Match.tag("RoomOpened", ({ at, settings }): Step => [
      { ...tally, openedAt: Option.some(at), settings },
      [
        measure("RoomOpened", {
          rules: changedRules(DEFAULT_SETTINGS, settings),
        }),
      ],
    ]),
    Match.tag("MemberJoined", (): Step => {
      const members = tally.members + 1;

      return [
        { ...tally, members },
        [
          measure("MemberJoined", {
            device: Option.getOrElse(device, () => ""),
            members,
          }),
        ],
      ];
    }),
    Match.tag("BoughtIn", ({ player, seat }) => seatTaken(tally, player, seat)),
    Match.tag("CashedOut", ({ seat }) => seatLeft(tally, seat)),
    Match.tag("MemberLeft", () =>
      still({ ...tally, members: Math.max(0, tally.members - 1) })
    ),
    Match.tag("MemberRemoved", (): Step => {
      const members = Math.max(0, tally.members - 1);

      return [{ ...tally, members }, [measure("MemberRemoved", { members })]];
    }),
    Match.tag("GameStarted", ({ at }): Step => [
      tally,
      [measure("GameStarted", { sinceOpenMs: sinceOpen(tally, at) })],
    ]),
    Match.tag("SettingsChanged", ({ settings }) =>
      rulesChanged(tally, settings)
    ),
    Match.tag("DealtFromBeacon", ({ hand }) =>
      still({ ...tally, checkedHand: Option.some(hand) })
    ),
    Match.tag("DealtWithoutBeacon", ({ hand }): Step => [
      { ...tally, checkedHand: Option.some(hand) },
      [measure("BeaconOutage", {})],
    ]),
    Match.tag("RoomClosed", ({ at, settlement }): Step => [
      { ...tally, closed: true },
      [
        measure("NightSettled", {
          durationMs: sinceOpen(tally, at),
          hands: tally.hands,
          players: tally.sat.size,
          rules: changedRules(DEFAULT_SETTINGS, tally.settings),
          transfers: settlement.transfers.length,
        }),
      ],
    ]),
    Match.tag("TableWentQuiet", (): Step => [
      tally,
      [measure("TableQuiet", {})],
    ]),
    Match.tag("TableAttended", ({ at, quietSince }) =>
      Option.match(quietSince, {
        onNone: () => still(tally),
        onSome: (since): Step => [
          tally,
          [measure("TableResumed", { quietMs: at - since })],
        ],
      })
    ),
    Match.tag("TableStalled", ({ deadline }): Step => [
      tally,
      [measure("TableStalled", { deadline: deadline._tag })],
    ]),
    Match.tag("StallCleared", (): Step => [
      tally,
      [measure("StallCleared", {})],
    ]),
    Match.tag("Table", ({ at, event: played }) => onTable(tally, played, at)),
    Match.orElse(() => still(tally))
  );

export const measureNightEvent = (
  tally: NightTally,
  event: RoomEvent,
  device: Option.Option<string>
): Step => onRoom({ ...tally, lastAt: event.at }, event, device);

export const abandonedNight = (tally: NightTally): Option.Option<Measure> =>
  tally.closed
    ? Option.none()
    : tally.openedAt.pipe(
        Option.map((openedAt) =>
          measure("NightAbandoned", {
            durationMs: tally.lastAt - openedAt,
            hands: tally.hands,
            players: tally.sat.size,
            rules: changedRules(DEFAULT_SETTINGS, tally.settings),
          })
        )
      );

export const NIGHT_KINDS: ReadonlySet<MeasureKind> = new Set<MeasureKind>([
  "BeaconOutage",
  "BountyPaid",
  "FirstHand",
  "GameStarted",
  "HandFinished",
  "MemberJoined",
  "MemberRemoved",
  "NightAbandoned",
  "NightSettled",
  "RoomOpened",
  "RulesChanged",
  "SeatTaken",
  "StallCleared",
  "TableQuiet",
  "TableResumed",
  "TableStalled",
]);

export const nightMeasures: RoomMeasures<PokerTypes["Event"], NightTally> = {
  abandoned: abandonedNight,
  empty: emptyNight,
  measure: measureNightEvent,
};
