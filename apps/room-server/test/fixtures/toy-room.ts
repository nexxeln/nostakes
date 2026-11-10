import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { PlayerId, RoomCode } from "@nostakes/protocol";
import { Array as Arr, Option, Order, Result, Schema } from "effect";
import * as Hex from "effect/encoding/Hex";

import type { Deadline, HostedRoom } from "../../src/hosted-room.js";
import type { RetryPolicy } from "../../src/refused-deadline.js";
import { ToyRefusal } from "./toy-refusal.js";

export const SECRET_BYTES = 8;

export const TOY_MAX_MEMBERS = 64;

export const DEAL_ENTROPY_BYTES = SECRET_BYTES * TOY_MAX_MEMBERS;

export const TOY_RETRIES: RetryPolicy = {
  capMs: 800,
  firstMs: 200,
  stallAfter: 3,
};

const Millis = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40));

const Avatar = Schema.String.check(Schema.isMaxLength(64));

export const SecretSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{16}$/u)
);

export const ProfileSchema = Schema.Struct({ avatar: Avatar, name: Name });

export type Profile = typeof ProfileSchema.Type;

export const ToyMemberCommandSchema = Schema.TaggedUnion({
  Act: {},
  Corrupt: {},
  Explode: {},
  Increment: {
    times: Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 1 })),
  },
  Jam: { on: Schema.Boolean, throws: Schema.optionalKey(Schema.Boolean) },
  Join: { avatar: Avatar, name: Name },
  RequestDeal: {},
  StartTurn: {
    ms: Schema.Int.check(Schema.isBetween({ maximum: 600_000, minimum: 1 })),
  },
});

export type ToyMemberCommand = typeof ToyMemberCommandSchema.Type;

export const ToyServerCommandSchema = Schema.TaggedUnion({
  Deal: { entropy: Schema.Uint8Array },
  ExpireTurn: { deadline: Millis },
  MarkStalled: {},
});

export type ToyServerCommand = typeof ToyServerCommandSchema.Type;

export const ToyCommandSchema = Schema.TaggedUnion({
  Member: { at: Millis, by: PlayerIdSchema, command: ToyMemberCommandSchema },
  Server: { at: Millis, command: ToyServerCommandSchema },
});

export type ToyCommand = typeof ToyCommandSchema.Type;

const NegativeFuse = Schema.Int.check(Schema.isLessThan(0));

export const ToyEventSchema = Schema.TaggedUnion({
  Acted: { player: PlayerIdSchema },
  DealRequested: { by: PlayerIdSchema, due: Millis },
  Exploded: { fuse: NegativeFuse },
  Incremented: { by: PlayerIdSchema, count: Schema.Int },
  Jammed: { on: Schema.Boolean, throws: Schema.optionalKey(Schema.Boolean) },
  Joined: { avatar: Avatar, name: Name, player: PlayerIdSchema },
  Opened: { at: Millis, code: RoomCodeSchema, host: PlayerIdSchema },
  SecretDealt: { round: Schema.Int, secret: SecretSchema, to: PlayerIdSchema },
  StallCleared: { at: Millis },
  Stalled: { at: Millis },
  TurnExpired: { deadline: Millis, player: PlayerIdSchema },
  TurnStarted: { deadline: Millis, player: PlayerIdSchema },
});

export type ToyEvent = typeof ToyEventSchema.Type;

export const ToyRedactedSchema = Schema.TaggedUnion({
  Acted: { player: PlayerIdSchema },
  DealRequested: { by: PlayerIdSchema, due: Millis },
  Exploded: { fuse: Schema.Int },
  Incremented: { by: PlayerIdSchema, count: Schema.Int },
  Jammed: { on: Schema.Boolean, throws: Schema.optionalKey(Schema.Boolean) },
  Joined: { avatar: Avatar, name: Name, player: PlayerIdSchema },
  Opened: { at: Millis, code: RoomCodeSchema, host: PlayerIdSchema },
  SecretDealt: {
    round: Schema.Int,
    secret: Schema.OptionFromNullOr(SecretSchema),
    to: PlayerIdSchema,
  },
  StallCleared: { at: Millis },
  Stalled: { at: Millis },
  TurnExpired: { deadline: Millis, player: PlayerIdSchema },
  TurnStarted: { deadline: Millis, player: PlayerIdSchema },
});

