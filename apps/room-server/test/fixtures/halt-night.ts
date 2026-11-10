import { Events } from "@nostakes/engine";
import type { RoomCode, RoomPass } from "@nostakes/protocol";
import { RoomEvents } from "@nostakes/room";
import type { RoomEvent } from "@nostakes/room";
import { Effect, Option, Redacted, Schedule, Schema } from "effect";

import type { HaltEvidence, HaltStandings } from "./night-checks.js";
import { postJson } from "./poker-http.js";
import { pokerCodec } from "./poker-socket.js";
import { inspect, loseStoredEvent } from "./stack.js";

const StandingsBody = Schema.Struct({ view: Schema.Json });

const isHandStart = (event: RoomEvent) =>
  RoomEvents.$is("Table")(event) && Events.$is("HandStarted")(event.event);

const isHandEnd = (event: RoomEvent) =>
  RoomEvents.$is("HandCancelled")(event) ||
  (RoomEvents.$is("Table")(event) && Events.$is("HandEnded")(event.event));

export const rowToLose = (
  events: readonly RoomEvent[]
): Option.Option<number> => {
  const started = events.findLastIndex(isHandStart) + 1;
  const head = events.length;

  if (started === 0) {
    return Option.none();
  }

  const ended = events.slice(started).findIndex(isHandEnd);
  const handEnd = ended === -1 ? head + 1 : started + ended + 1;
  const lost = Math.max(started + 1, Math.min(head - 1, handEnd - 1));

  return lost < head && lost < handEnd ? Option.some(lost) : Option.none();
};

const standingsOf = (base: string, pass: RoomPass) =>
  postJson(new URL(`/rooms/${pass.code}/standings`, base), {
    token: Redacted.value(pass.token),
  }).pipe(
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.map((json): HaltStandings => ({
          label: pass.player,
          status: response.status,
          view: Schema.decodeUnknownOption(StandingsBody)(json).pipe(
            Option.map(({ view }) => view)
          ),
        }))
      )
    ),
    Effect.orDie
  );

export const haltMidHand = (
  base: string,
  code: RoomCode,
  passes: readonly RoomPass[],
  note: (line: string) => void
) =>
  Effect.gen(function* haltTheRoom() {
    const before = yield* inspect(base, code).pipe(
      Effect.map((inspection) => ({
        inspection,
        lost: rowToLose(
          inspection.events.map((text) => pokerCodec.decodeEvent(text))
        ),
      })),
      Effect.repeat({
        schedule: Schedule.spaced("200 millis"),
        times: 50,
        until: ({ lost }) => Option.isSome(lost),
      })
    );

    const seq = yield* Effect.fromOption(before.lost).pipe(Effect.orDie);
    const event = before.inspection.events[seq - 1] ?? "";

    note(`losing stored event ${seq} mid-hand and restarting the room`);
    yield* loseStoredEvent(base, code, seq);

    const standings = yield* Effect.all(
      passes.map((pass) => standingsOf(base, pass))
    );

    note(
      `read the standings of the halted room for ${standings.length} members: ${standings.map(({ status }) => status).join(", ")}`
    );

    return { lost: { event, seq }, standings } satisfies HaltEvidence;
  });
