import type { PlayerId } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViews } from "@nostakes/room";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { attendanceLine } from "./attendance-line.js";
import { commandButton } from "./buttons.js";
import { faceButton } from "./chrome.js";
import { fairLabel, fairParagraph, fairSymbol } from "./fairness-text.js";
import {
  chipsSheet,
  confirmSheet,
  menuSheet,
  pickedPlayer,
  playerSheet,
} from "./menu-view.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { FairMarks, pageTheme } from "./model.js";
import type { InRoom, Model } from "./model.js";
import { updateLine } from "./page-update.js";
import { hasLeft, isLive, isYou, nameOf, viewOf } from "./room.js";
import type { ClosedView, OpenView } from "./room.js";
import { rulesSheet } from "./rules-view.js";
import { sheet } from "./sheet.js";
import { heroSeatOf, tableSnapshot } from "./table/from-room.js";
import { tableElement } from "./table/snapshot.js";

type H = HtmlBuilder<Message>;

const Commands = MemberCommandSchema.cases;

const connectionLine = (room: InRoom, h: H): Html =>
  Option.match(room.link, {
    onNone: () => h.span([h.Class("connection")], ["Connecting…"]),
    onSome: ({ phase, refusal }) => {
      if (phase === "Live") {
        return h.empty;
      }

      if (phase === "Outdated") {
        return h.span(
          [h.Class("connection"), h.Role("status")],
          ["Out of date"]
        );
      }

      if (phase === "Refused") {
        return h.span(
          [h.Class("connection is-refused"), h.Role("status")],
          [`Refused: ${Option.getOrElse(refusal, () => "closed")}`]
        );
      }

      return h.span(
        [h.Class("connection"), h.Role("status")],
        ["Reconnecting…"]
      );
    },
  });

const SHOWN_FAIR_HANDS = 5;

const fairButton = (room: InRoom, h: H): Html => {
  const failed = room.fairness.find(({ mark }) =>
    FairMarks.guards.Failed(mark)
  );

  const shown = failed ?? room.fairness[0];

  return shown === undefined
    ? h.empty
    : h.button(
        [
          h.Type("button"),
          h.Class(
            failed === undefined
              ? "bar-button fair-mark"
              : "bar-button fair-mark is-alarm"
          ),
          h.AriaLabel(fairLabel(shown)),
          h.Title(fairLabel(shown)),
          h.OnClick(Messages.ClickedFairness()),
        ],
        [fairSymbol(shown.mark)]
      );
};

const header = (
  model: Model,
  room: InRoom,
  view: Option.Option<OpenView>,
  h: H
): Html =>
  h.header(
    [h.Class("room-header")],
    [
      h.span([h.Class("brand small")], ["nostakes"]),
      h.button(
        [
          h.Type("button"),
          h.Class("bar-button"),
          h.OnClick(Messages.ClickedCopyLink()),
        ],
        [room.copied === "Link" ? "Link copied" : "Invite"]
      ),
      fairButton(room, h),
      h.span(
        [h.Class("bar-end")],
        [
          connectionLine(room, h),
          Option.match(view, {
            onNone: () => h.empty,
            onSome: (open) =>
              faceButton(
                open.members.find(({ player }) => isYou(open, player))
                  ?.avatar ?? model.profile.avatar,
                pageTheme(model),
                h
              ),
          }),
          Option.isSome(view)
            ? h.button(
                [
                  h.Type("button"),
                  h.Class("bar-button"),
                  h.OnClick(Messages.ClickedMenu()),
                ],
                ["Menu"]
              )
            : h.empty,
        ]
      ),
    ]
  );

const noticeLine = (model: Model, room: InRoom, h: H): Html =>
  h.div(
    [h.Class("status-line"), h.AriaLive("polite")],
    [
      Option.match(attendanceLine(room, model.now), {
        onNone: () => h.empty,
        onSome: (text) => h.span([h.Class("attendance-line")], [text]),
      }),
      Option.match(room.update, {
        onNone: () => h.empty,
        onSome: (update) =>
          h.span(
            [h.Class(update.stage === "Stuck" ? "problem" : "update-line")],
            [updateLine(update)]
          ),
      }),
      Option.match(room.notice, {
        onNone: () => h.empty,
        onSome: (text) => h.span([h.Class("problem")], [text]),
      }),
    ]
  );

