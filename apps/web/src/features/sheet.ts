import type { Html, HtmlBuilder } from "foldkit/html";

import { iconMarkup } from "./markup.js";
import type { IconName } from "./markup.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";

type H = HtmlBuilder<Message>;

export const icon = (name: IconName, h: H): Html =>
  h.span([h.Class("icon"), h.AriaHidden(true), iconMarkup(h, name)], []);

export const closeButton = (h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("sheet-close"),
      h.AriaLabel("Close"),
      h.OnClick(Messages.ClosedSheet()),
    ],
    [icon("Close", h)]
  );

export const sheetLayer = (
  h: H,
  label: string,
  className: string,
  body: readonly Html[]
): Html =>
  h.div(
    [h.Class("sheet-layer")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("sheet-scrim"),
          h.AriaLabel("Dismiss"),
          h.OnClick(Messages.ClosedSheet()),
        ],
        []
      ),
      h.section(
        [h.Class(`sheet ${className}`), h.Role("dialog"), h.AriaLabel(label)],
        body
      ),
    ]
  );

export const sheetTop = (h: H, start: Html): Html =>
  h.div([h.Class("sheet-top")], [start, closeButton(h)]);

export const sheet = (h: H, title: string, body: readonly Html[]): Html =>
  sheetLayer(h, title, "", [
    sheetTop(h, h.h2([h.Class("sheet-title")], [title])),
    ...body,
  ]);
