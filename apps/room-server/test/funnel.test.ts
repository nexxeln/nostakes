import { describe, expect, it } from "@effect/vitest";
import { Duration, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  funnelLines,
  funnelOf,
  groupPoints,
  healthLines,
  reportedLines,
} from "../scripts/funnel.ts";
import { ClientReportSchema, reportMeasure } from "../src/client-reports.js";
import { MEASURES, measure, pointOf, SITE_SCOPE } from "../src/measures.js";
import type { Measure, StampedPoint } from "../src/measures.js";

const HOUR = Duration.toMillis(Duration.hours(1));

const DAY = Duration.toMillis(Duration.days(1));

const T0 = 1_793_642_400_000;

const stamp = (scope: string, at: number, measured: Measure): StampedPoint => ({
  at,
  point: pointOf(scope, measured),
});

const deviceHash = (letter: string) => letter.repeat(22);

const night = (
  room: string,
  openedAt: number,
  devices: readonly string[],
  seated: number,
  hands: number,
  players: number,
  settled: boolean
) => [
  stamp(room, openedAt, measure("RoomOpened", { rules: "" })),
  ...devices.map((device, index) =>
    stamp(
      room,
      openedAt + index,
      measure("MemberJoined", {
        device: deviceHash(device),
        members: index + 1,
      })
    )
  ),
  ...Array.from({ length: seated }, (_, index) =>
    stamp(
      room,
      openedAt + 100 + index,
      measure("SeatTaken", { players: index + 1, seated: index + 1 })
    )
  ),
  ...(hands > 0
    ? [
        stamp(
          room,
          openedAt + 60_000,
          measure("FirstHand", { players, sinceOpenMs: 60_000 })
        ),
      ]
    : []),
  ...Array.from({ length: hands }, (_, index) =>
    stamp(
      room,
      openedAt + 60_000 + index * 1000,
      measure("HandFinished", {
        deal: "Checked",
        ending: index % 2 === 0 ? "Showdown" : "Uncontested",
        hand: index + 1,
        players,
      })
    )
  ),
  ...(settled
    ? [
        stamp(
          room,
          openedAt + 2 * HOUR,
          measure("NightSettled", {
            durationMs: 2 * HOUR,
            hands,
            players,
            rules: "",
            transfers: 2,
          })
        ),
      ]
    : []),
];

const points: readonly StampedPoint[] = [
  ...night("room0000000000r1", T0, ["a", "b", "c"], 3, 25, 3, true),
  ...night("room0000000000r2", T0 + HOUR, ["a", "b"], 2, 5, 2, false),
  ...night("room0000000000r3", T0 + 3 * DAY, ["a", "b", "d"], 3, 30, 3, true),
  ...night("room0000000000r4", T0 + DAY, ["e"], 1, 0, 0, false),
  ...night("room0000000000r5", T0 + 1.5 * DAY, ["f", "g"], 2, 1, 2, false),
  stamp(SITE_SCOPE, T0, measure("PageVisit", { page: "Home", source: "x" })),
  stamp(
    SITE_SCOPE,
    T0 + 1,
    measure("PageVisit", { page: "Home", source: "hn" })
  ),
  stamp(
    SITE_SCOPE,
    T0 + 2,
    measure("PageVisit", { page: "Invite", source: "none" })
  ),
  stamp(
    SITE_SCOPE,
    T0 + 3,
    measure("PageVisit", { page: "Home", source: "x" })
  ),
  stamp(
    "room0000000000r1",
    T0 + 5,
    measure("SocketClosed", { reason: "ClientOutdated" })
  ),
  stamp(
    "room0000000000r1",
    T0 + 6,
    measure("SocketClosed", { reason: "ClosedByClient" })
  ),
  stamp(
    "room0000000000r1",
    T0 + 7,
    measure("SocketClosed", { reason: "ClosedByClient" })
  ),
  stamp(
    "room0000000000r2",
    T0 + 8,
    measure("RulesChanged", { rules: "table.ante,turnSeconds" })
  ),
  stamp(
    "room0000000000r1",
    T0 + 9,
    measure("RulesChanged", { rules: "turnSeconds" })
  ),
];

const period = { from: T0 - HOUR, now: T0 + 5 * DAY, to: T0 + 2 * DAY };

