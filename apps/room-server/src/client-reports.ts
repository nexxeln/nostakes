import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@nostakes/protocol";
import { Effect, Match, Option, Result, Schema } from "effect";

import { measure } from "./measures.js";
import type { Measure } from "./measures.js";
import { bodyWithin } from "./request-body.js";
import type { BodyRefusal } from "./request-body.js";

export const MAX_REPORT_BYTES = 1024;

export const MAX_REPORTED_MESSAGE = 120;

const BuildSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._-]{1,64}$/u)
);

const ScreenSchema = Schema.Literals(["Home", "Invitation", "Room", "Other"]);

const ErrorNameSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_$.]{0,47}$/u)
);

const MessageSchema = Schema.String.check(Schema.isMaxLength(240));

export const ClientReportSchema = Schema.TaggedUnion({
  ClientError: {
    build: BuildSchema,
    message: MessageSchema,
    name: ErrorNameSchema,
    screen: ScreenSchema,
  },
  DeckCheckFailed: { build: BuildSchema },
  ForcedReload: {
    build: BuildSchema,
    reason: Schema.Literals(["NewProtocol", "NewBuild"]),
  },
  Reconnects: {
    build: BuildSchema,
    reconnects: Schema.Int.check(
      Schema.isBetween({ maximum: 10_000, minimum: 1 })
    ),
  },
});

export type ClientReport = typeof ClientReportSchema.Type;

const ROOM_CODE = new RegExp(
  `(?<![A-Za-z0-9])[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}(?![A-Za-z0-9])`,
  "gu"
);

const LONG_RUN = /[A-Za-z0-9_+/=-]{16,}/gu;

const QUOTED = /(?<quote>["'`]).*?\k<quote>/gu;

const ADDRESS = /\S+@\S+|\b\w+:\/\/\S+/gu;

const UNPRINTABLE = /[^ -~]/gu;

const SPACES = /\s+/gu;

export const scrubMessage = (text: string) =>
  text
    .replaceAll(UNPRINTABLE, " ")
    .replaceAll(ADDRESS, "<address>")
    .replaceAll(QUOTED, "<quoted>")
    .replaceAll(LONG_RUN, "<long>")
    .replaceAll(ROOM_CODE, "<code>")
    .replaceAll(SPACES, " ")
    .trim()
    .slice(0, MAX_REPORTED_MESSAGE);

export const reportMeasure = (report: ClientReport): Measure =>
  Match.valueTags(report, {
    ClientError: ({ build, message, name, screen }) =>
      measure("ClientError", {
        build,
        message: scrubMessage(message),
        name,
        screen,
      }),
    DeckCheckFailed: ({ build }) => measure("DeckCheckFailed", { build }),
    ForcedReload: ({ build, reason }) =>
      measure("ForcedReload", { build, reason }),
    Reconnects: ({ build, reconnects }) =>
      measure("ClientReconnects", { build, reconnects }),
  });

const decodeReport = Schema.decodeUnknownOption(
  Schema.fromJsonString(ClientReportSchema)
);

export const reportFrom = bodyWithin(MAX_REPORT_BYTES).pipe(
  Effect.map(
    Result.flatMap((text): Result.Result<ClientReport, BodyRefusal> =>
      Option.match(decodeReport(text), {
        onNone: () => Result.fail<BodyRefusal>("BadRequest"),
        onSome: (report) => Result.succeed(report),
      })
    )
  )
);
