import type { MemberCommand } from "@nostakes/room";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom } from "./model.js";
import { isLive } from "./room.js";

type H = HtmlBuilder<Message>;

export const commandButton = (
  h: H,
  room: InRoom,
  command: MemberCommand,
  label: string,
  pendingLabel: string,
  style = "button"
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(style),
      h.Disabled(!isLive(room)),
      h.OnClick(Messages.ClickedRoomCommand({ command, label: pendingLabel })),
    ],
    [label]
  );
