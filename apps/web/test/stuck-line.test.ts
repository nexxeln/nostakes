import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema } from "@nostakes/protocol";
import { RoomViewSchema, millis } from "@nostakes/room";
import { Option } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  STUCK_LINE,
  serverNowOf,
  stuckLine,
  takeOverLine,
} from "../src/features/stuck-line.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

const ANA = PlayerIdSchema.make("player-00000000a");

const BEN = PlayerIdSchema.make("player-0000000be");

const LEFT_AT = 1000;

const CLAIMABLE_AT = 121_000;

const hostGone = (table: OpenView, you: Option.Option<typeof ANA>) => ({
  ...table,
  host: ANA,
  hostAway: Option.some({
    claimableAt: millis(CLAIMABLE_AT),
    since: millis(LEFT_AT),
  }),
  members: [
    { avatar: "fox", name: "Ana", player: ANA },
    { avatar: "owl", name: "Ben", player: BEN },
  ],
  you,
});

describe("the line about a stuck table", () => {
  it.prop(
    "shows exactly while the room is stalled, and says anyone can end the night",
    { table: tables },
    ({ table }) => {
      expect(stuckLine(table)).toStrictEqual(
        Option.isSome(table.stalled) ? Option.some(STUCK_LINE) : Option.none()
      );
    }
  );
});

describe("the offer to take over from a host who is gone", () => {
  it.prop(
    "appears to every other member from the moment the room allows a claim, and never to the host or a spectator",
    { table: tables },
    ({ table }) => {
      expect([
        takeOverLine(hostGone(table, Option.some(BEN)), CLAIMABLE_AT - 1),
        takeOverLine(hostGone(table, Option.some(BEN)), CLAIMABLE_AT),
        takeOverLine(hostGone(table, Option.some(ANA)), CLAIMABLE_AT),
        takeOverLine(hostGone(table, Option.none()), CLAIMABLE_AT),
        takeOverLine(
          { ...hostGone(table, Option.some(BEN)), hostAway: Option.none() },
          CLAIMABLE_AT
        ),
      ]).toStrictEqual([
        Option.none(),
        Option.some(
          "Ana has been gone for two minutes. Anyone here can take over as host."
        ),
        Option.none(),
        Option.none(),
        Option.none(),
      ]);
    }
  );

  it("counts from the server's time, by the largest lead any recent update showed", () => {
    expect([
      serverNowOf([], 5000),
      serverNowOf([-40, 120, 7], 5000),
    ]).toStrictEqual([5000, 5120]);
  });
});
