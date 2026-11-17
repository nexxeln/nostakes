import {
  PlayerIdSchema,
  VoiceAskSchema,
  VoiceRosterSchema,
} from "@nostakes/protocol";
import { Effect, Schema } from "effect";
import { Command } from "foldkit";

import { Messages } from "../features/message.js";
import { VoiceLineResource } from "./connection.js";
import { storedPass } from "./storage.js";
import type { VoiceLine } from "./voice/line.js";

const onLine = <A>(run: (line: VoiceLine) => Effect.Effect<A>) =>
  VoiceLineResource.get.pipe(Effect.flatMap(run), Effect.ignore);

export const SyncVoice = Command.define("SyncVoice", {
  args: { micOpen: Schema.Boolean, roster: VoiceRosterSchema },
  execute: ({ micOpen, roster }) =>
    onLine((line) =>
      line.roster(roster).pipe(Effect.andThen(line.mic(micOpen)))
    ).pipe(Effect.as(Messages.SyncedVoice())),
  messages: [Messages.SyncedVoice],
});

export const WakeVoice = Command.define("WakeVoice", {
  execute: onLine((line) => line.wake).pipe(Effect.as(Messages.SyncedVoice())),
  messages: [Messages.SyncedVoice],
});

export const MuteForEveryone = Command.define("MuteForEveryone", {
  args: { code: Schema.String, muted: Schema.Boolean, player: PlayerIdSchema },
  execute: ({ code, muted, player }) =>
    storedPass(code).pipe(
      Effect.flatMap((pass) =>
        Effect.promise(() => import("./voice/session.js")).pipe(
          Effect.flatMap(({ askVoice }) =>
            askVoice(pass, VoiceAskSchema.cases.Mute.make({ muted, player }))
          )
        )
      ),
      Effect.as(Messages.MutedForEveryone({ done: true })),
      Effect.orElseSucceed(() => Messages.MutedForEveryone({ done: false }))
    ),
  messages: [Messages.MutedForEveryone],
});
