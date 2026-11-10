import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@nostakes/protocol";
import { Option, Schema } from "effect";

import { Screens } from "./model.js";
import type { Model } from "./model.js";

export const REPORTS_PATH = "/rooms/reports";

export const MAX_ERROR_REPORTS = 5;

export const MAX_REPORTED_MESSAGE = 120;

const BuildSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._-]{1,64}$/u)
);

export const ReportScreenSchema = Schema.Literals([
  "Home",
  "Invitation",
  "Room",
  "Other",
]);

export type ReportScreen = typeof ReportScreenSchema.Type;

const ErrorNameSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_$.]{0,47}$/u)
);

export const ClientReportSchema = Schema.TaggedUnion({
  ClientError: {
    build: BuildSchema,
    message: Schema.String.check(Schema.isMaxLength(MAX_REPORTED_MESSAGE)),
    name: ErrorNameSchema,
    screen: ReportScreenSchema,
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

const SPECIAL = /[.*+?^${}()|[\]\\]/gu;

const withoutNames = (text: string, names: readonly string[]) => {
  let scrubbed = text;

  for (const name of names.flatMap((each) => {
    const trimmed = each.trim();

    return trimmed.length > 1 ? [trimmed] : [];
  })) {
    scrubbed = scrubbed.replaceAll(
      new RegExp(name.replaceAll(SPECIAL, "\\$&"), "giu"),
      "<name>"
    );
  }

  return scrubbed;
};

export const scrubMessage = (text: string, names: readonly string[]) =>
  withoutNames(text, names)
    .replaceAll(UNPRINTABLE, " ")
    .replaceAll(ADDRESS, "<address>")
    .replaceAll(QUOTED, "<quoted>")
    .replaceAll(LONG_RUN, "<long>")
    .replaceAll(ROOM_CODE, "<code>")
    .replaceAll(SPACES, " ")
    .trim()
    .slice(0, MAX_REPORTED_MESSAGE);

const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_$.]{0,47}$/u;

export const errorName = (name: string) =>
  ERROR_NAME.test(name) ? name : "Error";

export const reportScreen = (model: Model): ReportScreen =>
  Screens.match(model.screen, {
    Home: (): ReportScreen => "Home",
    Invited: (): ReportScreen => "Invitation",
    Room: (): ReportScreen => "Room",
  });

const namesInView = (model: Model): readonly string[] =>
  Screens.match(model.screen, {
    Home: () => [],
    Invited: () => [],
    Room: ({ room }) =>
      room.shown.pipe(
        Option.map(({ view }) => view.members.map(({ name }) => name)),
        Option.getOrElse((): readonly string[] => [])
      ),
  });

export const namesKnown = (model: Model): readonly string[] => [
  model.profile.name,
  ...model.rooms.flatMap(({ record }) => record.others),
  ...namesInView(model),
];

export const reportBuild = (model: Model) =>
  Schema.is(BuildSchema)(model.build) ? model.build : "unknown";
