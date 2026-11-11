import { DateTime, Duration, Option, Schema } from "effect";

import {
  blobPosition,
  doublePosition,
  kindOfPoint,
  MEASURE_KINDS,
  SITE_SCOPE,
} from "../src/measures.ts";
import type { MeasureKind, MeasuredBy, StampedPoint } from "../src/measures.ts";

export const ROOM_KINDS: readonly MeasureKind[] = [
  "FirstHand",
  "GameStarted",
  "HandFinished",
  "MemberJoined",
  "NightAbandoned",
  "NightSettled",
  "RoomOpened",
  "SeatTaken",
];

export const COUNT_KINDS: readonly MeasureKind[] = MEASURE_KINDS.filter(
  (kind) => kind !== "MemberJoined"
);

export const DOUBLES_KEPT = 4;

export const REAL_NIGHT_HANDS = 20;

export const REAL_NIGHT_PLAYERS = 3;

export const SEATED_FOR_A_GAME = 2;

export const GROUP_DEVICES = 2;

export const RETURN_AFTER_MS = Duration.toMillis(Duration.hours(12));

export const RETURN_WITHIN_MS = Duration.toMillis(Duration.days(14));

const MAX_LISTED = 6;

export interface Period {
  readonly from: number;
  readonly to: number;
  readonly now: number;
}

export interface RoomRow {
  readonly room: string;
  readonly kind: string;
  readonly weight: number;
  readonly rows: number;
  readonly firstAt: number;
  readonly maxima: readonly number[];
}

export interface DeviceRow {
  readonly room: string;
  readonly device: string;
  readonly firstAt: number;
}

export interface CountRow {
  readonly kind: string;
  readonly detail: string;
  readonly weight: number;
  readonly total: number;
}

export interface SourceRow {
  readonly page: string;
  readonly source: string;
  readonly weight: number;
}

export interface Grouped {
  readonly rooms: readonly RoomRow[];
  readonly devices: readonly DeviceRow[];
  readonly counts: readonly CountRow[];
  readonly sources: readonly SourceRow[];
}

export const roomsSince = (period: Period) => period.from;

export const roomsUntil = (period: Period) => Math.max(period.to, period.now);

export const devicesUntil = (period: Period) =>
  Math.min(period.now, period.to + RETURN_WITHIN_MS);

const within = (at: number, from: number, until: number) =>
  at >= from && at < until;

const kindsOf = (point: StampedPoint) =>
  kindOfPoint(point.point).pipe(Option.toArray);

const addRoom = (
  rooms: Map<string, RoomRow>,
  stamped: StampedPoint,
  kind: string
) => {
  const [scope] = stamped.point.indexes;
  const key = `${scope} ${kind}`;
  const before = rooms.get(key);

  rooms.set(key, {
    firstAt: Math.min(before?.firstAt ?? stamped.at, stamped.at),
    kind,
    maxima: Array.from({ length: DOUBLES_KEPT }, (_, index) =>
      Math.max(before?.maxima[index] ?? 0, stamped.point.doubles[index] ?? 0)
    ),
    room: scope,
    rows: (before?.rows ?? 0) + 1,
    weight: 1,
  });
};

const addDevice = (devices: Map<string, DeviceRow>, stamped: StampedPoint) => {
  const [scope] = stamped.point.indexes;
  const device = stamped.point.blobs[1] ?? "";
  const key = `${scope} ${device}`;
  const before = devices.get(key);

  devices.set(key, {
    device,
    firstAt: Math.min(before?.firstAt ?? stamped.at, stamped.at),
    room: scope,
  });
};

const addCount = (
  counts: Map<string, CountRow>,
  stamped: StampedPoint,
  kind: string
) => {
  const detail = stamped.point.blobs[1] ?? "";
  const key = `${kind} ${detail}`;
  const before = counts.get(key);

  counts.set(key, {
    detail,
    kind,
    total: (before?.total ?? 0) + (stamped.point.doubles[0] ?? 0),
    weight: (before?.weight ?? 0) + 1,
  });
};

