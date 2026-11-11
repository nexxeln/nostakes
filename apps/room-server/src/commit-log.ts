import { Option } from "effect";

import type { HostedRoom, RoomTypes } from "./hosted-room.js";
import { CommitNotes } from "./room-host.js";
import type { CommitResult } from "./room-host.js";

export interface LogLine {
  readonly level: "Error" | "Warning";
  readonly message: string;
  readonly annotations: Readonly<Record<string, string | number>>;
}

export const invariantOf = (violation: string) =>
  violation.split(":", 1)[0] ?? violation;

export const commitLogOf = <T extends RoomTypes>(
  core: HostedRoom<T>,
  result: CommitResult<T>,
  command: T["Command"]
): Option.Option<LogLine> =>
  CommitNotes.$match(result.note, {
    Committed: () => Option.none(),
    Crashed: () => Option.none(),
    Halted: ({ from, kinds, violations }) =>
      Option.some<LogLine>({
        annotations: {
          command: core.commandKind(command),
          events: kinds.join(","),
          from,
          invariants: violations.map(invariantOf).join("; "),
          to: from + kinds.length - 1,
        },
        level: "Error",
        message: "room halted on an unsound commit",
      }),
    Rejected: () => Option.none(),
    Replayed: () => Option.none(),
    RoomHalted: () => Option.none(),
    StorageFailed: ({ cause }) =>
      Option.some<LogLine>({
        annotations: { cause, command: core.commandKind(command) },
        level: "Warning",
        message: "room commit could not be stored",
      }),
  });
