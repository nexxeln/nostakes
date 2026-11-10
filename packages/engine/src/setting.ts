import { Effect, Schema } from "effect";

export interface SettingLabel {
  readonly description: string;
  readonly title: string;
}

export const setting = <
  S extends Schema.Top & Schema.WithoutConstructorDefault,
>(
  schema: S,
  fallback: S["Type"] & S["~type.make.in"],
  label: SettingLabel
) =>
  schema
    .pipe(
      Schema.withConstructorDefault(Effect.succeed(fallback)),
      Schema.withDecodingDefaultTypeKey(Effect.succeed(fallback))
    )
    .annotate({ description: label.description, title: label.title });
