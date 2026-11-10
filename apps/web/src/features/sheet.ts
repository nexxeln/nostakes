import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";

type H = HtmlBuilder<Message>;

const CLOSE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`;

export const icon = (svg: string, h: H): Html =>
  h.span([h.Class("icon"), h.AriaHidden(true), h.InnerHTML(svg)], []);

export const closeButton = (h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("sheet-close"),
      h.AriaLabel("Close"),
      h.OnClick(Messages.ClosedSheet()),
    ],
    [icon(CLOSE_ICON, h)]
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
