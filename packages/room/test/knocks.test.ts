import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import { Option, Predicate, Result, Schema } from "effect";

import {
  AlreadyKnocked,
  Audiences,
  MOST_KNOCKS,
  MOST_PEOPLE,
  MOST_WAITING,
  NotKnocking,
  RemovedFromRoom,
  RoomCommands,
  RoomEventSchema,
  RoomEvents,
  RoomLocked,
  RoomStates,
  RoomViews,
  TooManyKnocking,
  TooManyKnocks,
  TooManyPeople,
  audienceOf,
  decide,
  evolveWithoutRecap,
  holdsPlace,
  invariants,
  knockView,
  redact,
  viewFor,
  waitingKnocks,
} from "../src/index.js";
import type {
  Audience,
  Open,
  RoomEvent,
  RoomSettings,
  RoomState,
} from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  ms,
  openedBy,
  player,
  rejection,
  roomCode,
  run,
  runAll,
  settings,
} from "./fixtures.js";
import { audiencesOf, asSent } from "./observers.js";
import { generated } from "./scale.js";
import { playSession, session } from "./sessions.js";
import type { Session, Step } from "./sessions.js";

const approving: RoomSettings = {
  ...settings,
  approval: { ...settings.approval, joins: true },
};

const withApproval = (chosen: RoomSettings): RoomSettings => ({
  ...chosen,
  approval: { ...chosen.approval, joins: true },
});

const knocking = (who: PlayerId, at = 10, name: string = who) =>
  RoomCommands.Join({ at: ms(at), avatar: "heart", by: as(who), name });

const letIn = (who: PlayerId, at = 20, by: PlayerId = ann) =>
  RoomCommands.LetIn({ at: ms(at), by: as(by), player: who });

const turnAway = (who: PlayerId, at = 20) =>
  RoomCommands.TurnAway({ at: ms(at), by: as(ann), player: who });

const change = (chosen: RoomSettings, at = 15) =>
  RoomCommands.ChangeSettings({ at: ms(at), by: as(ann), settings: chosen });

const knockingFor = (state: RoomState, audience: Audience) => {
  const view = viewFor(state, audience, ms(0));

  return RoomViews.$is("Open")(view) ? view.knocking : [];
};

const answerOf = (state: RoomState, who: PlayerId) =>
  knockView(state, who).pipe(Option.map(({ answer }) => answer));

const strangers = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => player(`k${from + index}`));

const withCat = runAll(openedBy(ann), [
  RoomCommands.Join({ at: ms(1), avatar: "", by: as(cat), name: "Cat" }),
  change(approving, 5),
]);

describe("knocking at a room whose host approves joins", () => {
  it("lets someone who left come back with their pass without knocking, and refuses a removed person and anyone at a locked door", () => {
    const left = runAll(withCat, [
      RoomCommands.LeaveRoom({ at: ms(10), by: as(cat) }),
    ]);

    expect(
      run(
        left,
        RoomCommands.Join({ at: ms(11), avatar: "", by: as(cat), name: "Cat" })
      ).events.map(({ _tag }) => _tag)
    ).toStrictEqual(["MemberJoined"]);

    const removed = run(
      withCat,
      RoomCommands.RemoveMember({ at: ms(10), by: as(ann), player: cat })
    ).state;

    expect(rejection(removed, knocking(cat, 11))).toStrictEqual(
      new RemovedFromRoom({ player: cat })
    );

    const locked = run(
      withCat,
      change({ ...approving, locked: true }, 10)
    ).state;

    expect(rejection(locked, knocking(bob, 11))).toStrictEqual(
      new RoomLocked({ code: roomCode })
    );
  });

  it("refuses a second knock from the same pass, whether it still waits or was answered", () => {
    const knocked = run(withCat, knocking(bob)).state;
    const away = run(knocked, turnAway(bob)).state;

    expect([
      rejection(knocked, knocking(bob, 12)),
      rejection(away, knocking(bob, 30)),
    ]).toStrictEqual([
      new AlreadyKnocked({ player: bob }),
      new AlreadyKnocked({ player: bob }),
    ]);
  });
});

