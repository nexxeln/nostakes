import { Commands } from "@nostakes/engine";
import type { Command, PlayerId, SeatIndex } from "@nostakes/engine";
import { Match, Result } from "effect";

import type { RoomCommand } from "./commands.js";
import type { Decision } from "./decision.js";
import { heldSeat } from "./state.js";
import type { Open } from "./state.js";
import { onTable } from "./table.js";

export type PlayCommand = Extract<
  RoomCommand,
  { readonly _tag: "Act" | "ChooseRuns" | "RabbitHunt" | "ShowCards" }
>;

const forSeat = (command: PlayCommand, seat: SeatIndex): Command =>
  Match.valueTags(command, {
    Act: ({ action }) => Commands.Act({ action, seat }),
    ChooseRuns: ({ runs }) => Commands.ChooseRuns({ runs, seat }),
    RabbitHunt: () => Commands.RabbitHunt({ seat }),
    ShowCards: ({ cards }) => Commands.ShowCards({ cards, seat }),
  });

export const play = (
  state: Open,
  player: PlayerId,
  command: PlayCommand
): Decision =>
  Result.flatMap(heldSeat(state, player), (seat) =>
    onTable(state.table, forSeat(command, seat), command.at)
  );
