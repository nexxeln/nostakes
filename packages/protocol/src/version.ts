import { Effect, Option, Schema } from "effect";

export const PROTOCOL_VERSION = 19;

export const BEFORE_VERSIONS = 0;

export const ProtocolVersionSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(BEFORE_VERSIONS)
);

export const BuildIdSchema = Schema.String.check(
  Schema.isPattern(/^[\w.-]{1,64}$/u)
).pipe(Schema.brand("BuildId"));

export type BuildId = typeof BuildIdSchema.Type;

export const helloProtocol = ProtocolVersionSchema.pipe(
  Schema.withConstructorDefault(Effect.succeed(PROTOCOL_VERSION)),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(BEFORE_VERSIONS))
);

const noBuild = Effect.sync(() => Option.none<BuildId>());

export const welcomeBuild = Schema.OptionFromNullOr(BuildIdSchema).pipe(
  Schema.withConstructorDefault(noBuild),
  Schema.withDecodingDefaultTypeKey(noBuild)
);

export type VersionMismatch =
  | "ClientOutdated"
  | "ServerOutdated"
  | "ProtocolViolation";

export const versionMismatch = (
  client: number,
  server: number = PROTOCOL_VERSION
): Option.Option<VersionMismatch> => {
  if (client === server) {
    return Option.none();
  }

  if (client === BEFORE_VERSIONS) {
    return Option.some("ProtocolViolation");
  }

  return Option.some(client < server ? "ClientOutdated" : "ServerOutdated");
};