describe("answering a knock", () => {
  it("refuses an answer for someone who is not waiting", () => {
    const answered = runAll(withCat, [knocking(bob), turnAway(bob)]);

    expect([
      rejection(answered, letIn(bob, 30)),
      rejection(answered, turnAway(dan, 30)),
    ]).toStrictEqual([
      new NotKnocking({ player: bob }),
      new NotKnocking({ player: dan }),
    ]);
  });

  it("keeps the knock waiting while the room is full, and lets the person in once the host makes room", () => {
    const crowd = Array.from({ length: MOST_PEOPLE - 1 }, (_, index) =>
      player(`m${index}`)
    );

    const full = runAll(
      openedBy(ann),
      crowd.map((who, index) =>
        RoomCommands.Join({
          at: ms(index + 1),
          avatar: "",
          by: as(who),
          name: who,
        })
      )
    );

    expect(
      rejection(run(full, change(approving, 30)).state, knocking(bob, 40))
    ).toStrictEqual(
      new TooManyPeople({ most: MOST_PEOPLE, people: MOST_PEOPLE })
    );

    const roomForOne = runAll(full, [
      RoomCommands.RemoveMember({
        at: ms(30),
        by: as(ann),
        player: crowd[0] ?? ann,
      }),
      change(approving, 31),
      knocking(bob, 40),
    ]);

    const filled = runAll(roomForOne, [
      change(settings, 42),
      RoomCommands.Join({ at: ms(43), avatar: "", by: as(cat), name: "Cat" }),
    ]);

    expect(rejection(filled, letIn(bob, 50))).toStrictEqual(
      new TooManyPeople({ most: MOST_PEOPLE, people: MOST_PEOPLE })
    );
    expect(answerOf(filled, bob)).toStrictEqual(Option.some("Waiting"));
    expect(
      run(
        run(
          filled,
          RoomCommands.RemoveMember({ at: ms(60), by: as(ann), player: cat })
        ).state,
        letIn(bob, 61)
      ).events.map(({ _tag }) => _tag)
    ).toStrictEqual(["KnockAnswered", "MemberJoined"]);
  });
});

describe("the limits at the door", () => {
  it("keeps at most three people waiting at once and takes at most a hundred knocks a night", () => {
    const full = runAll(
      withCat,
      strangers(0, MOST_WAITING).map((who, index) => knocking(who, 10 + index))
    );

    expect(rejection(full, knocking(bob, 20))).toStrictEqual(
      new TooManyKnocking({ most: MOST_WAITING })
    );

    const night = runAll(
      withCat,
      strangers(0, MOST_KNOCKS).flatMap((who, index) => [
        knocking(who, 10 + index * 2),
        turnAway(who, 11 + index * 2),
      ])
    );

    expect(rejection(night, knocking(bob, 1000))).toStrictEqual(
      new TooManyKnocks({ most: MOST_KNOCKS })
    );
  });

  it("gives the knocker only their own name, face, room code, and answer; nothing once let in; the night over if it ends while they wait; and a place only while they wait", () => {
    const knocked = runAll(withCat, [
      knocking(bob, 10, "Bob"),
      knocking(dan, 11, "Dan"),
    ]);

    const admitted = run(knocked, letIn(bob)).state;

    const closed = run(
      admitted,
      RoomCommands.CloseRoom({ at: ms(30), by: as(ann) })
    ).state;

    expect({
      admitted: [knockView(admitted, bob), holdsPlace(admitted, bob)],
      closed: [answerOf(closed, dan), holdsPlace(closed, dan)],
      waiting: [knockView(knocked, dan), holdsPlace(knocked, dan)],
    }).toStrictEqual({
      admitted: [Option.none(), true],
      closed: [Option.some("NightOver"), false],
      waiting: [
        Option.some({
          answer: "Waiting",
          avatar: "heart",
          code: roomCode,
          name: "Dan",
        }),
        true,
      ],
    });
    expect(holdsPlace(run(knocked, turnAway(dan)).state, dan)).toBe(false);
  });
});

const encodeEvent = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(RoomEventSchema))
);

const isOpen = (state: RoomState): state is Open =>
  RoomStates.$is("Open")(state);

const memberAudiences = (state: Open): readonly Audience[] => [
  ...audiencesOf(state),
  ...[...state.members, ...state.departed].map(({ player: who }) =>
    audienceOf(state, who)
  ),
];

export const detailProblems = (step: Step): readonly string[] => {
  const { after } = step;

  if (!isOpen(after)) {
    return [];
  }

  const waiting = waitingKnocks(after).map(({ player: who }) => who);

  const views = memberAudiences(after).flatMap((audience) => {
    const viewer = Audiences.$match(audience, {
      Seated: ({ player: who }) => Option.some(who),
      Spectator: () => Option.none(),
      Unseated: ({ player: who }) => Option.some(who),
    });

    const shown = knockingFor(after, audience).map(({ player: who }) => who);
    const expected = Option.contains(viewer, after.host) ? waiting : [];

    return JSON.stringify(shown) === JSON.stringify(expected)
      ? []
      : [
          `${audience._tag} ${Option.getOrElse(viewer, () => "")} sees ${shown.join(",")}`,
        ];
  });

  const events = step.events
    .filter(
      (event) =>
        RoomEvents.$is("Knocked")(event) ||
        RoomEvents.$is("KnockAnswered")(event)
    )
    .flatMap((event) =>
      memberAudiences(after).flatMap((audience) => {
        const sent = redact(event, audience);

        return JSON.stringify(Object.keys(sent).toSorted()) ===
          JSON.stringify(["_tag", "at"])
          ? []
          : [
              `${event._tag} reached ${audience._tag} as ${JSON.stringify(asSent(sent))}`,
            ];
      })
    );

  return [...views, ...events];
};

