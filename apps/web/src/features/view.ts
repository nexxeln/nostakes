import { avatarFor } from "@nostakes/avatar";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { themeSwitch } from "./chrome.js";
import { face, faceSheet } from "./face-builder.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { pageTheme, Screens } from "./model.js";
import type { Model, RoomRecord } from "./model.js";
import { roomView } from "./room-view.js";

type H = HtmlBuilder<Message>;

const problemLine = (problem: Option.Option<string>, h: H): Html =>
  Option.match(problem, {
    onNone: () => h.empty,
    onSome: (text) => h.p([h.Class("problem"), h.Role("alert")], [text]),
  });

const FACE_ROW_PX = 56;

const faceSheetOf = (model: Model, h: H): Html =>
  Option.match(model.faceDraft, {
    onNone: () => h.empty,
    onSome: (draft) =>
      faceSheet(draft, model.facePart, model.faceShuffled, pageTheme(model), h),
  });

const profileFields = (model: Model, h: H): readonly Html[] => [
  h.label(
    [h.Class("field")],
    [
      h.span([h.Class("field-label")], ["Your name"]),
      h.input([
        h.Type("text"),
        h.Class("text-input"),
        h.Value(model.profile.name),
        h.Maxlength(40),
        h.Placeholder("Name"),
        h.OnInput((value) => Messages.ChangedName({ value })),
      ]),
    ]
  ),
  h.button(
    [
      h.Type("button"),
      h.Class("face-row"),
      h.OnClick(Messages.ClickedEditFace()),
    ],
    [
      face(
        avatarFor(model.profile.avatar),
        "Resting",
        { size: FACE_ROW_PX, theme: pageTheme(model) },
        "face-frame",
        h
      ),
      h.span(
        [h.Class("face-row-text")],
        [
          h.span([h.Class("face-row-title")], ["Your face"]),
          h.span([h.Class("field-label")], ["Tap to change it"]),
        ]
      ),
    ]
  ),
];

const LISTED_ROOMS = 3;

const whoWasThere = (others: readonly string[]) => {
  const [first, second, ...rest] = others;

  if (first === undefined) {
    return "Just you so far";
  }

  if (second === undefined) {
    return `With ${first}`;
  }

  return rest.length === 0
    ? `With ${first} and ${second}`
    : `With ${first}, ${second} and ${rest.length} more`;
};

const roomState = (record: RoomRecord) => {
  if (record.closed) {
    return "Settled";
  }

  return record.left ? "You left" : "Open";
};

const yourRooms = (model: Model, h: H): Html =>
  model.rooms.length === 0
    ? h.empty
    : h.section(
        [h.Class("your-rooms"), h.AriaLabel("Your rooms")],
        [
          h.span([h.Class("field-label")], ["Your rooms"]),
          h.ul(
            [h.Class("room-list")],
            model.rooms
              .slice(0, LISTED_ROOMS)
              .map(({ record }) =>
                h.li(
                  [h.Key(record.code)],
                  [
                    h.button(
                      [
                        h.Type("button"),
                        h.Class("room-row"),
                        h.OnClick(
                          Messages.ClickedKnownRoom({ code: record.code })
                        ),
                      ],
                      [
                        h.span([h.Class("room-row-code")], [record.code]),
                        h.span(
                          [h.Class("room-row-who")],
                          [whoWasThere(record.others)]
                        ),
                        h.span(
                          [
                            h.Class(
                              record.closed || record.left
                                ? "tag"
                                : "tag is-open"
                            ),
                          ],
                          [roomState(record)]
                        ),
                      ]
                    ),
                  ]
                )
              )
          ),
        ]
      );

const readingLinks = (h: H): Html =>
  h.footer(
    [h.Class("reading-links")],
    [h.a([h.Href("/privacy")], ["Privacy"]), h.a([h.Href("/terms")], ["Terms"])]
  );

const homeView = (
  model: Model,
  busy: boolean,
  problem: Option.Option<string>,
  h: H
): Html =>
  h.main(
    [h.Class("page home")],
    [
      h.header(
        [h.Class("bar")],
        [h.span([h.Class("bar-end")], [themeSwitch(h)])]
      ),
      h.div(
        [h.Class("hero")],
        [
          h.h1([h.Class("brand")], ["nostakes"]),
          h.p(
            [h.Class("tagline")],
            ["Poker night with friends. No money on the table, just the count."]
          ),
        ]
      ),
      yourRooms(model, h),
      h.form(
        [h.Class("card-panel"), h.OnSubmit(Messages.SubmittedCreate())],
        [
          ...profileFields(model, h),
          h.button(
            [h.Type("submit"), h.Class("button primary"), h.Disabled(busy)],
            [busy ? "Opening…" : "Open a room"]
          ),
        ]
      ),
      h.form(
        [h.Class("join-panel"), h.OnSubmit(Messages.SubmittedJoin())],
        [
          h.span([h.Class("field-label")], ["Have a code?"]),
          h.div(
            [h.Class("join-row")],
            [
              h.input([
                h.Type("text"),
                h.Class("text-input code-input"),
                h.Value(model.joinCode),
                h.Maxlength(6),
                h.Placeholder("ABC234"),
                h.AriaLabel("Room code"),
                h.Autocapitalize("characters"),
                h.OnInput((value) => Messages.ChangedJoinCode({ value })),
              ]),
              h.button(
                [h.Type("submit"), h.Class("button"), h.Disabled(busy)],
                ["Join"]
              ),
            ]
          ),
        ]
      ),
      problemLine(problem, h),
      readingLinks(h),
    ]
  );

const invitedView = (
  model: Model,
  code: string,
  busy: boolean,
  problem: Option.Option<string>,
  h: H
): Html =>
  h.main(
    [h.Class("page home")],
    [
      h.header(
        [h.Class("bar")],
        [h.span([h.Class("bar-end")], [themeSwitch(h)])]
      ),
      h.div(
        [h.Class("hero")],
        [
          h.h1([h.Class("brand")], ["nostakes"]),
          h.p([h.Class("tagline")], [`You're invited to room ${code}.`]),
        ]
      ),
      h.form(
        [h.Class("card-panel"), h.OnSubmit(Messages.SubmittedInvite())],
        [
          ...profileFields(model, h),
          h.button(
            [h.Type("submit"), h.Class("button primary"), h.Disabled(busy)],
            [busy ? "Joining…" : "Join the room"]
          ),
        ]
      ),
      problemLine(problem, h),
      readingLinks(h),
    ]
  );

export const view = (model: Model, h: H): Document => ({
  body: Screens.match(model.screen, {
    Home: ({ busy, problem }) =>
      h.div(
        [h.Class("screen")],
        [homeView(model, busy, problem, h), faceSheetOf(model, h)]
      ),
    Invited: ({ busy, code, problem }) =>
      h.div(
        [h.Class("screen")],
        [invitedView(model, code, busy, problem, h), faceSheetOf(model, h)]
      ),
    Room: ({ room }) =>
      h.div(
        [h.Class("screen")],
        [roomView(model, room, h), faceSheetOf(model, h)]
      ),
  }),
  title: Screens.match(model.screen, {
    Home: () => "nostakes",
    Invited: ({ code }) => `Join ${code} · nostakes`,
    Room: ({ room }) => `${room.code} · nostakes`,
  }),
});
