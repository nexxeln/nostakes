import {
  StandingsRequestSchema,
  knockStandings,
  knockingPass,
} from "@nostakes/protocol";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import { KnockViewSchema, RoomEvents } from "@nostakes/room";
import type { KnockOutcome, RoomEvent } from "@nostakes/room";
import { Duration, Effect, Option, Schema } from "effect";

import type { NightControl } from "./bot.js";
import { hello } from "./intruder.js";
import { postJson } from "./poker-http.js";
import { pokerCodec } from "./poker-socket.js";
import { playRegular } from "./regular.js";
import type { RegularRecord } from "./regular.js";

const { guards } = pokerCodec.server;

export const KNOCK_PLANS = ["LetIn", "TurnAway", "Ignore"] as const;

export type KnockPlan = (typeof KNOCK_PLANS)[number];

const NAMES: Readonly<Record<KnockPlan, string>> = {
  Ignore: "Knocker Waits",
  LetIn: "Knocker In",
  TurnAway: "Knocker Away",
};

const OUTCOMES: Readonly<Record<KnockPlan, KnockOutcome>> = {
  Ignore: "Lapsed",
  LetIn: "LetIn",
  TurnAway: "TurnedAway",
};

const LAST_ANSWERS: Readonly<Record<KnockPlan, string>> = {
  Ignore: "Lapsed",
  LetIn: "RoomOpen",
  TurnAway: "TurnedAway",
};

const ANSWER_WAIT_MS = 45_000;

const NEVER = Number.MAX_SAFE_INTEGER;

export interface KnockRecord {
  readonly plan: KnockPlan;
  readonly player: Option.Option<PlayerId>;
  readonly joined: string;
  readonly door: readonly string[];
  readonly answer: string;
  readonly inside: Option.Option<RegularRecord>;
}

const KnockingPassSchema = knockingPass(Schema.toCodecJson(KnockViewSchema));

const KnockAnswerSchema = knockStandings(Schema.toCodecJson(KnockViewSchema));

const posted = (url: URL, body: Schema.Json) =>
  postJson(url, body).pipe(
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.map((json) => ({ json, status: response.status }))
      )
    ),
    Effect.orDie
  );

const answerIn = ({
  json,
  status,
}: {
  readonly json: Schema.Json;
  readonly status: number;
}) =>
  Option.match(Schema.decodeUnknownOption(KnockAnswerSchema)(json), {
    onNone: () =>
      status === 409 && JSON.stringify(json) === '{"refusal":"RoomOpen"}'
        ? "RoomOpen"
        : `${status} ${JSON.stringify(json)}`,
    onSome: ({ knock }) => knock.answer,
  });

const doorOf = (pass: RoomPass, label: string, base: string) =>
  hello(base, pass, label).pipe(
    Effect.flatMap(({ socket }) =>
      socket.disconnect.pipe(
        Effect.as(
          socket.arrivals.map(({ message }) =>
            guards.Closing(message) ? `Closing ${message.reason}` : message._tag
          )
        )
      )
    )
  );

export const knockAndWait = (
  base: string,
  code: RoomPass["code"],
  plan: KnockPlan,
  control: NightControl,
  note: (line: string) => void,
  answered: () => void
) =>
  Effect.gen(function* knockAtTheDoor() {
    const joined = yield* posted(new URL(`/rooms/${code}/members`, base), {
      avatar: "knocker",
      name: NAMES[plan],
    });

    const knocked = Schema.decodeUnknownOption(KnockingPassSchema)(joined.json);

    if (Option.isNone(knocked)) {
      answered();

      return {
        answer: "never knocked",
        door: [],
        inside: Option.none(),
        joined: `${joined.status} ${JSON.stringify(joined.json)}`,
        plan,
        player: Option.none(),
      } satisfies KnockRecord;
    }

    const pass: RoomPass = {
      code: knocked.value.code,
      player: knocked.value.player,
      token: knocked.value.token,
    };

    const door = yield* doorOf(pass, `${NAMES[plan]} at the door`, base);

    control.knocks.set(pass.player, plan);
    note(`${NAMES[plan]} knocked as ${pass.player}`);

    const read = () =>
      posted(
        new URL(`/rooms/${code}/standings`, base),
        Schema.encodeSync(StandingsRequestSchema)({ token: pass.token })
      ).pipe(Effect.map(answerIn));

    let answer = yield* read();
    const asked = performance.now();

    while (
      answer === "Waiting" &&
      !control.stop &&
      performance.now() - asked < ANSWER_WAIT_MS
    ) {
      yield* Effect.sleep(Duration.millis(250));
      answer = yield* read();
    }

    answered();
    note(`${NAMES[plan]} read ${answer} at the door`);

    const inside =
      plan === "LetIn" && answer === "RoomOpen"
        ? Option.some(
            yield* playRegular(base, pass, control, NEVER, control.seats, note)
          )
        : Option.none<RegularRecord>();

    return {
      answer,
      door,
      inside,
      joined: `${joined.status} ${knocked.value.knock.answer}`,
      plan,
      player: Option.some(pass.player),
    } satisfies KnockRecord;
  });

