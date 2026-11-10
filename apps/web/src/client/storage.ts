import { RoomCodeSchema, RoomPassSchema } from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import { Effect, Option, Schema } from "effect";

import {
  ProfileSchema,
  SavedPassSchema,
  ThemeSchema,
} from "../features/model.js";
import type { Flags, Profile, Theme } from "../features/model.js";

const PROFILE_KEY = "nostakes.profile";

const THEME_KEY = "nostakes.theme";

const SOUND_KEY = "nostakes.sound";

const SOUND_OFF = "off";

const passKey = (code: string) => `nostakes.pass.${code}`;

const passJson = Schema.fromJsonString(RoomPassSchema);

const profileJson = Schema.fromJsonString(ProfileSchema);

export class PassMissing extends Schema.TaggedError<
  PassMissing,
  { readonly brand: unique symbol }
>()("PassMissing", { code: Schema.String }) {
  override get message() {
    return `This browser holds no pass for room ${this.code}. Open the room link and join again.`;
  }
}

const readItem = (key: string) =>
  Effect.sync(() => Option.fromNullishOr(globalThis.localStorage.getItem(key)));

const writeItem = (key: string, value: string) =>
  Effect.sync(() => {
    globalThis.localStorage.setItem(key, value);
  });

export const storedPass = (code: string) =>
  readItem(passKey(code)).pipe(
    Effect.map(Option.flatMap(Schema.decodeOption(passJson))),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new PassMissing({ code })),
        onSome: (pass) => Effect.succeed(pass),
      })
    )
  );

export const storePass = (pass: RoomPass) =>
  writeItem(passKey(pass.code), Schema.encodeSync(passJson)(pass));

export const storeProfile = (profile: Profile) =>
  writeItem(PROFILE_KEY, Schema.encodeSync(profileJson)(profile));

export const storeTheme = (theme: Option.Option<Theme>) =>
  Option.match(theme, {
    onNone: () =>
      Effect.sync(() => {
        globalThis.localStorage.removeItem(THEME_KEY);
      }),
    onSome: (chosen) => writeItem(THEME_KEY, chosen),
  });

export const storeSound = (on: boolean) =>
  writeItem(SOUND_KEY, on ? "on" : SOUND_OFF);

export const forgetPass = (code: string) =>
  Effect.sync(() => {
    globalThis.localStorage.removeItem(passKey(code));
  });

const ROOM_PATH = /^\/r\/(?<code>[^/]+)\/?$/u;

export const readFlags = Effect.gen(function* readFlags() {
  const invite = Option.fromNullishOr(
    ROOM_PATH.exec(globalThis.location.pathname)?.groups?.code
  ).pipe(
    Option.map((code) => code.toUpperCase()),
    Option.flatMap(Schema.decodeOption(RoomCodeSchema))
  );

  const profile = (yield* readItem(PROFILE_KEY)).pipe(
    Option.flatMap(Schema.decodeOption(profileJson)),
    Option.getOrElse(() => ({ avatar: "🦊", name: "" }))
  );

  const saved = yield* Option.match(invite, {
    onNone: () => Effect.succeedNone,
    onSome: (code) =>
      storedPass(code).pipe(
        Effect.map(({ player }) =>
          Option.some(SavedPassSchema.make({ code, player }))
        ),
        Effect.orElseSucceed(() => Option.none())
      ),
  });

  const theme = (yield* readItem(THEME_KEY)).pipe(
    Option.flatMap(Schema.decodeUnknownOption(ThemeSchema))
  );

  const mutedHere =
    new URLSearchParams(globalThis.location.search).get("mute") === "1";

  const sound =
    !mutedHere && !Option.contains(yield* readItem(SOUND_KEY), SOUND_OFF);

  const flags: Flags = { invite, profile, saved, sound, theme };

  return flags;
});