const fairnessSheet = (room: InRoom, h: H): Html =>
  sheet(
    h,
    "The deck",
    room.fairness
      .filter(
        ({ mark }, index) =>
          index < SHOWN_FAIR_HANDS || FairMarks.guards.Failed(mark)
      )
      .map((judged) =>
        h.div(
          [h.Key(`fair-${judged.hand}`), h.Class("fair-hand")],
          [
            h.p(
              [
                h.Class(
                  FairMarks.guards.Failed(judged.mark)
                    ? "fair-text is-alarm"
                    : "fair-text"
                ),
              ],
              [fairParagraph(judged)]
            ),
            FairMarks.guards.Failed(judged.mark)
              ? h.button(
                  [
                    h.Type("button"),
                    h.Class("button small"),
                    h.OnClick(Messages.ClickedCopyProof({ hand: judged.hand })),
                  ],
                  [room.copied === "Proof" ? "Proof copied" : "Copy the proof"]
                )
              : h.empty,
          ]
        )
      )
  );

const sitSheet = (room: InRoom, view: OpenView, seat: number, h: H): Html =>
  sheet(h, `Sit in seat ${seat + 1}`, [
    h.form(
      [h.Class("sheet-form"), h.OnSubmit(Messages.ClickedSit({ seat }))],
      [
        h.label(
          [h.Class("field")],
          [
            h.span(
              [h.Class("field-label")],
              [
                `Chips to bring, ${view.settings.buyIn.min} to ${view.settings.buyIn.max}`,
              ]
            ),
            h.input([
              h.Type("number"),
              h.Class("text-input"),
              h.InputMode("numeric"),
              h.Min(String(view.settings.buyIn.min)),
              h.Max(String(view.settings.buyIn.max)),
              h.Value(room.drafts.buyIn),
              h.OnInput((value) =>
                Messages.ChangedDraft({ field: "buyIn", value })
              ),
            ]),
          ]
        ),
        h.button(
          [
            h.Type("submit"),
            h.Class("button primary"),
            h.Disabled(!isLive(room)),
          ],
          ["Sit down"]
        ),
      ]
    ),
  ]);

const activeSheet = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  if (Option.isSome(room.confirm)) {
    return confirmSheet(room, view, room.confirm.value, h);
  }

  if (Option.isSome(room.rules)) {
    return rulesSheet(room, view, room.rules.value, h);
  }

  if (Option.isSome(room.drafts.seat)) {
    return sitSheet(room, view, room.drafts.seat.value, h);
  }

  if (room.addingChips) {
    return chipsSheet(room, view, h);
  }

  const player = pickedPlayer(room, view);

  if (Option.isSome(player)) {
    return playerSheet(room, view, player.value, h);
  }

  if (room.fairnessOpen) {
    return fairnessSheet(room, h);
  }

  return room.menu ? menuSheet(model, room, view, presence, h) : h.empty;
};

const requestPill = (
  key: string,
  text: string,
  buttons: readonly Html[],
  h: H
): Html =>
  h.div(
    [h.Key(key), h.Class("request")],
    [h.span([h.Class("request-text")], [text]), ...buttons]
  );

const hostRequests = (room: InRoom, view: OpenView, h: H): Html => {
  if (!isYou(view, view.host)) {
    return h.empty;
  }

  const seats = view.requests.seats.map((request) =>
    requestPill(
      `seat-${request.player}`,
      `${nameOf(view, request.player)} wants to sit with ${request.buyIn}`,
      [
        commandButton(
          h,
          room,
          Commands.ApproveSeat.make({ player: request.player }),
          "Let in",
          "Letting them sit",
          "button primary small"
        ),
        commandButton(
          h,
          room,
          Commands.DenySeat.make({ player: request.player }),
          "No",
          "Saying no",
          "button quiet small"
        ),
      ],
      h
    )
  );

  const chips = view.requests.chips.map((request) =>
    requestPill(
      `chips-${request.player}`,
      `${nameOf(view, request.player)} wants ${request.amount} more chips`,
      [
        commandButton(
          h,
          room,
          Commands.ApproveChips.make({ player: request.player }),
          "Give",
          "Giving chips",
          "button primary small"
        ),
        commandButton(
          h,
          room,
          Commands.DenyChips.make({ player: request.player }),
          "No",
          "Saying no",
          "button quiet small"
        ),
      ],
      h
    )
  );

  return seats.length + chips.length === 0
    ? h.empty
    : h.div([h.Class("requests")], [...seats, ...chips]);
};

const waitingCall = (room: InRoom, view: OpenView, h: H): Html => {
  if (Option.isNone(heroSeatOf(view))) {
    return h.p([h.Class("muted")], ["Tap a seat to sit."]);
  }

  return isYou(view, view.host)
    ? commandButton(
        h,
        room,
        Commands.StartGame.make({}),
        "Start the game",
        "Starting",
        "button primary"
      )
    : h.p([h.Class("muted")], ["Waiting for the host to start."]);
};

