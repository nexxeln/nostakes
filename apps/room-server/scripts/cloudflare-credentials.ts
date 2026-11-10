import { Config, Effect, FileSystem, Option, Redacted, Schema } from "effect";

export class CredentialMissing extends Schema.TaggedError<
  CredentialMissing,
  { readonly brand: unique symbol }
>()("CredentialMissing", { reason: Schema.String }) {
  override get message() {
    return this.reason;
  }
}

const credentialsDirectory = Effect.gen(function* credentialsDirectory() {
  const home = yield* Config.String("HOME").pipe(Config.withDefault("~"));

  return yield* Config.String("NOSTAKES_CREDENTIALS").pipe(
    Config.withDefault(`${home}/.config/nostakes`)
  );
}).pipe(Effect.orDie);

export const credential = (name: string, file: string, needs: string) =>
  Effect.gen(function* readCredential() {
    const fromEnvironment = yield* Config.option(Config.Redacted(name)).pipe(
      Effect.orDie
    );

    if (Option.isSome(fromEnvironment)) {
      return fromEnvironment.value;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = `${yield* credentialsDirectory}/${file}`;

    return yield* fs.readFileString(path).pipe(
      Effect.mapError(
        () =>
          new CredentialMissing({
            reason: `Set ${name}, or write it to ${path}. ${needs}`,
          })
      ),
      Effect.map((text) => text.trim()),
      Effect.filterOrFail(
        (text) => text.length > 0,
        () => new CredentialMissing({ reason: `${path} is empty.` })
      ),
      Effect.map((text) => Redacted.make(text))
    );
  });