const asTheJoin = (step: Step): readonly string[] => {
  const { before, command } = step;

  if (!RoomCommands.$is("LetIn")(command) || !isOpen(before)) {
    return [];
  }

  const knock = waitingKnocks(before).find(
    ({ player: who }) => who === command.player
  );

  if (knock === undefined) {
    return Result.isSuccess(step.decision)
      ? [`let in ${command.player}, who was not waiting`]
      : [];
  }

  const joined = decide(
    {
      ...before,
      knocks: before.knocks.filter(({ player: who }) => who !== knock.player),
      settings: {
        ...before.settings,
        approval: { ...before.settings.approval, joins: false },
      },
    },
    RoomCommands.Join({
      at: command.at,
      avatar: knock.avatar,
      by: as(knock.player),
      name: knock.name,
    })
  );

  const outcome = Result.match(step.decision, {
    onFailure: (refused) => `refused ${refused._tag}`,
    onSuccess: ([first, ...rest]) =>
      first !== undefined && RoomEvents.$is("KnockAnswered")(first)
        ? `${first.outcome} ${rest.map((event) => encodeEvent(event)).join(" ")}`
        : `answered with ${first?._tag ?? "nothing"}`,
  });

  const expected = Result.match(joined, {
    onFailure: (refused) =>
      Predicate.isTagged(refused, "NameTaken")
        ? "NameTaken "
        : `refused ${refused._tag}`,
    onSuccess: (events) =>
      `LetIn ${events.map((event) => encodeEvent(event)).join(" ")}`,
  });

  const refusedForAnotherReason = Result.match(step.decision, {
    onFailure: (refused) => !Predicate.isTagged(refused, "TooManyPeople"),
    onSuccess: () => false,
  });

  if (refusedForAnotherReason || outcome === expected) {
    return [];
  }

  return [`let in gave ${outcome}, the join would give ${expected}`];
};

const people = (state: RoomState) =>
  isOpen(state)
    ? JSON.stringify({
        departed: state.departed,
        entries: [...state.entries],
        members: state.members,
        removed: state.removed,
        seats: state.table.seats,
      })
    : "";

const isRefusal = (event: RoomEvent) =>
  RoomEvents.$is("KnockAnswered")(event) && event.outcome !== "LetIn";

export const traceProblems = (step: Step): readonly string[] => {
  if (!isOpen(step.before) || !isOpen(step.after)) {
    return [];
  }

  let withoutRefusals: RoomState = step.before;

  for (const event of step.events.filter((each) => !isRefusal(each))) {
    withoutRefusals = evolveWithoutRecap(withoutRefusals, event);
  }

  const onlyRefusals =
    (RoomCommands.$is("TurnAway")(step.command) ||
      RoomCommands.$is("LapseKnocks")(step.command)) &&
    !step.events.every(
      (event) => isRefusal(event) || RoomEvents.$is("StallCleared")(event)
    );

  const lockedWithKnocks =
    step.after.settings.locked && waitingKnocks(step.after).length > 0;

  return [
    ...(people(withoutRefusals) === people(step.after)
      ? []
      : [
          `${step.command._tag} changed the people or the ledger through a refused knock`,
        ]),
    ...(onlyRefusals ? [`${step.command._tag} caused more than refusals`] : []),
    ...(lockedWithKnocks
      ? [`${step.command._tag} left a knock waiting in a locked room`]
      : []),
  ];
};

const knockProblems = (
  source: Session,
  check: (step: Step) => readonly string[]
) => playSession(source, undefined, withApproval).steps.flatMap(check);

describe("generated nights with join approval", () => {
  it.prop(
    "keep every invariant after every event",
    { source: session },
    ({ source }) => {
      const broken: string[] = [];

      playSession(
        source,
        (state, event) => {
          for (const found of invariants(state)) {
            broken.push(`${event._tag}: ${found.invariant} ${found.detail}`);
          }
        },
        withApproval
      );

      expect(broken).toStrictEqual([]);
    },
    generated(15, 40)
  );

  it.prop(
    "show who is knocking only to the host, and a knock to every audience as nothing but its time",
    { source: session },
    ({ source }) => {
      expect(knockProblems(source, detailProblems)).toStrictEqual([]);
    },
    generated(15, 40)
  );

  it.prop(
    "let a person in with exactly the join they would have made with approval off at that moment, or end the knock when their name was taken meanwhile",
    { source: session },
    ({ source }) => {
      expect(knockProblems(source, asTheJoin)).toStrictEqual([]);
    },
    generated(15, 40)
  );

  it.prop(
    "turn people away, lapse their knocks, and lock them out without touching the members, the people who left, the removed, the seats, or the ledger, and leave nobody waiting at a locked door",
    { source: session },
    ({ source }) => {
      expect(knockProblems(source, traceProblems)).toStrictEqual([]);
    },
    generated(15, 40)
  );
});
