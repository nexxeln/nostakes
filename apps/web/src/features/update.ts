import { Actions, ChipsSchema, SeatIndexSchema } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { RoomCodeSchema } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  MemberCommandSchema,
  RoomViews,
} from "@nostakes/room";
import type { MemberCommand, SeenEvent } from "@nostakes/room";
import { Match, Option, Result, Schema } from "effect";
import type * as HttpClient from "effect/http/HttpClient";
import type { ManagedResource, Update } from "foldkit";

import {
  ApplyTheme,
  CopyRoomLink,
  CopyText,
  CreateRoom,
  ForgetRoom,
  JoinRoom,
  SaveLearned,
  SaveSound,
  SendToRoom,
  ShowPath,
  WakeRoom,
} from "../client/commands.js";
import type { RoomConnection } from "../client/connection.js";
import { Messages, ReplyOutcomes } from "./message.js";
import type { Message, ReplyOutcome } from "./message.js";
import { Screens } from "./model.js";
import type { Flags, InRoom, Model } from "./model.js";
import {
  isActing,
  isLegal,
  isLive,
  legalOf,
  openViewOf,
  roomOf,
  settlementText,
  viewOf,
} from "./room.js";
import { draftOf, settingsFrom } from "./settings.js";
import { KEPT_EVENTS, happeningsOf } from "./table/from-room.js";
import type { Hint, TableIntent } from "./table/snapshot.js";
import { roomPath } from "./wire.js";

type Services =
  | HttpClient.HttpClient
  | ManagedResource.ServiceOf<typeof RoomConnection>;

type Return = Update.Return<Model, Message, Services>;

const Commands = MemberCommandSchema.cases;

const freshRoom = (code: InRoom["code"], player: InRoom["player"]): InRoom => ({
  code,
  connected: false,
  copied: "Nothing",
  drafts: { buyIn: "", chips: "", raiseTo: "", seat: Option.none() },
  events: [],
  link: Option.none(),
  notice: Option.none(),
  pending: [],
  player,
  settings: Option.none(),
});

export const init = (flags: Flags): Return => {
  const base = {
    joinCode: "",
    learned: flags.learned,
    nextKey: 1,
    now: 0,
    profile: flags.profile,
    sound: flags.sound,
    theme: flags.theme,
  };

  const opened: Return = Option.match(flags.saved, {
    onNone: () =>
      Option.match(flags.invite, {
        onNone: () => ({
          model: {
            ...base,
            screen: Screens.Home({ busy: false, problem: Option.none() }),
          },
        }),
        onSome: (code) => ({
          model: {
            ...base,
            screen: Screens.Invited({
              busy: false,
              code,
              problem: Option.none(),
            }),
          },
        }),
      }),
    onSome: ({ code, player }) => ({
      model: {
        ...base,
        screen: Screens.Room({ room: freshRoom(code, player) }),
      },
    }),
  });

  return { ...opened, commands: [ApplyTheme({ theme: flags.theme })] };
};

const withRoom = (model: Model, room: InRoom): Model => ({
  ...model,
  screen: Screens.Room({ room }),
});

const inRoom = (model: Model, step: (room: InRoom) => Return): Return =>
  Option.match(roomOf(model), {
    onNone: () => ({ model }),
    onSome: step,
  });

const editRoom = (model: Model, edit: (room: InRoom) => InRoom): Return =>
  inRoom(model, (room) => ({ model: withRoom(model, edit(room)) }));

const send = (
  model: Model,
  room: InRoom,
  command: MemberCommand,
  label: string
): Return => {
  const key = model.nextKey;

  const acting =
    MemberCommandSchema.guards.Act(command) ||
    MemberCommandSchema.guards.TableHand(command) ||
    MemberCommandSchema.guards.MuckHand(command);

  return {
    commands: [SendToRoom({ command, key })],
    model: {
      ...withRoom(model, {
        ...room,
        notice: Option.none(),
        pending: [...room.pending, { acting, key, label }],
      }),
      nextKey: key + 1,
    },
  };
};