export type ToyRedacted = typeof ToyRedactedSchema.Type;

export const ToyAudienceSchema = Schema.TaggedUnion({
  Member: { player: PlayerIdSchema },
  Spectator: {},
});

export type ToyAudience = typeof ToyAudienceSchema.Type;

export const ToyDueSchema = Schema.TaggedUnion({
  Deal: {},
  ExpireTurn: { deadline: Millis },
});

export type ToyDue = typeof ToyDueSchema.Type;

export const ToySignalSchema = Schema.TaggedUnion({
  Point: {},
  Wave: {
    count: Schema.Int.check(Schema.isBetween({ maximum: 99, minimum: 1 })),
  },
});

export type ToySignal = typeof ToySignalSchema.Type;

const MemberViewSchema = Schema.Struct({
  avatar: Avatar,
  name: Name,
  player: PlayerIdSchema,
});

export const ToyViewSchema = Schema.Struct({
  code: Schema.OptionFromNullOr(RoomCodeSchema),
  count: Schema.Int,
  dealDue: Schema.Boolean,
  host: Schema.OptionFromNullOr(PlayerIdSchema),
  members: Schema.Array(MemberViewSchema),
  round: Schema.Int,
  secret: Schema.OptionFromNullOr(SecretSchema),
  stalled: Schema.OptionFromNullOr(Millis),
  turn: Schema.OptionFromNullOr(
    Schema.Struct({ player: PlayerIdSchema, remainingMs: Schema.Int })
  ),
  you: Schema.OptionFromNullOr(PlayerIdSchema),
});

export type ToyView = typeof ToyViewSchema.Type;

interface Turn {
  readonly player: PlayerId;
  readonly deadline: number;
}

interface Opening {
  readonly code: RoomCode;
  readonly host: PlayerId;
}

export interface ToyState {
  readonly opening: Option.Option<Opening>;
  readonly members: readonly (Profile & { readonly player: PlayerId })[];
  readonly count: number;
  readonly increments: number;
  readonly jammed: boolean;
  readonly jamThrows: boolean;
  readonly round: number;
  readonly secrets: ReadonlyMap<PlayerId, string>;
  readonly stalled: Option.Option<number>;
  readonly turn: Option.Option<Turn>;
  readonly dealDue: Option.Option<number>;
  readonly latest: number;
}

export interface ToyTypes {
  readonly State: ToyState;
  readonly Command: ToyCommand;
  readonly MemberCommand: ToyMemberCommand;
  readonly Event: ToyEvent;
  readonly Redacted: ToyRedacted;
  readonly View: ToyView;
  readonly Rejection: ToyRefusal;
  readonly Audience: ToyAudience;
  readonly Due: ToyDue;
  readonly OpenRequest: Profile;
  readonly JoinRequest: Profile;
  readonly Signal: ToySignal;
}

const emptyRoom: ToyState = {
  count: 0,
  dealDue: Option.none(),
  increments: 0,
  jamThrows: false,
  jammed: false,
  latest: 0,
  members: [],
  opening: Option.none(),
  round: 0,
  secrets: new Map(),
  stalled: Option.none(),
  turn: Option.none(),
};

const isMember = (state: ToyState, player: PlayerId) =>
  state.members.some((member) => member.player === player);

const refuse = (reason: ToyRefusal["reason"]) =>
  Result.fail(new ToyRefusal({ reason }));

type Decision = Result.Result<readonly ToyEvent[], ToyRefusal>;

const incremented = (by: PlayerId, count: number) =>
  ToyEventSchema.cases.Incremented.make({ by, count });

