import {
  HttpRefusalSchema,
  RoomCodeSchema,
  RoomPassSchema,
} from "@nostakes/protocol";
import type { HttpRefusal } from "@nostakes/protocol";
import { JoinRequestSchema, MemberCommandSchema } from "@nostakes/room";
import type { JoinRequest } from "@nostakes/room";
import { Effect, Match, Option, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { Command, Navigation } from "foldkit";

import { Messages, ReplyOutcomes } from "../features/message.js";
import { ThemeSchema } from "../features/model.js";
import { rejectionText } from "../features/rejections.js";
import { roomPath } from "../features/wire.js";
import { RoomConnection } from "./connection.js";
import {
  forgetPass,
  storePass,
  storeProfile,
  storeSound,
  storeTheme,
} from "./storage.js";

const encodeJoin = Schema.encodeSync(Schema.toCodecJson(JoinRequestSchema));

class EntryRefused extends Schema.TaggedError<
  EntryRefused,
  { readonly brand: unique symbol }
>()("EntryRefused", { reason: Schema.String }) {}

const REFUSAL_TEXT = {
  BadOrigin: "The room server does not accept this page's address.",
  BadRequest: "The server could not read that. Check the name.",
  NoFreeCode: "No free room code right now. Try again.",
  NotFound: "No room has that code.",
  RoomFull: "That room is full.",
  RoomHalted: "That room has stopped.",
  UpgradeRequired: "The room server wanted a live connection.",
} satisfies Record<HttpRefusal["refusal"], string>;

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
                      reason: `The room server answered ${response.status}.`,
                    }),
                  onSome: ({ refusal }) =>
                    new EntryRefused({
                      reason: REFUSAL_TEXT[refusal],
                    }),
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

export const SendToRoom = Command.define("SendToRoom", {
  args: { command: MemberCommandSchema, key: Schema.Int },
  execute: ({ command, key }) =>
    RoomConnection.get.pipe(
      Effect.flatMap((client) => client.send(command)),
      Effect.match({
        onFailure: (failure) =>
          Messages.GotReply({
            key,
            outcome: ReplyOutcomes.Lost({ reason: failure._tag }),
          }),
        onSuccess: (result) =>
          Messages.GotReply({
            key,
            outcome: Match.valueTags(result, {
              Accepted: ({ seq }) => ReplyOutcomes.Accepted({ seq }),
              Rejected: ({ rejection }) =>
                ReplyOutcomes.Rejected({ reason: rejectionText(rejection) }),
              Unavailable: ({ reason }) =>
                ReplyOutcomes.Lost({
                  reason: `The room is unavailable: ${reason}.`,
                }),
            }),
          }),
      })
    ),
  messages: [Messages.GotReply],
});

export const WakeRoom = Command.define("WakeRoom", {
  execute: RoomConnection.get.pipe(
    Effect.flatMap((client) => client.wake),
    Effect.ignore,
    Effect.as(Messages.CompletedWake())
  ),
  messages: [Messages.CompletedWake],
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

export const ForgetRoom = Command.define("ForgetRoom", {
  args: { code: RoomCodeSchema },
  execute: ({ code }) =>
    forgetPass(code).pipe(Effect.as(Messages.CompletedForget({ code }))),
  messages: [Messages.CompletedForget],
});

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