const actionLabel = (action: Action) =>
  Actions.$match(action, {
    Call: () => "Calling",
    Check: () => "Checking",
    Fold: () => "Folding",
    RaiseTo: ({ to }) => `Raising to ${to}`,
  });

const act = (model: Model, action: Action): Return =>
  inRoom(model, (room) =>
    isLive(room) &&
    !isActing(room) &&
    Option.exists(legalOf(room), (legal) => isLegal(legal, action))
      ? send(
          model,
          { ...room, drafts: { ...room.drafts, raiseTo: "" } },
          Commands.Act.make({ action }),
          actionLabel(action)
        )
      : { model }
  );

const notice = (room: InRoom, text: string): InRoom => ({
  ...room,
  notice: Option.some(text),
});

const wholeNumber = (text: string) => {
  const trimmed = text.trim();
  const value = Number(trimmed);

  return trimmed.length > 0 && Number.isSafeInteger(value)
    ? Option.some(value)
    : Option.none();
};

const sit = (model: Model, seatNumber: number): Return =>
  inRoom(model, (room) => {
    const seat = Schema.decodeOption(SeatIndexSchema)(seatNumber);

    const buyIn = wholeNumber(room.drafts.buyIn).pipe(
      Option.flatMap(Schema.decodeOption(ChipAmountSchema))
    );

    return Option.match(Option.all({ buyIn, seat }), {
      onNone: () => ({
        model: withRoom(model, notice(room, "Type a whole number of chips.")),
      }),
      onSome: (request) =>
        send(
          model,
          { ...room, drafts: { ...room.drafts, seat: Option.none() } },
          Commands.RequestSeat.make(request),
          `Asking for seat ${seatNumber + 1}`
        ),
    });
  });

const requestChips = (model: Model): Return =>
  inRoom(model, (room) =>
    Option.match(
      wholeNumber(room.drafts.chips).pipe(
        Option.flatMap(Schema.decodeOption(ChipAmountSchema))
      ),
      {
        onNone: () => ({
          model: withRoom(model, notice(room, "Type a whole number of chips.")),
        }),
        onSome: (amount) =>
          send(
            model,
            { ...room, drafts: { ...room.drafts, chips: "" } },
            Commands.RequestChips.make({ amount }),
            `Adding ${amount} chips`
          ),
      }
    )
  );

const pickSeat = (model: Model, seat: number): Return =>
  editRoom(model, (room) => ({
    ...room,
    drafts: {
      ...room.drafts,
      buyIn:
        room.drafts.buyIn === ""
          ? Option.match(openViewOf(room), {
              onNone: () => "",
              onSome: ({ settings }) => String(settings.buyIn.max),
            })
          : room.drafts.buyIn,
      seat: Option.some(seat),
    },
  }));

const showdownChoice = (
  model: Model,
  command: MemberCommand,
  label: string
): Return =>
  inRoom(model, (room) =>
    isLive(room) && !isActing(room)
      ? send(model, room, command, label)
      : { model }
  );

const learn = (model: Model, hint: Hint): Return => {
  if (model.learned.includes(hint)) {
    return { model };
  }

  const learned = [...model.learned, hint];

  return { commands: [SaveLearned({ learned })], model: { ...model, learned } };
};

const fromTable = (model: Model, intent: TableIntent): Return =>
  Match.value(intent).pipe(
    Match.tagsExhaustive({
      Call: () => act(model, Actions.Call()),
      Check: () => act(model, Actions.Check()),
      Fold: () => act(model, Actions.Fold()),
      Learned: ({ hint }) => learn(model, hint),
      Muck: () => showdownChoice(model, Commands.MuckHand.make({}), "Mucking"),
      Raise: ({ to }) =>
        Option.match(Schema.decodeOption(ChipsSchema)(to), {
          onNone: () => ({ model }),
          onSome: (amount) => act(model, Actions.RaiseTo({ to: amount })),
        }),
      Show: () => showdownChoice(model, Commands.TableHand.make({}), "Showing"),
      Sit: ({ seat }) => pickSeat(model, seat),
    })
  );

const remember = (room: InRoom, seq: number, event: SeenEvent): InRoom => {
  const fresh = happeningsOf(seq, event);

  return fresh.length === 0
    ? room
    : { ...room, events: [...room.events, ...fresh].slice(-KEPT_EVENTS) };
};