const tableCall = (room: InRoom, view: OpenView, h: H): Html => {
  if (view.game !== "Waiting") {
    return h.empty;
  }

  return h.div([h.Class("table-call")], [waitingCall(room, view, h)]);
};

const tableView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  const table = tableElement.withMessage(h);

  return h.div(
    [h.Class("table-stage")],
    [
      table(
        [
          h.Class("table-host"),
          h.AriaLabel("Table"),
          table.Snapshot(tableSnapshot(room, view, presence, model.learned)),
          table.Sound(model.sound),
          table.OnIntent((intent) => Messages.GotTableIntent({ intent })),
        ],
        []
      ),
      tableCall(room, view, h),
    ]
  );
};

const openRoomView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html =>
  h.div(
    [h.Class("room-body")],
    [
      tableView(model, room, view, presence, h),
      hostRequests(room, view, h),
      activeSheet(model, room, view, presence, h),
    ]
  );

const closedRoomView = (room: InRoom, view: ClosedView, h: H): Html => {
  const name = (player: PlayerId) => nameOf(view, player);

  return h.section(
    [h.Class("card-panel settlement")],
    [
      h.h2([h.Class("sheet-title")], ["The night is over"]),
      h.ul(
        [h.Class("member-list")],
        view.settlement.balances
          .toSorted((left, right) => right.net - left.net)
          .map((balance) =>
            h.li(
              [h.Key(`balance-${balance.player}`), h.Class("member")],
              [
                h.span([h.Class("member-name")], [name(balance.player)]),
                h.span(
                  [h.Class(balance.net >= 0 ? "net is-up" : "net is-down")],
                  [`${balance.net > 0 ? "+" : ""}${balance.net}`]
                ),
              ]
            )
          )
      ),
      h.h3([h.Class("sheet-heading")], ["Settle up"]),
      h.ul(
        [h.Class("transfers")],
        view.settlement.transfers.length === 0
          ? [h.li([], ["Everyone is square."])]
          : view.settlement.transfers.map(({ amount, from, to }) =>
              h.li(
                [h.Key(`pay-${from}-${to}`)],
                [`${name(from)} pays ${name(to)} ${amount}`]
              )
            )
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button primary"),
          h.OnClick(Messages.ClickedCopySettlement()),
        ],
        [room.copied === "Settlement" ? "Copied" : "Copy for the group chat"]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button quiet"),
          h.OnClick(Messages.ClickedHome()),
        ],
        ["Back home"]
      ),
    ]
  );
};

const homeButton = (label: string, h: H): Html =>
  h.button(
    [h.Type("button"), h.Class("button"), h.OnClick(Messages.ClickedHome())],
    [label]
  );

const stillPlayingOut = (view: OpenView) =>
  view.seats.some(({ occupant }) =>
    Option.exists(occupant, ({ player }) => isYou(view, player))
  );

const leftRoomView = (view: OpenView, h: H): Html =>
  h.section(
    [h.Class("card-panel settlement")],
    [
      h.h2([h.Class("sheet-title")], ["You left this room"]),
      ...(stillPlayingOut(view)
        ? [
            h.p(
              [h.Class("muted")],
              [
                "Your seat plays out this hand, then your chips are counted for the settle-up.",
              ]
            ),
          ]
        : []),
      h.p(
        [h.Class("muted")],
        ["To play again, open the room link and join as a new player."]
      ),
      homeButton("Back home", h),
    ]
  );

const refusedView = (h: H): Html =>
  h.section(
    [h.Class("card-panel settlement")],
    [
      h.p([], ["This room is no longer open to you."]),
      homeButton("Back home", h),
    ]
  );

export const roomView = (model: Model, room: InRoom, h: H): Html => {
  const view = viewOf(room);
  const open = view.pipe(Option.filter(RoomViews.$is("Open")));

  const presence = Option.match(room.link, {
    onNone: () => [],
    onSome: (link) => link.presence,
  });

  const refused = Option.exists(room.link, ({ phase }) => phase === "Refused");

  return h.main(
    [h.Class("page room")],
    [
      header(model, room, open, h),
      noticeLine(model, room, h),
      Option.match(view, {
        onNone: () =>
          refused
            ? refusedView(h)
            : h.p([h.Class("muted opening")], ["Opening the room…"]),
        onSome: (current) =>
          RoomViews.$match(current, {
            Closed: (closed) => closedRoomView(room, closed, h),
            Open: (live) =>
              hasLeft(live)
                ? leftRoomView(live, h)
                : openRoomView(model, room, live, presence, h),
          }),
      }),
    ]
  );
};