const decideMember = (
  state: ToyState,
  by: PlayerId,
  at: number,
  command: ToyMemberCommand
): Decision =>
  ToyMemberCommandSchema.guards.Join(command) || isMember(state, by)
    ? ToyMemberCommandSchema.match(command, {
        Act: (): Decision =>
          Option.match(state.turn, {
            onNone: () => refuse("NotYourTurn"),
            onSome: (turn) =>
              turn.player === by
                ? Result.succeed([
                    ToyEventSchema.cases.Acted.make({ player: by }),
                  ])
                : refuse("NotYourTurn"),
          }),
        Corrupt: () => Result.succeed([incremented(by, state.count + 2)]),
        Explode: () =>
          Result.succeed([
            incremented(by, state.count + 1),
            incremented(by, state.count + 2),
            ToyEventSchema.cases.Exploded.make(
              { fuse: 1 },
              { disableChecks: true }
            ),
          ]),
        Increment: ({ times }) =>
          Result.succeed(
            Arr.makeBy(times, (index) =>
              incremented(by, state.count + index + 1)
            )
          ),
        Jam: ({ on, throws }) =>
          Result.succeed([
            ToyEventSchema.cases.Jammed.make({ on, throws: throws === true }),
          ]),
        Join: ({ avatar, name }) =>
          Result.succeed([
            ToyEventSchema.cases.Joined.make({ avatar, name, player: by }),
          ]),
        RequestDeal: () =>
          Option.isSome(state.dealDue)
            ? refuse("DealPending")
            : Result.succeed([
                ToyEventSchema.cases.DealRequested.make({ by, due: at }),
              ]),
        StartTurn: ({ ms }) =>
          Option.isSome(state.turn)
            ? refuse("TurnRunning")
            : Result.succeed([
                ToyEventSchema.cases.TurnStarted.make({
                  deadline: at + ms,
                  player: by,
                }),
              ]),
      })
    : refuse("NotMember");

const secretFor = (entropy: Uint8Array, index: number) =>
  Hex.encode(
    entropy.subarray(index * SECRET_BYTES, (index + 1) * SECRET_BYTES)
  );

const brokenOrRefused = (state: ToyState): Decision => {
  if (state.jamThrows) {
    throw new ToyRefusal({ reason: "Broken" });
  }

  return refuse("Jammed");
};

const answersDeadline = (command: ToyServerCommand) =>
  !ToyServerCommandSchema.guards.MarkStalled(command);

const decideServer = (
  state: ToyState,
  at: number,
  command: ToyServerCommand
): Decision =>
  state.jammed && answersDeadline(command)
    ? brokenOrRefused(state)
    : ToyServerCommandSchema.match(command, {
        Deal: ({ entropy }): Decision =>
          Option.match(state.dealDue, {
            onNone: () => refuse("NoDealDue"),
            onSome: (due) => {
              if (at < due) {
                return refuse("NoDealDue");
              }

              if (entropy.length < state.members.length * SECRET_BYTES) {
                return refuse("NotEnoughEntropy");
              }

              return Result.succeed(
                state.members.map(({ player }, index) =>
                  ToyEventSchema.cases.SecretDealt.make({
                    round: state.round + 1,
                    secret: secretFor(entropy, index),
                    to: player,
                  })
                )
              );
            },
          }),
        ExpireTurn: ({ deadline }): Decision =>
          Option.match(state.turn, {
            onNone: () => refuse("StaleDeadline"),
            onSome: (turn) =>
              turn.deadline === deadline && at >= deadline
                ? Result.succeed([
                    ToyEventSchema.cases.TurnExpired.make({
                      deadline,
                      player: turn.player,
                    }),
                  ])
                : refuse("StaleDeadline"),
          }),
        MarkStalled: (): Decision =>
          Result.succeed(
            Option.isSome(state.stalled)
              ? []
              : [ToyEventSchema.cases.Stalled.make({ at })]
          ),
      });

const clearingStall = (
  state: ToyState,
  at: number,
  command: ToyServerCommand,
  events: readonly ToyEvent[]
): readonly ToyEvent[] =>
  Option.isSome(state.stalled) && answersDeadline(command)
    ? [ToyEventSchema.cases.StallCleared.make({ at }), ...events]
    : events;