const settle = (room: InRoom, key: number, outcome: ReplyOutcome): InRoom => {
  const sent = room.pending.find((pending) => pending.key === key);

  if (sent === undefined) {
    return room;
  }

  const pending = room.pending.filter((entry) => entry.key !== key);

  return ReplyOutcomes.match(outcome, {
    Accepted: () => ({ ...room, pending }),
    Lost: ({ reason }) => ({
      ...room,
      notice: Option.some(`${sent.label} did not reach the room: ${reason}`),
      pending,
    }),
    Rejected: ({ reason }) => ({
      ...room,
      notice: Option.some(reason),
      pending,
    }),
  });
};

export const update = (model: Model, message: Message): Return =>
  Messages.match(message, {
    AcquiredConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: true })),
    AppliedEvent: ({ event, seq }) =>
      editRoom(model, (room) => remember(room, seq, event)),
    ChangedDraft: ({ field, value }) =>
      editRoom(model, (room) => ({
        ...room,
        drafts: { ...room.drafts, [field]: value },
      })),
    ChangedJoinCode: ({ value }) => ({
      model: { ...model, joinCode: value.toUpperCase() },
    }),
    ChangedName: ({ value }) => ({
      model: { ...model, profile: { ...model.profile, name: value } },
    }),
    ChangedSetting: ({ path, value }) =>
      editRoom(model, (room) => ({
        ...room,
        settings: room.settings.pipe(
          Option.map((draft) => ({ ...draft, [path]: value }))
        ),
      })),
    ChoseTheme: ({ theme }) => ({
      commands: [ApplyTheme({ theme: Option.some(theme) })],
      model: { ...model, theme: Option.some(theme) },
    }),
    ClickedAction: ({ action }) => act(model, action),
    ClickedCancelSeat: () =>
      editRoom(model, (room) => ({
        ...room,
        drafts: { ...room.drafts, seat: Option.none() },
      })),
    ClickedCloseSettings: () =>
      editRoom(model, (room) => ({ ...room, settings: Option.none() })),
    ClickedCopyLink: () =>
      inRoom(model, (room) => ({
        commands: [CopyRoomLink({ code: room.code })],
        model,
      })),
    ClickedCopySettlement: () =>
      inRoom(model, (room) =>
        Option.match(
          viewOf(room).pipe(Option.filter(RoomViews.$is("Closed"))),
          {
            onNone: () => ({ model }),
            onSome: (closed) => ({
              commands: [CopyText({ text: settlementText(closed) })],
              model,
            }),
          }
        )
      ),
    ClickedHome: () =>
      inRoom(model, (room) => ({
        commands: [ShowPath({ path: "/" }), ForgetRoom({ code: room.code })],
        model: {
          ...model,
          screen: Screens.Home({ busy: false, problem: Option.none() }),
        },
      })),
    ClickedOpenSettings: () =>
      editRoom(model, (room) => ({
        ...room,
        settings: openViewOf(room).pipe(
          Option.map(({ settings }) => draftOf(settings))
        ),
      })),
    ClickedRequestChips: () => requestChips(model),
    ClickedRoomCommand: ({ command, label }) =>
      MemberCommandSchema.guards.Act(command)
        ? act(model, command.action)
        : inRoom(model, (room) =>
            isLive(room) ? send(model, room, command, label) : { model }
          ),
    ClickedSaveSettings: () =>
      inRoom(model, (room) =>
        Option.match(room.settings, {
          onNone: () => ({ model }),
          onSome: (draft) =>
            Result.match(settingsFrom(draft), {
              onFailure: (problem) => ({
                model: withRoom(model, notice(room, problem)),
              }),
              onSuccess: (settings) =>
                send(
                  model,
                  { ...room, settings: Option.none() },
                  Commands.ChangeSettings.make({ settings }),
                  "Saving the settings"
                ),
            }),
        })
      ),
    ClickedSeat: ({ seat }) => pickSeat(model, seat),
    ClickedSit: ({ seat }) => sit(model, seat),
    CompletedCopy: ({ copied }) =>
      editRoom(model, (room) => ({ ...room, copied })),
    CompletedForget: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    CompletedPreference: () => ({ model }),
    CompletedWake: () => ({ model }),
    EnteredRoom: ({ code, player }) => ({
      commands: [ShowPath({ path: roomPath(code) })],
      model: withRoom(model, freshRoom(code, player)),
    }),
    FailedConnection: ({ problem }) =>
      editRoom(model, (room) => notice(room, problem)),
    FailedEntry: ({ problem }) => ({
      model: {
        ...model,
        screen: Screens.match(model.screen, {
          Home: () =>
            Screens.Home({ busy: false, problem: Option.some(problem) }),
          Invited: ({ code }) =>
            Screens.Invited({
              busy: false,
              code,
              problem: Option.some(problem),
            }),
          Room: () => model.screen,
        }),
      },
    }),
    GotLink: ({ link }) =>
      editRoom({ ...model, now: link.receivedAt }, (room) => {
        const next = { ...room, link: Option.some(link) };

        return Option.isSome(legalOf(next))
          ? next
          : { ...next, drafts: { ...next.drafts, raiseTo: "" } };
      }),
    GotReply: ({ key, outcome }) =>
      editRoom(model, (room) => settle(room, key, outcome)),
    GotTableIntent: ({ intent }) => fromTable(model, intent),
    PickedAvatar: ({ avatar }) => ({
      model: { ...model, profile: { ...model.profile, avatar } },
    }),
    ReleasedConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: false })),
    SubmittedCreate: () => {
      const name = model.profile.name.trim();

      if (!Screens.guards.Home(model.screen) || model.screen.busy) {
        return { model };
      }

      return name.length > 0
        ? {
            commands: [CreateRoom({ avatar: model.profile.avatar, name })],
            model: {
              ...model,
              profile: { ...model.profile, name },
              screen: Screens.Home({ busy: true, problem: Option.none() }),
            },
          }
        : {
            model: {
              ...model,
              screen: Screens.Home({
                busy: false,
                problem: Option.some("Type your name first."),
              }),
            },
          };
    },
    SubmittedInvite: () => {
      const name = model.profile.name.trim();

      if (!Screens.guards.Invited(model.screen) || model.screen.busy) {
        return { model };
      }

      const { code } = model.screen;

      return name.length > 0
        ? {
            commands: [JoinRoom({ avatar: model.profile.avatar, code, name })],
            model: {
              ...model,
              profile: { ...model.profile, name },
              screen: Screens.Invited({
                busy: true,
                code,
                problem: Option.none(),
              }),
            },
          }
        : {
            model: {
              ...model,
              screen: Screens.Invited({
                busy: false,
                code,
                problem: Option.some("Type your name first."),
              }),
            },
          };
    },
    SubmittedJoin: () => {
      const name = model.profile.name.trim();

      const code = Schema.decodeOption(RoomCodeSchema)(model.joinCode.trim());

      if (!Screens.guards.Home(model.screen) || model.screen.busy) {
        return { model };
      }

      return Option.match(code, {
        onNone: () => ({
          model: {
            ...model,
            screen: Screens.Home({
              busy: false,
              problem: Option.some("A room code is six letters and digits."),
            }),
          },
        }),
        onSome: (valid) =>
          name.length > 0
            ? {
                commands: [
                  JoinRoom({ avatar: model.profile.avatar, code: valid, name }),
                ],
                model: {
                  ...model,
                  profile: { ...model.profile, name },
                  screen: Screens.Home({ busy: true, problem: Option.none() }),
                },
              }
            : {
                model: {
                  ...model,
                  screen: Screens.Home({
                    busy: false,
                    problem: Option.some("Type your name first."),
                  }),
                },
              },
      });
    },
    SwitchedSound: ({ on }) => ({
      commands: [SaveSound({ on })],
      model: { ...model, sound: on },
    }),
    Ticked: ({ now }) => ({ model: { ...model, now } }),
    WokePage: ({ visible }) =>
      inRoom(model, () =>
        visible ? { commands: [WakeRoom()], model } : { model }
      ),
  });