describe("the stats report", () => {
  it("counts each step of the funnel once per room opened in the period, and a group as back only on a later day within 14 days", () => {
    const funnel = funnelOf(groupPoints(points, period), period);

    expect({
      created: funnel.created,
      firstHand: funnel.firstHand,
      realNights: funnel.realNights,
      returns: funnel.returns,
      seated: funnel.seated,
      settled: funnel.settled,
      twentyHands: funnel.twentyHands,
      visits: funnel.visits,
    }).toEqual({
      created: 4,
      firstHand: 3,
      realNights: 1,
      returns: { back: 2, groups: 3, tooRecent: 1 },
      seated: 3,
      settled: 1,
      twentyHands: 1,
      visits: 4,
    });
  });

  it("prints the same short plain lines for the same data", () => {
    const funnel = funnelOf(groupPoints(points, period), period);

    expect([
      ...funnelLines(funnel),
      ...healthLines(funnel),
      ...reportedLines(funnel),
    ]).toEqual([
      "funnel",
      "  visits               4 (home 3, invite 1)",
      "  home came from       x 2, hn 1",
      "  invite came from     none 1",
      "  rooms created        4",
      "  2+ seated            3",
      "  first hand           3",
      "  20+ hands            1",
      "  settled              1",
      "  group back in 14d    2 of 3 group rooms (67%), 1 too recent to tell",
      "  real nights          1 (20+ hands, one dealt to 3+ players)",
      "  first hand after     median 1m 0s",
      "  hands per room       median 5",
      "  hands dealt          31: Checked 31",
      "  7-2 bounties         0",
      "  abandoned            0",
      "  rules changed        turnSeconds 2, table.ante 1",
      "health, measured by the server",
      "  reconnects           0",
      "  sockets closed       3: ClosedByClient 2, ClientOutdated 1",
      "  outdated clients     1",
      "  quiet / resumed      0 / 0",
      "  stalled / cleared    0 / 0",
      "  beacon outages       0",
      "  members removed      0",
      "  refused alarms       0",
      "  rate limited         0",
      "  server faults        0",
      "reported by pages, unverified: anyone can send these",
      "  client errors        0",
      "  deck checks failed   0",
      "  forced reloads       0",
      "  reconnects           0",
      "  guide steps          0",
      "  guide took           0",
    ]);
  });

  it("keeps what pages report apart from what the server measured, so forged reports move no health or funnel line", () => {
    const forged = [
      stamp(SITE_SCOPE, T0 + 20, measure("DeckCheckFailed", { build: "b1" })),
      stamp(SITE_SCOPE, T0 + 21, measure("DeckCheckFailed", { build: "b1" })),
      stamp(
        SITE_SCOPE,
        T0 + 22,
        measure("ClientError", {
          build: "b1",
          message: "boom",
          name: "TypeError",
          screen: "Room",
        })
      ),
      stamp(
        SITE_SCOPE,
        T0 + 23,
        measure("ClientReconnects", { build: "b1", reconnects: 40 })
      ),
      stamp(SITE_SCOPE, T0 + 24, measure("GuideStep", { step: "Started" })),
      stamp(SITE_SCOPE, T0 + 25, measure("GuideStep", { step: "Started" })),
      stamp(SITE_SCOPE, T0 + 26, measure("GuideStep", { step: "Finished" })),
      stamp(SITE_SCOPE, T0 + 27, measure("GuideTook", { took: "1to2m" })),
    ];

    const honest = funnelOf(groupPoints(points, period), period);

    const flooded = funnelOf(
      groupPoints([...points, ...forged], period),
      period
    );

    expect([
      funnelLines(flooded),
      healthLines(flooded),
      reportedLines(flooded).slice(1),
    ]).toStrictEqual([
      funnelLines(honest),
      healthLines(honest),
      [
        "  client errors        1: TypeError 1",
        "  deck checks failed   2",
        "  forced reloads       0",
        "  reconnects           40",
        "  guide steps          3: Started 2, Finished 1",
        "  guide took           1: 1to2m 1",
      ],
    ]);
  });

  it("reads the guide's two reports as the page writes them", () => {
    const decode = Schema.decodeUnknownSync(
      Schema.fromJsonString(ClientReportSchema)
    );

    expect(
      [
        '{"_tag":"GuideStep","step":"Hand3"}',
        '{"_tag":"GuideTook","took":"1to2m"}',
      ].map((text) => reportMeasure(decode(text)))
    ).toStrictEqual([
      measure("GuideStep", { step: "Hand3" }),
      measure("GuideTook", { took: "1to2m" }),
    ]);
  });

  it.prop(
    "files every report a page can send under a kind measured by pages",
    { report: Arbitrary.schema(ClientReportSchema) },
    ({ report }) => {
      expect(MEASURES[reportMeasure(report).kind].from).toBe("Page");
    }
  );
});
