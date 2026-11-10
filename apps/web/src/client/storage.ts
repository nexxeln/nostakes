import { codeFor, parseAvatar, randomAvatar } from "@nostakes/avatar";
import { RoomCodeSchema, RoomPassSchema } from "@nostakes/protocol";
import type { RoomPass } from "@nostakes/protocol";
import { Effect, Option, Random, Schema } from "effect";

import {
  DeckSchema,
  ProfileSchema,
  ReloadTargets,
  RoomRecordSchema,
  SavedPassSchema,
  ThemeSchema,
} from "../features/model.js";
import type {
  Deck,
  Flags,
  KnownRoom,
  Profile,
  ReloadTarget,
  RoomRecord,
  Theme,
} from "../features/model.js";
import { HintSchema } from "../features/table/snapshot.js";
import type { Hint } from "../features/table/snapshot.js";
import { readCounting } from "./counting.js";
import { pageBuild } from "./page-build.js";

const PROFILE_KEY = "nostakes.profile";

const THEME_KEY = "nostakes.theme";

export const DARK_SCHEME = "(prefers-color-scheme: dark)";

export const systemTheme = (): Theme =>
  globalThis.matchMedia(DARK_SCHEME).matches ? "Dark" : "Light";

const SOUND_KEY = "nostakes.sound";

const DECK_KEY = "nostakes.deck";

const SOUND_OFF = "off";

const LEARNED_KEY = "nostakes.learned";

const learnedJson = Schema.fromJsonString(Schema.Array(HintSchema));

const RELOADED_KEY = "nostakes.reloaded";

const reloadJson = Schema.fromJsonString(ReloadTargets);

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

export const storeDeck = (deck: Deck) => writeItem(DECK_KEY, deck);

export const storeSound = (on: boolean) =>
  writeItem(SOUND_KEY, on ? "on" : SOUND_OFF);

export const storeLearned = (learned: readonly Hint[]) =>
  writeItem(LEARNED_KEY, Schema.encodeSync(learnedJson)(learned));

const ROOMS_KEY = "nostakes.rooms";

const PASS_PREFIX = passKey("");

const recordsJson = Schema.fromJsonString(Schema.Array(RoomRecordSchema));

const storedRecords = readItem(ROOMS_KEY).pipe(
  Effect.map((text) =>
    text.pipe(
      Option.flatMap(Schema.decodeOption(recordsJson)),
      Option.getOrElse((): readonly RoomRecord[] => [])
    )
  )
);

const writeRecords = (records: readonly RoomRecord[]) =>
  writeItem(ROOMS_KEY, Schema.encodeSync(recordsJson)(records));

export const storeRoomRecord = (record: RoomRecord) =>
  storedRecords.pipe(
    Effect.flatMap((records) =>
      writeRecords([
        record,
        ...records.filter(({ code }) => code !== record.code),
      ])
    )
  );

const storedPasses = Effect.sync(() =>
  Array.from(
    { length: globalThis.localStorage.length },
    (_, index) => globalThis.localStorage.key(index) ?? ""
  ).flatMap((key) =>
    key.startsWith(PASS_PREFIX)
      ? Option.toArray(
          Option.fromNullishOr(globalThis.localStorage.getItem(key)).pipe(
            Option.flatMap(Schema.decodeOption(passJson))
          )
        )
      : []
  )
);

export const knownRooms = Effect.gen(function* readKnownRooms() {
  const passes = yield* storedPasses;
  const records = yield* storedRecords;

  return passes
    .map(({ code, player }): KnownRoom => ({
      player,
      record: records.find((record) => record.code === code) ?? {
        closed: false,
        code,
        left: false,
        others: [],
        seenAt: 0,
      },
    }))
    .toSorted((one, other) => other.record.seenAt - one.record.seenAt);
});

export const forgetPass = (code: string) =>
  Effect.sync(() => {
    globalThis.localStorage.removeItem(passKey(code));
  }).pipe(
    Effect.andThen(storedRecords),
    Effect.flatMap((records) =>
      writeRecords(records.filter((record) => record.code !== code))
    )
  );

export const reloadFor = (target: ReloadTarget) =>
  Schema.encodeEffect(reloadJson)(target).pipe(
    Effect.orDie,
    Effect.flatMap((text) =>
      Effect.sync(() => {
        globalThis.sessionStorage.setItem(RELOADED_KEY, text);
        globalThis.location.reload();
      })
    )
  );

const takeReloadedFor = Effect.sync(() => {
  const stored = Option.fromNullishOr(
    globalThis.sessionStorage.getItem(RELOADED_KEY)
  );

  globalThis.sessionStorage.removeItem(RELOADED_KEY);

  return stored.pipe(Option.flatMap(Schema.decodeOption(reloadJson)));
});

const SEED_LIMIT = 2_147_483_646;

export const randomSeed = Random.nextIntBetween(0, SEED_LIMIT);

const ROOM_PATH = /^\/r\/(?<code>[^/]+)\/?$/u;

export const readFlags = Effect.gen(function* readFlags() {
  const invite = Option.fromNullishOr(
    ROOM_PATH.exec(globalThis.location.pathname)?.groups?.code
  ).pipe(
    Option.map((code) => code.toUpperCase()),
    Option.flatMap(Schema.decodeOption(RoomCodeSchema))
  );

  const shuffled = codeFor(randomAvatar(yield* randomSeed));

  const stored = (yield* readItem(PROFILE_KEY)).pipe(
    Option.flatMap(Schema.decodeOption(profileJson)),
    Option.getOrElse(() => ({ avatar: shuffled, name: "" }))
  );

  const profile = Option.isSome(parseAvatar(stored.avatar))
    ? stored
    : { ...stored, avatar: shuffled };

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

  const learned = (yield* readItem(LEARNED_KEY)).pipe(
    Option.flatMap(Schema.decodeOption(learnedJson)),
    Option.getOrElse((): readonly Hint[] => [])
  );

  const reloadedFor = yield* takeReloadedFor;

  const rooms = yield* knownRooms;

  const deck = (yield* readItem(DECK_KEY)).pipe(
    Option.flatMap(Schema.decodeUnknownOption(DeckSchema)),
    Option.getOrElse((): Deck => "TwoColour")
  );

  const flags: Flags = {
    build: Option.getOrElse(pageBuild(), () => "dev"),
    counting: yield* readCounting,
    deck,
    invite,
    learned,
    profile,
    reloadedFor,
    rooms,
    saved,
    sound,
    systemTheme: systemTheme(),
    theme,
  };

  return flags;
});