const about = (events: readonly RoomEvent[], player: PlayerId) =>
  events.flatMap((event, index) =>
    "player" in event && event.player === player ? [{ event, index }] : []
  );

const logProblems = (
  record: KnockRecord,
  player: PlayerId,
  events: readonly RoomEvent[],
  knockSeconds: number
): readonly string[] => {
  const mine = about(events, player);
  const knocked = mine.find(({ event }) => RoomEvents.$is("Knocked")(event));

  const answer = mine.find(({ event }) =>
    RoomEvents.$is("KnockAnswered")(event)
  );

  if (knocked === undefined || answer === undefined) {
    return [`the log holds no knock and answer for ${record.plan}`];
  }

  const outcome = RoomEvents.$is("KnockAnswered")(answer.event)
    ? answer.event.outcome
    : "none";

  const joinedNext = events[answer.index + 1];

  const lapsedAfter = answer.event.at - knocked.event.at;

  const others = mine.filter(
    ({ event }) =>
      !RoomEvents.$is("Knocked")(event) &&
      !RoomEvents.$is("KnockAnswered")(event)
  );

  const entered = record.inside.pipe(
    Option.flatMap(({ ranges }) =>
      Option.fromUndefinedOr(
        ranges.find(({ from }) => from <= answer.index + 1)
      )
    )
  );

  return [
    ...(outcome === OUTCOMES[record.plan]
      ? []
      : [
          `the ${record.plan} knock was answered ${outcome}, not ${OUTCOMES[record.plan]}`,
        ]),
    ...(record.plan === "LetIn" &&
    !(
      joinedNext !== undefined &&
      RoomEvents.$is("MemberJoined")(joinedNext) &&
      joinedNext.player === player
    )
      ? ["the knocker let in did not join in the same batch as the answer"]
      : []),
    ...(record.plan === "Ignore" && lapsedAfter < knockSeconds * 1000
      ? [
          `the ignored knock lapsed ${lapsedAfter} ms after it knocked, before the ${knockSeconds} s wait`,
        ]
      : []),
    ...(record.plan === "LetIn"
      ? []
      : others.map(
          ({ event }) =>
            `the ${record.plan} knocker, never let in, caused ${event._tag}`
        )),
    ...Option.match(entered, {
      onNone: () => [],
      onSome: ({ from, to }) => [
        `the knocker let in received events ${from}..${to}, from before it was let in at ${answer.index + 1}`,
      ],
    }),
  ];
};

export const knockProblems = (
  records: readonly KnockRecord[],
  events: readonly RoomEvent[],
  knockSeconds: number
): readonly string[] =>
  records.flatMap((record) => [
    ...(record.joined === "202 Waiting"
      ? []
      : [
          `the ${record.plan} knock answered ${record.joined}, not 202 with a waiting knock`,
        ]),
    ...(record.door.join(",") === "Closing Knocking"
      ? []
      : [
          `the ${record.plan} knock pass said Hello and got ${record.door.join(",") || "nothing"}, not only a Knocking close`,
        ]),
    ...(record.answer === LAST_ANSWERS[record.plan]
      ? []
      : [
          `the ${record.plan} knocker read ${record.answer} at the door, not ${LAST_ANSWERS[record.plan]}`,
        ]),
    ...(record.plan === "LetIn" && Option.isNone(record.inside)
      ? ["the knocker let in never came inside"]
      : []),
    ...Option.match(record.player, {
      onNone: () => [],
      onSome: (player) => logProblems(record, player, events, knockSeconds),
    }),
  ]);
