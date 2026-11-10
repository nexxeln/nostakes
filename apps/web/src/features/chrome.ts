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

const SOUND_ON = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 7.5c1 .8 1 4.2 0 5M15.5 5.5c2 2 2 7 0 9"/></svg>`;

const SOUND_OFF = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 8l4 4M17 8l-4 4"/></svg>`;

const MOON = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/></svg>`;

const SUN = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg>`;

const SUITS = `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="6" cy="6" r="3" class="pip-spade"/><circle cx="14" cy="6" r="3" class="pip-heart"/><circle cx="6" cy="14" r="3" class="pip-diamond"/><circle cx="14" cy="14" r="3" class="pip-club"/></svg>`;

const COUNTS = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 16V11M8.5 16V6M13 16V9M17.5 16V4"/></svg>`;

const iconToggle = (
  h: H,
  look: {
    readonly className: string;
    readonly label: string;
    readonly pressed: boolean | undefined;
    readonly svg: string;
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
    [h.span([h.AriaHidden(true), h.InnerHTML(look.svg)], [])]
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
          label: "Sound",
          pressed: sound,
          svg: sound ? SOUND_ON : SOUND_OFF,
        },
        Messages.SwitchedSound({ on: !sound })
      ),
      iconToggle(
        h,
        {
          className: "to-dark",
          label: "Use the dark theme",
          pressed: undefined,
          svg: MOON,
        },
        Messages.ChoseTheme({ theme: "Dark" })
      ),
      iconToggle(
        h,
        {
          className: "to-light",
          label: "Use the light theme",
          pressed: undefined,
          svg: SUN,
        },
        Messages.ChoseTheme({ theme: "Light" })
      ),
      iconToggle(
        h,
        {
          className:
            deck === "FourColour" ? "is-on four-colour" : "four-colour",
          label: "Four-colour deck",
          pressed: deck === "FourColour",
          svg: SUITS,
        },
        Messages.ChoseDeck({
          deck: deck === "FourColour" ? "TwoColour" : "FourColour",
        })
      ),
      iconToggle(
        h,
        {
          className: counting ? "is-on counting" : "counting",
          label: "Anonymous counts",
          pressed: counting,
          svg: COUNTS,
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