export const blobOf = (point: StampedPoint, kind: MeasureKind, name: string) =>
  point.point.blobs[blobPosition(kind, name) - 1] ?? "";

const addSource = (sources: Map<string, SourceRow>, stamped: StampedPoint) => {
  const page = blobOf(stamped, "PageVisit", "page");
  const source = blobOf(stamped, "PageVisit", "source");
  const key = `${page} ${source}`;

  sources.set(key, {
    page,
    source,
    weight: (sources.get(key)?.weight ?? 0) + 1,
  });
};

export const groupPoints = (
  points: readonly StampedPoint[],
  period: Period
): Grouped => {
  const rooms = new Map<string, RoomRow>();
  const devices = new Map<string, DeviceRow>();
  const counts = new Map<string, CountRow>();
  const sources = new Map<string, SourceRow>();

  for (const stamped of points) {
    const inRoom = stamped.point.indexes[0] !== SITE_SCOPE;

    for (const kind of kindsOf(stamped)) {
      if (
        inRoom &&
        ROOM_KINDS.includes(kind) &&
        within(stamped.at, roomsSince(period), roomsUntil(period))
      ) {
        addRoom(rooms, stamped, kind);
      }

      if (
        kind === "MemberJoined" &&
        stamped.point.blobs[1] !== "" &&
        within(stamped.at, period.from, devicesUntil(period))
      ) {
        addDevice(devices, stamped);
      }

      if (
        COUNT_KINDS.includes(kind) &&
        within(stamped.at, period.from, period.to)
      ) {
        addCount(counts, stamped, kind);
      }

      if (kind === "PageVisit" && within(stamped.at, period.from, period.to)) {
        addSource(sources, stamped);
      }
    }
  }

  return {
    counts: [...counts.values()],
    devices: [...devices.values()],
    rooms: [...rooms.values()],
    sources: [...sources.values()],
  };
};

export const isoTime = (at: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(at));

const sqlTime = (at: number) =>
  `toDateTime('${isoTime(at).slice(0, 19).replace("T", " ")}')`;

const sqlList = (kinds: readonly string[]) =>
  kinds.map((kind) => `'${kind}'`).join(", ");

export const roomsQuery = (dataset: string, period: Period) =>
  [
    "SELECT index1 AS room, blob1 AS kind,",
    "max(_sample_interval) AS weight, count() AS n,",
    "toUnixTimestamp(min(timestamp)) AS first_at,",
    Array.from(
      { length: DOUBLES_KEPT },
      (_, index) => `max(double${index + 1}) AS d${index + 1}`
    ).join(", "),
    `FROM ${dataset}`,
    `WHERE timestamp >= ${sqlTime(roomsSince(period))} AND timestamp < ${sqlTime(roomsUntil(period))}`,
    `AND index1 != '${SITE_SCOPE}' AND blob1 IN (${sqlList(ROOM_KINDS)})`,
    "GROUP BY room, kind FORMAT JSON",
  ].join(" ");

export const devicesQuery = (dataset: string, period: Period) =>
  [
    "SELECT index1 AS room, blob2 AS device,",
    "toUnixTimestamp(min(timestamp)) AS first_at",
    `FROM ${dataset}`,
    `WHERE timestamp >= ${sqlTime(period.from)} AND timestamp < ${sqlTime(devicesUntil(period))}`,
    "AND blob1 = 'MemberJoined' AND blob2 != ''",
    "GROUP BY room, device FORMAT JSON",
  ].join(" ");

export const countsQuery = (dataset: string, period: Period) =>
  [
    "SELECT blob1 AS kind, blob2 AS detail,",
    "sum(_sample_interval) AS weight,",
    "sum(_sample_interval * double1) AS total",
    `FROM ${dataset}`,
    `WHERE timestamp >= ${sqlTime(period.from)} AND timestamp < ${sqlTime(period.to)}`,
    `AND blob1 IN (${sqlList(COUNT_KINDS)})`,
    "GROUP BY kind, detail FORMAT JSON",
  ].join(" ");