const decide = (state: ToyState, command: ToyCommand): Decision =>
  ToyCommandSchema.match(command, {
    Member: ({ at, by, command: member }) =>
      decideMember(state, by, Math.max(at, state.latest), member),
    Server: ({ at, command: server }) =>
      Result.map(
        decideServer(state, Math.max(at, state.latest), server),
        (events) =>
          clearingStall(state, Math.max(at, state.latest), server, events)
      ),
  });

const evolve = (state: ToyState, event: ToyEvent): ToyState =>
  ToyEventSchema.match(event, {
    Acted: () => ({ ...state, turn: Option.none() }),
    DealRequested: ({ due }) => ({
      ...state,
      dealDue: Option.some(due),
      latest: Math.max(state.latest, due),
    }),
    Exploded: () => state,
    Incremented: ({ count }) => ({
      ...state,
      count,
      increments: state.increments + 1,
    }),
    Jammed: ({ on, throws }) => ({
      ...state,
      jamThrows: throws === true,
      jammed: on,
    }),
    Joined: ({ avatar, name, player }) => ({
      ...state,
      members: [...state.members, { avatar, name, player }],
    }),
    Opened: ({ at, code, host }) => ({
      ...state,
      latest: Math.max(state.latest, at),
      opening: Option.some({ code, host }),
    }),
    SecretDealt: ({ round, secret, to }) => ({
      ...state,
      dealDue: Option.none(),
      round,
      secrets: new Map([...state.secrets, [to, secret]]),
    }),
    StallCleared: () => ({ ...state, stalled: Option.none() }),
    Stalled: ({ at }) => ({ ...state, stalled: Option.some(at) }),
    TurnExpired: ({ deadline }) => ({
      ...state,
      latest: Math.max(state.latest, deadline),
      turn: Option.none(),
    }),
    TurnStarted: ({ deadline, player }) => ({
      ...state,
      turn: Option.some({ deadline, player }),
    }),
  });

const replay = (events: Iterable<ToyEvent>) => {
  let state = emptyRoom;

  for (const event of events) {
    state = evolve(state, event);
  }

  return state;
};

const byAt = Order.mapInput(
  Order.Number,
  (deadline: Deadline<ToyDue>) => deadline.at
);

const nextDeadline = (state: ToyState) =>
  Arr.head(
    Arr.sort(
      [
        ...Option.toArray(
          state.turn.pipe(
            Option.map(({ deadline }) => ({
              at: deadline,
              due: ToyDueSchema.cases.ExpireTurn.make({ deadline }),
            }))
          )
        ),
        ...Option.toArray(
          state.dealDue.pipe(
            Option.map((at) => ({
              at,
              due: ToyDueSchema.cases.Deal.make({}),
            }))
          )
        ),
      ],
      byAt
    )
  );

const audienceOf = (state: ToyState, player: PlayerId): ToyAudience =>
  isMember(state, player)
    ? ToyAudienceSchema.cases.Member.make({ player })
    : ToyAudienceSchema.cases.Spectator.make({});

const viewerOf = (audience: ToyAudience) =>
  ToyAudienceSchema.match(audience, {
    Member: ({ player }) => Option.some(player),
    Spectator: () => Option.none<PlayerId>(),
  });

const redact = (event: ToyEvent, audience: ToyAudience) =>
  Option.some(
    ToyEventSchema.match(event, {
      Acted: (acted): ToyRedacted => acted,
      DealRequested: (requested): ToyRedacted => requested,
      Exploded: (exploded): ToyRedacted => exploded,
      Incremented: (incrementedEvent): ToyRedacted => incrementedEvent,
      Jammed: (jammed): ToyRedacted => jammed,
      Joined: (joined): ToyRedacted => joined,
      Opened: (opened): ToyRedacted => opened,
      SecretDealt: ({ round, secret, to }): ToyRedacted =>
        ToyRedactedSchema.cases.SecretDealt.make({
          round,
          secret: Option.contains(viewerOf(audience), to)
            ? Option.some(secret)
            : Option.none(),
          to,
        }),
      StallCleared: (cleared): ToyRedacted => cleared,
      Stalled: (stalled): ToyRedacted => stalled,
      TurnExpired: (expired): ToyRedacted => expired,
      TurnStarted: (started): ToyRedacted => started,
    })
  );

