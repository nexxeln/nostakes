import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";

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