const blobColumn = (kind: MeasureKind, name: string) =>
  `blob${blobPosition(kind, name)}`;

export const sourcesQuery = (dataset: string, period: Period) =>
  [
    `SELECT ${blobColumn("PageVisit", "page")} AS page,`,
    `${blobColumn("PageVisit", "source")} AS source,`,
    "sum(_sample_interval) AS weight",
    `FROM ${dataset}`,
    `WHERE timestamp >= ${sqlTime(period.from)} AND timestamp < ${sqlTime(period.to)}`,
    "AND blob1 = 'PageVisit'",
    "GROUP BY page, source FORMAT JSON",
  ].join(" ");

const NumberLike = Schema.Union([Schema.Finite, Schema.FiniteFromString]);

const SECOND_MS = 1000;

export const RoomRowsSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      d1: NumberLike,
      d2: NumberLike,
      d3: NumberLike,
      d4: NumberLike,
      first_at: NumberLike,
      kind: Schema.String,
      n: NumberLike,
      room: Schema.String,
      weight: NumberLike,
    })
  ),
});

export const DeviceRowsSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      device: Schema.String,
      first_at: NumberLike,
      room: Schema.String,
    })
  ),
});

export const CountRowsSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      detail: Schema.String,
      kind: Schema.String,
      total: NumberLike,
      weight: NumberLike,
    })
  ),
});

export const SourceRowsSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      page: Schema.String,
      source: Schema.String,
      weight: NumberLike,
    })
  ),
});

export const sourceRowsFrom = (
  rows: typeof SourceRowsSchema.Type
): readonly SourceRow[] =>
  rows.data.map((row) => ({
    page: row.page,
    source: row.source,
    weight: row.weight,
  }));

export const roomRowsFrom = (
  rows: typeof RoomRowsSchema.Type
): readonly RoomRow[] =>
  rows.data.map((row) => ({
    firstAt: row.first_at * SECOND_MS,
    kind: row.kind,
    maxima: [row.d1, row.d2, row.d3, row.d4],
    room: row.room,
    rows: row.n,
    weight: row.weight,
  }));

export const deviceRowsFrom = (
  rows: typeof DeviceRowsSchema.Type
): readonly DeviceRow[] =>
  rows.data.map((row) => ({
    device: row.device,
    firstAt: row.first_at * SECOND_MS,
    room: row.room,
  }));

export const countRowsFrom = (
  rows: typeof CountRowsSchema.Type
): readonly CountRow[] =>
  rows.data.map((row) => ({
    detail: row.detail,
    kind: row.kind,
    total: row.total,
    weight: row.weight,
  }));

interface RoomFacts {
  readonly room: string;
  readonly weight: number;
  readonly openedAt: number;
  readonly kinds: ReadonlyMap<string, RoomRow>;
}

const maximum = (
  facts: RoomFacts,
  kind: MeasureKind,
  name: string
): Option.Option<number> =>
  Option.fromUndefinedOr(facts.kinds.get(kind)).pipe(
    Option.map((row) => row.maxima[doublePosition(kind, name) - 1] ?? 0)
  );

const reached = (
  facts: RoomFacts,
  kind: MeasureKind,
  name: string,
  atLeast: number
) => maximum(facts, kind, name).pipe(Option.exists((max) => max >= atLeast));

export interface Returns {
  readonly back: number;
  readonly groups: number;
  readonly tooRecent: number;
}