const viewFor = (
  state: ToyState,
  audience: ToyAudience,
  at: number
): ToyView => {
  const you = viewerOf(audience);

  return {
    code: state.opening.pipe(Option.map(({ code }) => code)),
    count: state.count,
    dealDue: Option.isSome(state.dealDue),
    host: state.opening.pipe(Option.map(({ host }) => host)),
    members: state.members,
    round: state.round,
    secret: you.pipe(
      Option.flatMap((player) =>
        Option.fromUndefinedOr(state.secrets.get(player))
      )
    ),
    stalled: state.stalled,
    turn: state.turn.pipe(
      Option.map(({ deadline, player }) => ({
        player,
        remainingMs: Math.max(0, deadline - at),
      }))
    ),
    you,
  };
};

const invariants = (state: ToyState): readonly string[] => [
  ...(state.count === state.increments
    ? []
    : [`count ${state.count} differs from ${state.increments} increments`]),
  ...[...state.secrets.keys()].flatMap((player) =>
    isMember(state, player) ? [] : [`secret held by non-member ${player}`]
  ),
  ...Option.toArray(state.turn).flatMap(({ player }) =>
    isMember(state, player) ? [] : [`turn held by non-member ${player}`]
  ),
];

const signalAllowed = (state: ToyState, sender: PlayerId, signal: ToySignal) =>
  isMember(state, sender) &&
  ToySignalSchema.match(signal, {
    Point: () => Option.exists(state.turn, ({ player }) => player === sender),
    Wave: () => true,
  });

export const toyRoom: HostedRoom<ToyTypes> = {
  attendance: () => Option.none(),
  audienceOf,
  beaconRoundFor: () => Option.none(),
  decide,
  dueKind: (due) => due._tag,
  entropyFor: (due) =>
    ToyDueSchema.match(due, {
      Deal: () => DEAL_ENTROPY_BYTES,
      ExpireTurn: () => 0,
    }),
  evolve,
  invariants,
  joinCommand: ({ avatar, name }) =>
    ToyMemberCommandSchema.cases.Join.make({ avatar, name }),
  nextDeadline,
  open: ({ at, code, host, request }) => [
    ToyEventSchema.cases.Opened.make({ at, code, host }),
    ToyEventSchema.cases.Joined.make({
      avatar: request.avatar,
      name: request.name,
      player: host,
    }),
  ],
  redact,
  replay,
  schemas: {
    event: ToyEventSchema,
    joinRequest: ProfileSchema,
    memberCommand: ToyMemberCommandSchema,
    openRequest: ProfileSchema,
    redacted: ToyRedactedSchema,
    rejection: ToyRefusal,
    signal: ToySignalSchema,
    view: ToyViewSchema,
  },
  serverCommand: (due, at, entropy) =>
    ToyCommandSchema.cases.Server.make({
      at,
      command: ToyDueSchema.match(due, {
        Deal: () => ToyServerCommandSchema.cases.Deal.make({ entropy }),
        ExpireTurn: ({ deadline }) =>
          ToyServerCommandSchema.cases.ExpireTurn.make({ deadline }),
      }),
    }),
  signalAllowed,
  stalled: (state, _due, at) =>
    Option.isSome(state.stalled)
      ? Option.none()
      : Option.some(
          ToyCommandSchema.cases.Server.make({
            at,
            command: ToyServerCommandSchema.cases.MarkStalled.make({}),
          })
        ),
  stamp: (by, at, command) =>
    ToyCommandSchema.cases.Member.make({ at, by, command }),
  viewFor,
};
