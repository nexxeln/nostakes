import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { AVATARS, Screens } from "./model.js";
import type { Model } from "./model.js";
import { roomView } from "./room-view.js";

type H = HtmlBuilder<Message>;

const problemLine = (problem: Option.Option<string>, h: H): Html =>
  Option.match(problem, {
    onNone: () => h.empty,
    onSome: (text) => h.p([h.Class("problem"), h.Role("alert")], [text]),
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
  h.div(
    [h.Class("field")],
    [
      h.span([h.Class("field-label")], ["Your face"]),
      h.div(
        [h.Class("avatars"), h.Role("radiogroup"), h.AriaLabel("Your face")],
        AVATARS.map((avatar) =>
          h.button(
            [
              h.Type("button"),
              h.Key(avatar),
              h.Class(
                avatar === model.profile.avatar
                  ? "avatar-choice is-picked"
                  : "avatar-choice"
              ),
              h.Role("radio"),
              h.AriaChecked(avatar === model.profile.avatar),
              h.OnClick(Messages.PickedAvatar({ avatar })),
            ],
            [avatar]
          )
        )
      ),
    ]
  ),
];

const homeView = (
  model: Model,
  busy: boolean,
  problem: Option.Option<string>,
  h: H
): Html =>
  h.main(
    [h.Class("page home")],
    [
      h.h1([h.Class("brand")], ["nostakes"]),
      h.p(
        [h.Class("tagline")],
        ["Poker night with friends. No money on the table, just the count."]
      ),
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
        [h.Class("card-panel"), h.OnSubmit(Messages.SubmittedJoin())],
        [
          h.label(
            [h.Class("field")],
            [
              h.span([h.Class("field-label")], ["Have a code?"]),
              h.input([
                h.Type("text"),
                h.Class("text-input code-input"),
                h.Value(model.joinCode),
                h.Maxlength(6),
                h.Placeholder("ABC234"),
                h.Autocapitalize("characters"),
                h.OnInput((value) => Messages.ChangedJoinCode({ value })),
              ]),
            ]
          ),
          h.button(
            [h.Type("submit"), h.Class("button"), h.Disabled(busy)],
            ["Join with the code"]
          ),
        ]
      ),
      problemLine(problem, h),
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
      h.h1([h.Class("brand")], ["nostakes"]),
      h.p([h.Class("tagline")], [`You're invited to room ${code}.`]),
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
    ]
  );

export const view = (model: Model, h: H): Document => ({
  body: Screens.match(model.screen, {
    Home: ({ busy, problem }) => homeView(model, busy, problem, h),
    Invited: ({ busy, code, problem }) =>
      invitedView(model, code, busy, problem, h),
    Room: ({ room }) => roomView(model, room, h),
  }),
  title: Screens.match(model.screen, {
    Home: () => "nostakes",
    Invited: ({ code }) => `Join ${code} · nostakes`,
    Room: ({ room }) => `${room.code} · nostakes`,
  }),
});
