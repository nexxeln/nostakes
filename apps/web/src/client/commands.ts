import { randomAvatar } from "@nostakes/avatar";
import {
  HttpRefusalSchema,
  RoomCodeSchema,
  RoomPassSchema,
} from "@nostakes/protocol";
import {
  JoinRequestSchema,
  MemberCommandSchema,
  RoomSignalSchema,
} from "@nostakes/room";
import type { JoinRequest } from "@nostakes/room";
import { Clock, Effect, Match, Option, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { Command, Navigation } from "foldkit";

import { Messages, ReplyOutcomes } from "../features/message.js";
import {
  ProfileSchema,
  ReloadTargets,
  RoomRecordSchema,
  ThemeSchema,
} from "../features/model.js";
import { refusalText } from "../features/refusals.js";
import { HintSchema } from "../features/table/snapshot.js";
import { roomPath } from "../features/wire.js";
import { RoomConnection } from "./connection.js";
import { roomIsGone } from "./room-check.js";
import {
  forgetPass,
  randomSeed,
  reloadFor,
  storeLearned,
  storePass,
  storeProfile,
  storeRoomRecord,
  storeSound,
  storeTheme,
} from "./storage.js";

const encodeJoin = Schema.encodeSync(Schema.toCodecJson(JoinRequestSchema));

class EntryRefused extends Schema.TaggedError<
  EntryRefused,
  { readonly brand: unique symbol }
>()("EntryRefused", { reason: Schema.String }) {}

const passFrom = (url: string, request: JoinRequest) =>
  HttpClientRequest.post(new URL(url, globalThis.location.href)).pipe(
    HttpClientRequest.bodyJsonUnsafe(encodeJoin(request)),
    HttpClient.execute,
    Effect.mapError(
      () => new EntryRefused({ reason: "The room server is not answering." })
    ),
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.mapError(
          () => new EntryRefused({ reason: "The room server sent nonsense." })
        ),
        Effect.flatMap((json) =>
          Schema.decodeUnknownEffect(RoomPassSchema)(json).pipe(
            Effect.mapError(() =>
              Option.match(
                Schema.decodeUnknownOption(HttpRefusalSchema)(json),
                {
                  onNone: () =>
                    new EntryRefused({
                      reason:
                        "The room server sent an answer this page cannot read. Try again.",
                    }),
                  onSome: (refusal) =>
                    new EntryRefused({ reason: refusalText(refusal) }),
                }
              )
            )
          )
        )
      )
    ),
    Effect.tap(storePass),
    Effect.tap(() => storeProfile(request)),
    Effect.match({
      onFailure: (failure) => Messages.FailedEntry({ problem: failure.reason }),
      onSuccess: (pass) =>
        Messages.EnteredRoom({ code: pass.code, player: pass.player }),
    })
  );

export const CreateRoom = Command.define("CreateRoom", {
  args: { avatar: Schema.String, name: Schema.String },
  execute: (request) => passFrom("/rooms", request),
  messages: [Messages.EnteredRoom, Messages.FailedEntry],
});

export const JoinRoom = Command.define("JoinRoom", {
  args: { avatar: Schema.String, code: RoomCodeSchema, name: Schema.String },
  execute: ({ avatar, code, name }) =>
    passFrom(`/rooms/${code}/members`, { avatar, name }),
  messages: [Messages.EnteredRoom, Messages.FailedEntry],
});

const LOST_TEXT = {
  ClientRefused: "the room turned this device away",
  ClientStopped: "the connection closed first",
  CommandCancelled: "it was cancelled",
  CommandInvalid: "the page could not put it into words the room reads",
  CommandTooLarge: "it was too large to send",
  ResourceNotAvailable: "the page is not connected to the room",
} as const;

const UNAVAILABLE_TEXT = {
  RoomHalted: "the room has stopped",
  StorageFailed: "the room could not save it",
} as const;

export const SendToRoom = Command.define("SendToRoom", {
  args: { command: MemberCommandSchema, key: Schema.Int },
  execute: ({ command, key }) =>
    RoomConnection.get.pipe(
      Effect.flatMap((client) => client.send(command)),
      Effect.match({
        onFailure: (failure) =>
          Messages.GotReply({
            key,
            outcome: ReplyOutcomes.Lost({
              reason: `${LOST_TEXT[failure._tag]}.`,
            }),
          }),
        onSuccess: (result) =>
          Messages.GotReply({
            key,
            outcome: Match.valueTags(result, {
              Accepted: ({ seq }) => ReplyOutcomes.Accepted({ seq }),
              Rejected: ({ rejection }) =>
                ReplyOutcomes.Rejected({ rejection }),
              Unavailable: ({ reason }) =>
                ReplyOutcomes.Lost({ reason: `${UNAVAILABLE_TEXT[reason]}.` }),
            }),
          }),
      })
    ),
  messages: [Messages.GotReply],
});

