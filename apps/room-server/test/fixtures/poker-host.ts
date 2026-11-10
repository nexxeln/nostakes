import {
  CommandIdSchema,
  PlayerIdSchema,
  RoomCodeSchema,
} from "@nostakes/protocol";
import type { PlayerId } from "@nostakes/protocol";
import { Option, Result, Schema } from "effect";

import { pokerRoom } from "../../src/poker-room.js";
import type { MemberCommand, OpenRequest } from "../../src/poker-room.js";
import {
  hostRoom,
  loadRoom,
  openStorage,
  Origins,
  ROOM_RETENTION_MS,
} from "../../src/room-host.js";
import type { Connections } from "../../src/room-host.js";
import { memoryStorage } from "./memory-storage.js";
import { recordingViewer } from "./toy-host.js";
import type { RecordingViewer } from "./toy-host.js";

export const ana = PlayerIdSchema.make("ana-aaaaaaaaaaaa");

export const ben = PlayerIdSchema.make("ben-bbbbbbbbbbbb");

export const cy = PlayerIdSchema.make("cy-ccccccccccccc");

export const shuffleBytesFor = (at: number, size: number) =>
  Uint8Array.from({ length: size }, (_, index) => (index * 7 + at) % 256);

export const openPokerHost = (request: OpenRequest) => {
  const memory = memoryStorage();

  openStorage(
    pokerRoom,
    memory.storage,
    { at: 1000, code: RoomCodeSchema.make("K7P2XZ"), host: ana, request },
    { hash: "a".repeat(64), player: ana }
  );

  const host = hostRoom(
    pokerRoom,
    memory.storage,
    Option.getOrThrow(loadRoom(pokerRoom, memory.storage)),
    ROOM_RETENTION_MS
  );

  const viewers: RecordingViewer[] = [];

  const connections = (): Connections => ({
    closeAll: () => {
      viewers.length = 0;
    },
    socketDeadline: Option.none(),
    viewers,
  });

  const decodeFrame = Schema.decodeSync(
    Schema.fromJsonString(host.codec.server)
  );

  const send = (
    player: PlayerId,
    id: string,
    at: number,
    command: MemberCommand
  ) =>
    host.commit(
      {
        at,
        command: pokerRoom.stamp(player, at, command),
        grant: Option.none(),
        origin: Origins.Member({ id: CommandIdSchema.make(id), player }),
      },
      connections()
    );

  const join = (player: PlayerId, at: number, name: string) =>
    host.commit(
      {
        at,
        command: pokerRoom.stamp(
          player,
          at,
          pokerRoom.joinCommand({ avatar: "owl", name })
        ),
        grant: Option.some({ hash: name.padEnd(64, "0"), player }),
        origin: Origins.Server({ trigger: "Join" }),
      },
      connections()
    );

  const runDue = (at: number) =>
    host.nextDeadline().pipe(
      Option.filter((deadline) => deadline.at <= at),
      Option.map(({ due }) =>
        host.commit(
          {
            at,
            command: pokerRoom.serverCommand(
              due,
              at,
              shuffleBytesFor(at, pokerRoom.entropyFor(due)),
              Option.none()
            ),
            grant: Option.none(),
            origin: Origins.Server({ trigger: "Alarm" }),
          },
          connections()
        )
      )
    );

  const watch = (player: PlayerId) => {
    const viewer = recordingViewer(player);

    viewers.push(viewer);

    return viewer;
  };

  const welcome = (
    player: PlayerId,
    after: Option.Option<number>,
    at: number
  ) => Result.getOrThrow(host.welcome(player, after, at, connections()));

  return {
    connections,
    decodeFrame,
    host,
    join,
    memory,
    runDue,
    send,
    watch,
    welcome,
  };
};