export interface Funnel {
  readonly visits: number;
  readonly homeVisits: number;
  readonly inviteVisits: number;
  readonly created: number;
  readonly seated: number;
  readonly firstHand: number;
  readonly twentyHands: number;
  readonly settled: number;
  readonly realNights: number;
  readonly returns: Returns;
  readonly firstHandMedianMs: Option.Option<number>;
  readonly handsMedian: Option.Option<number>;
  readonly abandoned: number;
  readonly counts: ReadonlyMap<string, ReadonlyMap<string, CountRow>>;
  readonly sources: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

const median = (values: readonly number[]) => {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = sorted[Math.floor((sorted.length - 1) / 2)];

  return Option.fromUndefinedOr(middle);
};

const roomFacts = (rows: readonly RoomRow[], period: Period) => {
  const byRoom = new Map<string, Map<string, RoomRow>>();

  for (const row of rows) {
    const kinds = byRoom.get(row.room) ?? new Map<string, RoomRow>();

    kinds.set(row.kind, row);
    byRoom.set(row.room, kinds);
  }

  return [...byRoom.entries()].flatMap(([room, kinds]): RoomFacts[] => {
    const opened = kinds.get("RoomOpened");

    return opened !== undefined &&
      within(opened.firstAt, period.from, period.to)
      ? [{ kinds, openedAt: opened.firstAt, room, weight: opened.weight }]
      : [];
  });
};

export const returnsOf = (
  devices: readonly DeviceRow[],
  rooms: readonly RoomFacts[],
  now: number
): Returns => {
  const devicesOf = new Map<string, Set<string>>();
  const seenAt = new Map<string, number>();

  for (const row of devices) {
    devicesOf.set(
      row.room,
      (devicesOf.get(row.room) ?? new Set<string>()).add(row.device)
    );
    seenAt.set(
      row.room,
      Math.min(seenAt.get(row.room) ?? row.firstAt, row.firstAt)
    );
  }

  const later = [...devicesOf.entries()].map(([room, set]) => ({
    at: seenAt.get(room) ?? 0,
    devices: set,
    room,
  }));

  let back = 0;
  let groups = 0;
  let tooRecent = 0;

  for (const facts of rooms) {
    const own = devicesOf.get(facts.room) ?? new Set<string>();

    if (own.size < GROUP_DEVICES) {
      continue;
    }

    groups += facts.weight;

    const returned = later.some(
      (other) =>
        other.room !== facts.room &&
        other.at >= facts.openedAt + RETURN_AFTER_MS &&
        other.at <= facts.openedAt + RETURN_WITHIN_MS &&
        [...other.devices].filter((device) => own.has(device)).length >=
          GROUP_DEVICES
    );

    if (returned) {
      back += facts.weight;
    } else if (facts.openedAt + RETURN_WITHIN_MS > now) {
      tooRecent += facts.weight;
    }
  }

  return { back, groups, tooRecent };
};

const countsByKind = (rows: readonly CountRow[]) => {
  const byKind = new Map<string, Map<string, CountRow>>();

  for (const row of rows) {
    const details = byKind.get(row.kind) ?? new Map<string, CountRow>();

    details.set(row.detail, row);
    byKind.set(row.kind, details);
  }

  return byKind;
};

const sourcesByPage = (rows: readonly SourceRow[]) => {
  const byPage = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const sources = byPage.get(row.page) ?? new Map<string, number>();

    sources.set(
      row.source || "unrecorded",
      (sources.get(row.source || "unrecorded") ?? 0) + row.weight
    );
    byPage.set(row.page, sources);
  }

  return byPage;
};

const sumWeight = (
  rooms: readonly RoomFacts[],
  keep: (facts: RoomFacts) => boolean
) => rooms.filter(keep).reduce((total, facts) => total + facts.weight, 0);