export const SignalRoom = Command.define("SignalRoom", {
  args: { signal: RoomSignalSchema },
  execute: ({ signal }) =>
    RoomConnection.get.pipe(
      Effect.flatMap((client) => client.signal(signal)),
      Effect.map((outcome) => outcome === "Sent"),
      Effect.orElseSucceed(() => false),
      Effect.flatMap((sent) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((at) => Messages.SentSignal({ at, sent, signal }))
        )
      )
    ),
  messages: [Messages.SentSignal],
});

export const WakeRoom = Command.define("WakeRoom", {
  execute: RoomConnection.get.pipe(
    Effect.flatMap((client) => client.wake),
    Effect.ignore,
    Effect.as(Messages.CompletedWake())
  ),
  messages: [Messages.CompletedWake],
});

export const ReloadPage = Command.define("ReloadPage", {
  args: { target: ReloadTargets },
  execute: ({ target }) =>
    reloadFor(target).pipe(Effect.as(Messages.StartedReload())),
  messages: [Messages.StartedReload],
});

export const CopyRoomLink = Command.define("CopyRoomLink", {
  args: { code: RoomCodeSchema },
  execute: ({ code }) =>
    Effect.tryPromise(() =>
      globalThis.navigator.clipboard.writeText(
        new URL(roomPath(code), globalThis.location.href).toString()
      )
    ).pipe(
      Effect.match({
        onFailure: () => Messages.CompletedCopy({ copied: "Nothing" }),
        onSuccess: () => Messages.CompletedCopy({ copied: "Link" }),
      })
    ),
  messages: [Messages.CompletedCopy],
});

export const CopyText = Command.define("CopyText", {
  args: { text: Schema.String },
  execute: ({ text }) =>
    Effect.tryPromise(() =>
      globalThis.navigator.clipboard.writeText(text)
    ).pipe(
      Effect.match({
        onFailure: () => Messages.CompletedCopy({ copied: "Nothing" }),
        onSuccess: () => Messages.CompletedCopy({ copied: "Settlement" }),
      })
    ),
  messages: [Messages.CompletedCopy],
});

export const ShowPath = Command.define("ShowPath", {
  args: { path: Schema.String },
  execute: ({ path }) =>
    Navigation.replaceUrl(path).pipe(
      Effect.as(Messages.CompletedNavigation({ path }))
    ),
  messages: [Messages.CompletedNavigation],
});

export const CheckRoom = Command.define("CheckRoom", {
  args: { code: RoomCodeSchema },
  execute: ({ code }) =>
    roomIsGone(code).pipe(
      Effect.map((gone) => Messages.CheckedRoom({ code, gone }))
    ),
  messages: [Messages.CheckedRoom],
});

export const RememberRoom = Command.define("RememberRoom", {
  args: { record: RoomRecordSchema },
  execute: ({ record }) =>
    storeRoomRecord(record).pipe(Effect.as(Messages.CompletedPreference())),
  messages: [Messages.CompletedPreference],
});

export const ForgetRoom = Command.define("ForgetRoom", {
  args: { code: RoomCodeSchema },
  execute: ({ code }) =>
    forgetPass(code).pipe(Effect.as(Messages.CompletedForget({ code }))),
  messages: [Messages.CompletedForget],
});

const paintThemeColor = (chosen: boolean) => {
  const page = globalThis
    .getComputedStyle(globalThis.document.documentElement)
    .getPropertyValue("--color-page")
    .trim();

  for (const meta of globalThis.document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]'
  )) {
    meta.dataset.scheme ??= meta.content;
    meta.content = chosen ? page : meta.dataset.scheme;
  }
};

export const ApplyTheme = Command.define("ApplyTheme", {
  args: { theme: Schema.Option(ThemeSchema) },
  execute: ({ theme }) =>
    Effect.sync(() => {
      const root = globalThis.document.documentElement;

      Option.match(theme, {
        onNone: () => {
          delete root.dataset.theme;
        },
        onSome: (chosen) => {
          root.dataset.theme = chosen === "Dark" ? "dark" : "light";
        },
      });
      paintThemeColor(Option.isSome(theme));
    }).pipe(
      Effect.andThen(storeTheme(theme)),
      Effect.as(Messages.CompletedPreference())
    ),
  messages: [Messages.CompletedPreference],
});

export const SaveSound = Command.define("SaveSound", {
  args: { on: Schema.Boolean },
  execute: ({ on }) =>
    storeSound(on).pipe(Effect.as(Messages.CompletedPreference())),
  messages: [Messages.CompletedPreference],
});

export const SaveLearned = Command.define("SaveLearned", {
  args: { learned: Schema.Array(HintSchema) },
  execute: ({ learned }) =>
    storeLearned(learned).pipe(Effect.as(Messages.CompletedPreference())),
  messages: [Messages.CompletedPreference],
});

export const ShuffleFace = Command.define("ShuffleFace", {
  execute: randomSeed.pipe(
    Effect.map((seed) => Messages.PickedAvatar({ avatar: randomAvatar(seed) }))
  ),
  messages: [Messages.PickedAvatar],
});

export const SaveProfile = Command.define("SaveProfile", {
  args: { profile: ProfileSchema },
  execute: ({ profile }) =>
    storeProfile(profile).pipe(Effect.as(Messages.CompletedPreference())),
  messages: [Messages.CompletedPreference],
});
