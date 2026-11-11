import { Option, Schema } from "effect";

export type MeasureSource = "Server" | "Page";

interface Layout {
  readonly from: MeasureSource;
  readonly blobs: readonly string[];
  readonly doubles: readonly string[];
}

export const MEASURES = {
  AlarmRefused: { blobs: ["deadline"], doubles: [], from: "Server" },
  BeaconOutage: { blobs: [], doubles: [], from: "Server" },
  ClientError: {
    blobs: ["name", "message", "build", "screen"],
    doubles: [],
    from: "Page",
  },
  ClientReconnects: { blobs: ["build"], doubles: ["reconnects"], from: "Page" },
  DeckCheckFailed: { blobs: ["build"], doubles: [], from: "Page" },
  FirstHand: { blobs: [], doubles: ["sinceOpenMs", "players"], from: "Server" },
  ForcedReload: { blobs: ["reason", "build"], doubles: [], from: "Page" },
  GameStarted: { blobs: [], doubles: ["sinceOpenMs"], from: "Server" },
  HandFinished: {
    blobs: ["deal", "ending"],
    doubles: ["hand", "players"],
    from: "Server",
  },
  MemberJoined: { blobs: ["device"], doubles: ["members"], from: "Server" },
  MemberRemoved: { blobs: [], doubles: ["members"], from: "Server" },
  NightAbandoned: {
    blobs: ["rules"],
    doubles: ["hands", "players", "durationMs"],
    from: "Server",
  },
  NightSettled: {
    blobs: ["rules"],
    doubles: ["hands", "players", "durationMs", "transfers"],
    from: "Server",
  },
  PageVisit: { blobs: ["page", "source"], doubles: [], from: "Server" },
  RateLimited: { blobs: ["action"], doubles: [], from: "Server" },
  RoomOpened: { blobs: ["rules"], doubles: [], from: "Server" },
  RulesChanged: { blobs: ["rules"], doubles: [], from: "Server" },
  SeatTaken: { blobs: [], doubles: ["seated", "players"], from: "Server" },
  ServerFault: { blobs: ["fault"], doubles: [], from: "Server" },
  SocketClosed: { blobs: ["reason"], doubles: [], from: "Server" },
  SocketResumed: { blobs: [], doubles: [], from: "Server" },
  StallCleared: { blobs: [], doubles: [], from: "Server" },
  TableQuiet: { blobs: [], doubles: [], from: "Server" },
  TableResumed: { blobs: [], doubles: ["quietMs"], from: "Server" },
  TableStalled: { blobs: ["deadline"], doubles: [], from: "Server" },
} as const satisfies Record<string, Layout>;

export type MeasureKind = keyof typeof MEASURES;

export type MeasuredBy<From extends MeasureSource> = {
  [K in MeasureKind]: (typeof MEASURES)[K]["from"] extends From ? K : never;
}[MeasureKind];

export const MEASURE_KINDS = Object.keys(MEASURES).filter(
  (kind): kind is MeasureKind => kind in MEASURES
);

type FieldsOf<L extends Layout> = Readonly<Record<L["blobs"][number], string>> &
  Readonly<Record<L["doubles"][number], number>>;

export type MeasureFields<K extends MeasureKind> = FieldsOf<
  (typeof MEASURES)[K]
>;

export interface Measure {
  readonly kind: MeasureKind;
  readonly blobs: readonly string[];
  readonly doubles: readonly number[];
}

export const MAX_BLOB_LENGTH = 512;

export const measure = <K extends MeasureKind>(
  kind: K,
  fields: MeasureFields<K>
): Measure => {
  const layout: Layout = MEASURES[kind];
  const blobs: Readonly<Record<string, string>> = fields;
  const doubles: Readonly<Record<string, number>> = fields;

  return {
    blobs: layout.blobs.map((name) =>
      (blobs[name] ?? "").slice(0, MAX_BLOB_LENGTH)
    ),
    doubles: layout.doubles.map((name) => {
      const value = doubles[name] ?? 0;

      return Number.isFinite(value) ? value : 0;
    }),
    kind,
  };
};

export const SITE_SCOPE = "site";

export const datasetName = (stage: string) =>
  `nostakes_${stage.replaceAll(/[^A-Za-z0-9_]/gu, "_")}`;

export interface DataPoint {
  readonly indexes: readonly [string];
  readonly blobs: readonly string[];
  readonly doubles: readonly number[];
}

const layoutOf = (kind: MeasureKind): Layout => MEASURES[kind];

export const pointOf = (scope: string, measured: Measure): DataPoint => ({
  blobs: [measured.kind, ...measured.blobs],
  doubles: measured.doubles,
  indexes: [scope],
});

export const blobPosition = (kind: MeasureKind, name: string) =>
  layoutOf(kind).blobs.indexOf(name) + 2;

export const doublePosition = (kind: MeasureKind, name: string) =>
  layoutOf(kind).doubles.indexOf(name) + 1;

export const kindOfPoint = (point: DataPoint): Option.Option<MeasureKind> =>
  Option.fromUndefinedOr(MEASURE_KINDS.find((kind) => kind === point.blobs[0]));

export const DataPointSchema = Schema.Struct({
  blobs: Schema.Array(Schema.String),
  doubles: Schema.Array(Schema.Finite),
  indexes: Schema.Tuple([Schema.String]),
});

export const StampedPointSchema = Schema.Struct({
  at: Schema.Finite,
  point: DataPointSchema,
});

export type StampedPoint = typeof StampedPointSchema.Type;
