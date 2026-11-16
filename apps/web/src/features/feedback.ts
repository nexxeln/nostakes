import { RoomViews } from "@nostakes/room";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { modalElement } from "./face/stage.js";
import {
  enteredNote,
  FeedbackStages,
  MAX_NOTE_LENGTH,
} from "./feedback-sheet.js";
import type { FeedbackScreen, FeedbackSheet } from "./feedback-sheet.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { Screens } from "./model.js";
import type { Model } from "./model.js";
import { sheetLayer, sheetTop } from "./sheet.js";

type H = HtmlBuilder<Message>;

export const feedbackScreen = (model: Model): FeedbackScreen =>
  Screens.match(model.screen, {
    Home: (): FeedbackScreen => (model.rooms.length === 0 ? "Create" : "Home"),
    Invited: (): FeedbackScreen => "Invitation",
    Room: ({ room }): FeedbackScreen =>
      Option.exists(room.shown, ({ view }) => RoomViews.$is("Closed")(view))
        ? "Settled"
        : "Room",
    Welcome: (): FeedbackScreen => "Other",
  });

export const feedbackLink = (h: H, className: string): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(`${className} feedback-button`),
      h.OnClick(Messages.ClickedFeedback()),
    ],
    ["Feedback"]
  );

const SENDS =
  "Sends your note with your browser, screen size, and which screen you were on.";

const writing = (sheet: FeedbackSheet, h: H): readonly Html[] => {
  const sending = FeedbackStages.guards.Sending(sheet.stage);
  const empty = enteredNote(sheet.note).length === 0;

  return [
    h.form(
      [h.Class("feedback-form"), h.OnSubmit(Messages.SubmittedFeedback())],
      [
        h.label(
          [h.Class("field-label"), h.For("feedback-note")],
          ["What broke, or what did you like?"]
        ),
        h.textarea([
          h.Id("feedback-note"),
          h.Class("text-input feedback-note"),
          h.Value(sheet.note),
          h.Maxlength(MAX_NOTE_LENGTH),
          h.Rows(5),
          h.DataAttribute("modal-focus", "note"),
          h.Disabled(sending),
          h.OnInput((value) => Messages.ChangedFeedback({ value })),
        ]),
        h.p([h.Class("muted small feedback-sends")], [SENDS]),
        FeedbackStages.match(sheet.stage, {
          Failed: ({ reason }) =>
            h.p([h.Class("problem"), h.Role("alert")], [reason]),
          Sending: () => h.empty,
          Sent: () => h.empty,
          Writing: () => h.empty,
        }),
        h.button(
          [
            h.Type("submit"),
            h.Class("button primary"),
            h.Disabled(sending || empty),
          ],
          [
            FeedbackStages.match(sheet.stage, {
              Failed: () => "Try again",
              Sending: () => "Sending…",
              Sent: () => "Send",
              Writing: () => "Send",
            }),
          ]
        ),
      ]
    ),
  ];
};

const thanked = (h: H): readonly Html[] => [
  h.p(
    [h.Class("feedback-thanks"), h.Role("status")],
    ["Thanks. The owner reads every note."]
  ),
  h.button(
    [
      h.Type("button"),
      h.Class("button"),
      h.DataAttribute("modal-focus", "done"),
      h.OnClick(Messages.ClosedSheet()),
    ],
    ["Done"]
  ),
];

export const feedbackSheet = (model: Model, h: H): Html =>
  Option.match(model.feedback, {
    onNone: () => h.empty,
    onSome: (sheet) => {
      const modal = modalElement.withMessage(h);

      return modal(
        [
          h.Class("feedback-modal"),
          modal.Opener(".feedback-button"),
          modal.OnCancel(() => Messages.ClosedSheet()),
        ],
        [
          sheetLayer(h, "Feedback", "feedback-sheet", [
            sheetTop(h, h.h2([h.Class("sheet-title")], ["Tell the owner"])),
            ...(FeedbackStages.guards.Sent(sheet.stage)
              ? thanked(h)
              : writing(sheet, h)),
          ]),
        ]
      );
    },
  });
