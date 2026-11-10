import { avatarFor } from "@nostakes/avatar";
import type { Html, HtmlBuilder } from "foldkit/html";

import { face } from "./face-builder.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { Deck, Theme } from "./model.js";

type H = HtmlBuilder<Message>;

export const themeSwitch = (h: H): Html =>
  h.span(
    [h.Class("theme-switch")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("bar-button to-dark"),
          h.AriaLabel("Use the dark theme"),
          h.OnClick(Messages.ChoseTheme({ theme: "Dark" })),
        ],
        ["Dark"]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("bar-button to-light"),
          h.AriaLabel("Use the light theme"),
          h.OnClick(Messages.ChoseTheme({ theme: "Light" })),
        ],
        ["Light"]
      ),
    ]
  );

export const deckSwitch = (deck: Deck, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("bar-button"),
      h.AriaLabel(
        deck === "FourColour"
          ? "Draw the cards in two colours"
          : "Draw the cards in four colours"
      ),
      h.OnClick(
        Messages.ChoseDeck({
          deck: deck === "FourColour" ? "TwoColour" : "FourColour",
        })
      ),
    ],
    [deck === "FourColour" ? "Two colours" : "Four colours"]
  );

export const soundSwitch = (on: boolean, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("bar-button"),
      h.AriaPressed(on ? "false" : "true"),
      h.OnClick(Messages.SwitchedSound({ on: !on })),
    ],
    [on ? "Mute" : "Unmute"]
  );

const BAR_FACE_PX = 32;

export const faceButton = (avatar: string, theme: Theme, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("bar-button face-button"),
      h.AriaLabel("Change your face"),
      h.Title("Change your face"),
      h.OnClick(Messages.ClickedEditFace()),
    ],
    [
      face(
        avatarFor(avatar),
        "Resting",
        { size: BAR_FACE_PX, theme },
        "face-frame",
        h
      ),
    ]
  );
