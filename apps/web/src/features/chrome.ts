import { avatarFor } from "@nostakes/avatar";
import type { Html, HtmlBuilder } from "foldkit/html";

import { face } from "./face-builder.js";
import { iconMarkup } from "./markup.js";
import type { IconName } from "./markup.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { Deck, Theme } from "./model.js";

type H = HtmlBuilder<Message>;

export const LEARN_PATH = "/learn";

export const learnLink = (h: H): Html =>
  h.a(
    [h.Class("learn-link"), h.Href(LEARN_PATH)],
    ["New to poker? Learn in two minutes"]
  );

export const learnInNewTab = (h: H): Html =>
  h.a(
    [
      h.Class("text-button"),
      h.Href(LEARN_PATH),
      h.Target("_blank"),
      h.Rel("noopener"),
    ],
    ["How to play"]
  );

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

const iconToggle = (
  h: H,
  look: {
    readonly className: string;
    readonly label: string;
    readonly pressed: boolean | undefined;
    readonly icon: IconName;
  },
  message: Message
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(`icon-toggle ${look.className}`),
      h.AriaLabel(look.label),
      h.Title(look.label),
      ...(look.pressed === undefined
        ? []
        : [h.AriaPressed(look.pressed ? "true" : "false")]),
      h.OnClick(message),
    ],
    [h.span([h.AriaHidden(true), iconMarkup(h, look.icon)], [])]
  );

export const deviceToggles = (
  sound: boolean,
  deck: Deck,
  counting: boolean,
  h: H
): Html =>
  h.div(
    [h.Class("device-toggles")],
    [
      iconToggle(
        h,
        {
          className: sound ? "is-on" : "",
          icon: sound ? "SoundOn" : "SoundOff",
          label: "Sound",
          pressed: sound,
        },
        Messages.SwitchedSound({ on: !sound })
      ),
      iconToggle(
        h,
        {
          className: "to-dark",
          icon: "Moon",
          label: "Use the dark theme",
          pressed: undefined,
        },
        Messages.ChoseTheme({ theme: "Dark" })
      ),
      iconToggle(
        h,
        {
          className: "to-light",
          icon: "Sun",
          label: "Use the light theme",
          pressed: undefined,
        },
        Messages.ChoseTheme({ theme: "Light" })
      ),
      iconToggle(
        h,
        {
          className:
            deck === "FourColour" ? "is-on four-colour" : "four-colour",
          icon: "Suits",
          label: "Four-colour deck",
          pressed: deck === "FourColour",
        },
        Messages.ChoseDeck({
          deck: deck === "FourColour" ? "TwoColour" : "FourColour",
        })
      ),
      iconToggle(
        h,
        {
          className: counting ? "is-on counting" : "counting",
          icon: "Counts",
          label: "Anonymous counts",
          pressed: counting,
        },
        Messages.SwitchedCounting({ on: !counting })
      ),
    ]
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
