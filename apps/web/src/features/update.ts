import { avatarFor, codeFor } from "@nostakes/avatar";
import {
  Actions,
  CardFromText,
  ChipsSchema,
  RunCountSchema,
  SeatIndexSchema,
  ShownCardsSchema,
} from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { RoomCodeSchema } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  MemberCommandSchema,
  RoomSignalSchema,
  RoomViews,
  SeenEvents,
} from "@nostakes/room";
import type {
  MemberCommand,
  Reaction,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import { Match, Option, Result, Schema } from "effect";
import type * as HttpClient from "effect/http/HttpClient";
import type { ManagedResource, Update } from "foldkit";

import {
  ApplyTheme,
  CheckRoom,
  CopyRoomLink,
  CopyText,
  CreateRoom,
  ForgetRoom,
  JoinRoom,
  ReloadPage,
  SaveLearned,
  SaveProfile,
  RememberRoom,
  SaveSound,
  SendToRoom,
  ShowPath,
  ShuffleFace,
  SignalRoom,
  WakeRoom,
} from "../client/commands.js";
import type { RoomConnection } from "../client/connection.js";
import { Messages, ReplyOutcomes } from "./message.js";
import type { Message, ReplyOutcome } from "./message.js";
import { FairMarks, Screens } from "./model.js";
import type { Flags, InRoom, Model } from "./model.js";
import { considerUpdate } from "./page-update.js";
import { rejectionText } from "./rejections.js";
import {
  isActing,
  recordChanged,
  recordOf,
  isLegal,
  isLive,
  isYou,
  legalOf,
  openViewOf,
  roomOf,
  settlementText,
  viewOf,
} from "./room.js";
import { draftOf, settingsFrom } from "./settings.js";
import { forgetExpired, heard, reacted } from "./signals.js";
import {
  KEPT_CLOCK_SAMPLES,
  KEPT_EVENTS,
  clockSampleOf,
  happeningsOf,
} from "./table/from-room.js";
import type { Hint, TableIntent } from "./table/snapshot.js";
import { roomPath } from "./wire.js";

type Services =
  | HttpClient.HttpClient
  | ManagedResource.ServiceOf<typeof RoomConnection>;

type Return = Update.Return<Model, Message, Services>;

const Commands = MemberCommandSchema.cases;

const freshRoom = (code: InRoom["code"], player: InRoom["player"]): InRoom => ({
  clockSamples: [],
  code,
  connected: false,
  copied: "Nothing",
  drafts: { buyIn: "", chips: "", seat: Option.none() },
  events: [],
  fairness: [],
  fairnessOpen: false,
  link: Option.none(),
  menu: false,
  notice: Option.none(),
  peeks: [],
  pending: [],
  picked: Option.none(),
  player,
  reactions: [],
  resumed: Option.none(),
  settings: Option.none(),
  shown: Option.none(),
  update: Option.none(),
});

const KEPT_FAIR_HANDS = 30;

const checksFor = (model: Model) =>
  Screens.guards.Home(model.screen)
    ? model.rooms.map(({ record }) => CheckRoom({ code: record.code }))
    : [];

export const init = (flags: Flags): Return => {
  const base = {
    faceDraft: Option.none(),
    facePart: "Species" as const,
    joinCode: "",
    learned: flags.learned,
    nextKey: 1,
    now: 0,
    profile: flags.profile,
    reloadedFor: flags.reloadedFor,
    rooms: flags.rooms,
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

  return {
    ...opened,
    commands: [ApplyTheme({ theme: flags.theme }), ...checksFor(opened.model)],
  };
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

const editRoomThenUpdate = (
  model: Model,
  edit: (room: InRoom) => InRoom
): Return =>
  inRoom(model, (before) => {
    const room = edit(before);
    const step = considerUpdate(room, model.reloadedFor);

    return {
      commands: Option.toArray(step.reload).map((target) =>
        ReloadPage({ target })
      ),
      model: withRoom(model, { ...room, update: step.update }),
    };
  });

const withoutRoom = (model: Model, code: string): Model => ({
  ...model,
  rooms: model.rooms.filter(({ record }) => record.code !== code),
});

const noteRoom = (step: Return, view: RoomView, seenAt: number): Return =>
  Option.match(roomOf(step.model), {
    onNone: () => step,
    onSome: ({ player }) => {
      const record = recordOf(view, seenAt);

      const known = step.model.rooms.find(
        (room) => room.record.code === record.code
      );

      return known !== undefined && !recordChanged(known.record, record)
        ? step
        : {
            commands: [...(step.commands ?? []), RememberRoom({ record })],
            model: {
              ...withoutRoom(step.model, record.code),
              rooms: [
                { player, record },
                ...withoutRoom(step.model, record.code).rooms,
              ],
            },
          };
    },
  });

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
        picked: Option.none(),
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
      ? send(model, room, Commands.Act.make({ action }), actionLabel(action))
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

const afterHand = (
  model: Model,
  command: MemberCommand,
  label: string
): Return =>
  inRoom(model, (room) =>
    isLive(room) ? send(model, room, command, label) : { model }
  );

const learn = (model: Model, hint: Hint): Return => {
  if (model.learned.includes(hint)) {
    return { model };
  }

  const learned = [...model.learned, hint];

  return { commands: [SaveLearned({ learned })], model: { ...model, learned } };
};

const Signals = RoomSignalSchema.cases;

const peeksShown = (room: InRoom) =>
  isLive(room) &&
  Option.exists(openViewOf(room), ({ settings }) => settings.peeking);

const peek = (model: Model, looking: boolean): Return =>
  inRoom(model, (room) =>
    peeksShown(room)
      ? {
          commands: [SignalRoom({ signal: Signals.Peeking.make({ looking }) })],
          model,
        }
      : { model }
  );

const react = (model: Model, reaction: Reaction): Return =>
  inRoom(model, (room) =>
    isLive(room)
      ? {
          commands: [
            SignalRoom({ signal: Signals.Reaction.make({ reaction }) }),
          ],
          model,
        }
      : { model }
  );

const fromTable = (model: Model, intent: TableIntent): Return =>
  Match.value(intent).pipe(
    Match.tagsExhaustive({
      Call: () => act(model, Actions.Call()),
      Check: () => act(model, Actions.Check()),
      Fold: () => act(model, Actions.Fold()),
      HuntRabbit: () =>
        afterHand(model, Commands.RabbitHunt.make({}), "Hunting the rabbit"),
      Learned: ({ hint }) => learn(model, hint),
      Muck: () => showdownChoice(model, Commands.MuckHand.make({}), "Mucking"),
      Peek: ({ looking }) => peek(model, looking),
      Pick: ({ seat }) =>
        editRoom(model, (room) => ({ ...room, picked: Option.some(seat) })),
      Raise: ({ to }) =>
        Option.match(Schema.decodeOption(ChipsSchema)(to), {
          onNone: () => ({ model }),
          onSome: (amount) => act(model, Actions.RaiseTo({ to: amount })),
        }),
      React: ({ reaction }) => react(model, reaction),
      Runs: ({ runs }) =>
        Option.match(RunCountSchema.makeOption(runs), {
          onNone: () => ({ model }),
          onSome: (count) =>
            afterHand(
              model,
              Commands.ChooseRuns.make({ runs: count }),
              count === 1 ? "Running it once" : `Running it ${count} times`
            ),
        }),
      Show: () => showdownChoice(model, Commands.TableHand.make({}), "Showing"),
      ShowCards: ({ cards }) =>
        Option.match(
          Option.all(
            cards.map((card) => Schema.decodeOption(CardFromText)(card))
          ).pipe(
            Option.flatMap((picked) => ShownCardsSchema.makeOption(picked))
          ),
          {
            onNone: () => ({ model }),
            onSome: (shown) =>
              afterHand(
                model,
                Commands.ShowCards.make({ cards: shown }),
                "Showing"
              ),
          }
        ),
      Sit: ({ seat }) => pickSeat(model, seat),
    })
  );

const remember = (
  room: InRoom,
  applied: readonly { readonly event: SeenEvent; readonly seq: number }[]
): InRoom => {
  const fresh = applied.flatMap(({ event, seq }) => happeningsOf(seq, event));

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
    Rejected: ({ rejection }) => ({
      ...room,
      notice: Option.some(rejectionText(rejection, viewOf(room))),
      pending,
    }),
  });
};

const ownMember = (room: InRoom) =>
  openViewOf(room).pipe(
    Option.flatMap((view) =>
      Option.fromNullishOr(
        view.members.find((member) => isYou(view, member.player))
      )
    )
  );

const keepFace = (model: Model): Return =>
  Option.match(model.faceDraft, {
    onNone: () => ({ model }),
    onSome: (draft) => {
      const profile = { ...model.profile, avatar: codeFor(draft) };

      return {
        commands: [SaveProfile({ profile })],
        model: { ...model, faceDraft: Option.none(), profile },
      };
    },
  });

const sendFace = (model: Model): Return =>
  inRoom(model, (room) =>
    Option.match(Option.all([model.faceDraft, ownMember(room)]), {
      onNone: () => ({ model: { ...model, faceDraft: Option.none() } }),
      onSome: ([draft, member]) => {
        const profile = { ...model.profile, avatar: codeFor(draft) };

        const sent = send(
          { ...model, faceDraft: Option.none(), profile },
          room,
          Commands.SetProfile.make({
            avatar: profile.avatar,
            name: member.name,
          }),
          "Changing your face"
        );

        return {
          ...sent,
          commands: [...(sent.commands ?? []), SaveProfile({ profile })],
        };
      },
    })
  );

const saveFace = (model: Model): Return =>
  Option.match(roomOf(model), {
    onNone: () => keepFace(model),
    onSome: () => sendFace(model),
  });

export const update = (model: Model, message: Message): Return =>
  Messages.match(message, {
    AcquiredConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: true })),
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
    CheckedRoom: ({ code, gone }) =>
      gone
        ? { commands: [ForgetRoom({ code })], model: withoutRoom(model, code) }
        : { model },
    ChoseFacePart: ({ part }) => ({ model: { ...model, facePart: part } }),
    ChoseTheme: ({ theme }) => ({
      commands: [ApplyTheme({ theme: Option.some(theme) })],
      model: { ...model, theme: Option.some(theme) },
    }),
    ClickedCancelFace: () => ({
      model: { ...model, faceDraft: Option.none() },
    }),
    ClickedCloseSettings: () =>
      editRoom(model, (room) => ({ ...room, settings: Option.none() })),
    ClickedCopyLink: () =>
      inRoom(model, (room) => ({
        commands: [CopyRoomLink({ code: room.code })],
        model,
      })),
    ClickedCopyProof: ({ hand }) =>
      inRoom(model, (room) => ({
        commands: room.fairness.flatMap((judged) =>
          judged.hand === hand && FairMarks.guards.Failed(judged.mark)
            ? [CopyText({ copied: "Proof", text: judged.mark.proof })]
            : []
        ),
        model,
      })),
    ClickedCopySettlement: () =>
      inRoom(model, (room) =>
        Option.match(
          viewOf(room).pipe(Option.filter(RoomViews.$is("Closed"))),
          {
            onNone: () => ({ model }),
            onSome: (closed) => ({
              commands: [
                CopyText({
                  copied: "Settlement",
                  text: settlementText(closed),
                }),
              ],
              model,
            }),
          }
        )
      ),
    ClickedEditFace: () => ({
      model: {
        ...model,
        faceDraft: Option.some(
          avatarFor(
            roomOf(model).pipe(
              Option.flatMap(ownMember),
              Option.map(({ avatar }) => avatar),
              Option.getOrElse(() => model.profile.avatar)
            )
          )
        ),
      },
    }),
    ClickedFairness: () =>
      editRoom(model, (room) => ({ ...room, fairnessOpen: true })),
    ClickedHome: () =>
      inRoom(model, (room) => ({
        commands: [ShowPath({ path: "/" }), ForgetRoom({ code: room.code })],
        model: {
          ...withoutRoom(model, room.code),
          faceDraft: Option.none(),
          screen: Screens.Home({ busy: false, problem: Option.none() }),
        },
      })),
    ClickedKnownRoom: ({ code }) =>
      Option.match(
        Option.fromNullishOr(
          model.rooms.find(({ record }) => record.code === code)
        ),
        {
          onNone: () => ({ model }),
          onSome: ({ player }) => ({
            commands: [ShowPath({ path: roomPath(code) })],
            model: withRoom(model, freshRoom(code, player)),
          }),
        }
      ),
    ClickedMenu: () => editRoom(model, (room) => ({ ...room, menu: true })),
    ClickedOpenSettings: () =>
      editRoom(model, (room) => ({
        ...room,
        menu: false,
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
    ClickedSaveFace: () => saveFace(model),
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
    ClickedShuffleFace: () => ({ commands: [ShuffleFace()], model }),
    ClickedSit: ({ seat }) => sit(model, seat),
    ClosedSheet: () =>
      editRoom(model, (room) => ({
        ...room,
        drafts: { ...room.drafts, seat: Option.none() },
        fairnessOpen: false,
        menu: false,
        picked: Option.none(),
        settings: Option.none(),
      })),
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
      editRoomThenUpdate({ ...model, now: link.receivedAt }, (room) => ({
        ...room,
        link: Option.some(link),
      })),
    GotReply: ({ key, outcome }) =>
      editRoom(model, (room) => settle(room, key, outcome)),
    GotTableIntent: ({ intent }) => fromTable(model, intent),
    GotUpdate: ({ events, receivedAt, seq, view }) =>
      noteRoom(
        editRoomThenUpdate({ ...model, now: receivedAt }, (room) => ({
          ...remember(room, events),
          clockSamples: RoomViews.$is("Open")(view)
            ? [...room.clockSamples, clockSampleOf(view, receivedAt)].slice(
                -KEPT_CLOCK_SAMPLES
              )
            : room.clockSamples,
          resumed: Option.orElse(
            Option.fromUndefinedOr(
              events.findLast(
                ({ event }) =>
                  SeenEvents.$is("TableAttended")(event) &&
                  Option.isSome(event.quietSince)
              )
            ).pipe(
              Option.flatMap(({ event }) =>
                SeenEvents.$is("TableAttended")(event)
                  ? Option.some({ player: event.player, receivedAt })
                  : Option.none()
              )
            ),
            () => room.resumed
          ),
          shown: Option.some({ receivedAt, seq, view }),
        })),
        view,
        receivedAt
      ),
    HeardSignal: ({ from, receivedAt, signal }) =>
      inRoom(model, (room) => ({
        model: {
          ...withRoom(
            { ...model, now: receivedAt },
            heard(
              forgetExpired(room, receivedAt),
              from,
              signal,
              receivedAt,
              model.nextKey
            )
          ),
          nextKey: model.nextKey + 1,
        },
      })),
    JudgedHand: ({ hand, mark }) =>
      editRoom(model, (room) => ({
        ...room,
        fairness: [
          { hand, mark },
          ...room.fairness.filter((judged) => judged.hand !== hand),
        ]
          .toSorted((one, other) => other.hand - one.hand)
          .slice(0, KEPT_FAIR_HANDS),
      })),
    PickedAvatar: ({ avatar }) => {
      if (Option.isSome(model.faceDraft)) {
        return { model: { ...model, faceDraft: Option.some(avatar) } };
      }

      const profile = { ...model.profile, avatar: codeFor(avatar) };

      return {
        commands: [SaveProfile({ profile })],
        model: { ...model, profile },
      };
    },
    ReleasedConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: false })),
    SentSignal: ({ at, sent, signal }) =>
      sent && RoomSignalSchema.guards.Reaction(signal)
        ? inRoom(model, (room) => ({
            model: {
              ...withRoom(
                { ...model, now: at },
                reacted(
                  forgetExpired(room, at),
                  room.player,
                  signal.reaction,
                  at,
                  model.nextKey
                )
              ),
              nextKey: model.nextKey + 1,
            },
          }))
        : { model },
    StartedReload: () => ({ model }),
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
    Ticked: ({ now }) =>
      Option.match(roomOf(model), {
        onNone: () => ({ model: { ...model, now } }),
        onSome: (room) => ({
          model: withRoom({ ...model, now }, forgetExpired(room, now)),
        }),
      }),
    WokePage: ({ visible }) =>
      inRoom(model, () =>
        visible ? { commands: [WakeRoom()], model } : { model }
      ),
  });
