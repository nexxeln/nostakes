import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, SettingsDraft } from "./model.js";
import type { OpenView } from "./room.js";

type H = HtmlBuilder<Message>;

export const settingsPanel = (
  _room: InRoom,
  _view: OpenView,
  _draft: SettingsDraft,
  h: H
): Html =>
  h.section(
    [h.Class("card-panel settings")],
    [
      h.h2([h.Class("panel-title")], ["Settings"]),
      h.button(
        [
          h.Type("button"),
          h.Class("button quiet"),
          h.OnClick(Messages.ClickedCloseSettings()),
        ],
        ["Close"]
      ),
    ]
  );