export const funnelOf = (grouped: Grouped, period: Period): Funnel => {
  const rooms = roomFacts(grouped.rooms, period);
  const counts = countsByKind(grouped.counts);

  const weightOf = (kind: MeasureKind, detail?: string) =>
    [...(counts.get(kind)?.values() ?? [])]
      .filter((row) => detail === undefined || row.detail === detail)
      .reduce((total, row) => total + row.weight, 0);

  return {
    abandoned: weightOf("NightAbandoned"),
    counts,
    created: sumWeight(rooms, () => true),
    firstHand: sumWeight(rooms, (facts) => facts.kinds.has("FirstHand")),
    firstHandMedianMs: median(
      rooms.flatMap((facts) =>
        Option.toArray(maximum(facts, "FirstHand", "sinceOpenMs"))
      )
    ),
    handsMedian: median(
      rooms.flatMap((facts) =>
        Option.toArray(maximum(facts, "HandFinished", "hand"))
      )
    ),
    homeVisits: weightOf("PageVisit", "Home"),
    inviteVisits: weightOf("PageVisit", "Invite"),
    realNights: sumWeight(
      rooms,
      (facts) =>
        reached(facts, "HandFinished", "hand", REAL_NIGHT_HANDS) &&
        reached(facts, "HandFinished", "players", REAL_NIGHT_PLAYERS)
    ),
    returns: returnsOf(grouped.devices, rooms, period.now),
    seated: sumWeight(rooms, (facts) =>
      reached(facts, "SeatTaken", "seated", SEATED_FOR_A_GAME)
    ),
    settled: sumWeight(rooms, (facts) => facts.kinds.has("NightSettled")),
    sources: sourcesByPage(grouped.sources),
    twentyHands: sumWeight(rooms, (facts) =>
      reached(facts, "HandFinished", "hand", REAL_NIGHT_HANDS)
    ),
    visits: weightOf("PageVisit"),
  };
};

const plural = (count: number) => Math.round(count).toString();

const percent = (part: number, whole: number) =>
  whole === 0 ? "n/a" : `${Math.round((part * 100) / whole)}%`;

const duration = (ms: number) => {
  const seconds = Math.round(ms / SECOND_MS);
  const minutes = Math.floor(seconds / 60);

  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds % 60}s`;
};

const listed = (details: ReadonlyMap<string, CountRow> | undefined) => {
  const rows = [...(details?.values() ?? [])].toSorted(
    (left, right) =>
      right.weight - left.weight || left.detail.localeCompare(right.detail)
  );

  const total = rows.reduce((sum, row) => sum + row.weight, 0);

  return rows.length === 0 || (rows.length === 1 && rows[0]?.detail === "")
    ? plural(total)
    : `${plural(total)}: ${rows
        .slice(0, MAX_LISTED)
        .map((row) => `${row.detail || "none"} ${plural(row.weight)}`)
        .join(", ")}${rows.length > MAX_LISTED ? ", ..." : ""}`;
};

const ruleKeys = (funnel: Funnel) => {
  const tally = new Map<string, number>();

  for (const row of funnel.counts.get("RulesChanged")?.values() ?? []) {
    for (const key of row.detail.split(",").filter((part) => part !== "")) {
      tally.set(key, (tally.get(key) ?? 0) + row.weight);
    }
  }

  const sorted = [...tally.entries()].toSorted(
    ([leftKey, left], [rightKey, right]) =>
      right - left || leftKey.localeCompare(rightKey)
  );

  return sorted.length === 0
    ? "none"
    : sorted
        .slice(0, MAX_LISTED)
        .map(([key, count]) => `${key} ${plural(count)}`)
        .join(", ");
};

const fromText = (sources: ReadonlyMap<string, number> | undefined) => {
  const rows = [...(sources?.entries() ?? [])].toSorted(
    ([leftSource, left], [rightSource, right]) =>
      right - left || leftSource.localeCompare(rightSource)
  );

  return rows.length === 0
    ? "n/a"
    : rows.map(([source, weight]) => `${source} ${plural(weight)}`).join(", ");
};

const line = (label: string, value: string) => `  ${label.padEnd(20)} ${value}`;

const total = (rows: ReadonlyMap<string, CountRow> | undefined) =>
  [...(rows?.values() ?? [])].reduce((sum, row) => sum + row.total, 0);

const weight = (
  rows: ReadonlyMap<string, CountRow> | undefined,
  details?: readonly string[]
) =>
  [...(rows?.values() ?? [])]
    .filter((row) => details === undefined || details.includes(row.detail))
    .reduce((sum, row) => sum + row.weight, 0);

const measured = (funnel: Funnel, kind: MeasuredBy<"Server">) =>
  funnel.counts.get(kind);

const reported = (funnel: Funnel, kind: MeasuredBy<"Page">) =>
  funnel.counts.get(kind);

export const funnelLines = (funnel: Funnel) => [
  "funnel",
  line(
    "visits",
    `${plural(funnel.visits)} (home ${plural(funnel.homeVisits)}, invite ${plural(funnel.inviteVisits)})`
  ),
  line("home came from", fromText(funnel.sources.get("Home"))),
  line("invite came from", fromText(funnel.sources.get("Invite"))),
  line("rooms created", plural(funnel.created)),
  line("2+ seated", plural(funnel.seated)),
  line("first hand", plural(funnel.firstHand)),
  line(`${REAL_NIGHT_HANDS}+ hands`, plural(funnel.twentyHands)),
  line("settled", plural(funnel.settled)),
  line(
    "group back in 14d",
    `${plural(funnel.returns.back)} of ${plural(funnel.returns.groups)} group rooms (${percent(funnel.returns.back, funnel.returns.groups)}), ${plural(funnel.returns.tooRecent)} too recent to tell`
  ),
  line(
    "real nights",
    `${plural(funnel.realNights)} (${REAL_NIGHT_HANDS}+ hands, one dealt to ${REAL_NIGHT_PLAYERS}+ players)`
  ),
  line(
    "first hand after",
    Option.match(funnel.firstHandMedianMs, {
      onNone: () => "n/a",
      onSome: (ms) => `median ${duration(ms)}`,
    })
  ),
  line(
    "hands per room",
    Option.match(funnel.handsMedian, {
      onNone: () => "n/a",
      onSome: (hands) => `median ${plural(hands)}`,
    })
  ),
  line("hands dealt", listed(funnel.counts.get("HandFinished"))),
  line("7-2 bounties", listed(funnel.counts.get("BountyPaid"))),
  line("abandoned", plural(funnel.abandoned)),
  line("rules changed", ruleKeys(funnel)),
];

export const healthLines = (funnel: Funnel) => [
  "health, measured by the server",
  line("reconnects", plural(weight(measured(funnel, "SocketResumed")))),
  line("sockets closed", listed(measured(funnel, "SocketClosed"))),
  line(
    "outdated clients",
    plural(
      weight(measured(funnel, "SocketClosed"), [
        "ClientOutdated",
        "ServerOutdated",
      ])
    )
  ),
  line(
    "quiet / resumed",
    `${plural(weight(measured(funnel, "TableQuiet")))} / ${plural(weight(measured(funnel, "TableResumed")))}`
  ),
  line(
    "stalled / cleared",
    `${plural(weight(measured(funnel, "TableStalled")))} / ${plural(weight(measured(funnel, "StallCleared")))}`
  ),
  line("beacon outages", plural(weight(measured(funnel, "BeaconOutage")))),
  line("members removed", plural(weight(measured(funnel, "MemberRemoved")))),
  line("refused alarms", listed(measured(funnel, "AlarmRefused"))),
  line("rate limited", listed(measured(funnel, "RateLimited"))),
  line("server faults", listed(measured(funnel, "ServerFault"))),
];

export const reportedLines = (funnel: Funnel) => [
  "reported by pages, unverified: anyone can send these",
  line("client errors", listed(reported(funnel, "ClientError"))),
  line(
    "deck checks failed",
    plural(weight(reported(funnel, "DeckCheckFailed")))
  ),
  line("forced reloads", listed(reported(funnel, "ForcedReload"))),
  line("reconnects", plural(total(reported(funnel, "ClientReconnects")))),
];
