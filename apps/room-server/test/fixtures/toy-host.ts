import {
  CommandIdSchema,
  PlayerIdSchema,
  RoomCodeSchema,
} from "@nostakes/protocol";
import type { PlayerId } from "@nostakes/protocol";
import { Option, Schema } from "effect";

import type { HostedRoom } from "../../src/hosted-room.js";
import {
  loadRoom,
  hostRoom,
  openStorage,
  Origins,
} from "../../src/room-host.js";
import type { Connections, Viewer } from "../../src/room-host.js";
import type { RoomStorage } from "../../src/room-storage.js";
import { memoryStorage } from "./memory-storage.js";
import { toyRoom } from "./toy-room.js";
import type { ToyMemberCommand, ToyTypes } from "./toy-room.js";

export const ana = PlayerIdSchema.make("ana-aaaaaaaaaaaa");

export const ben = PlayerIdSchema.make("ben-bbbbbbbbbbbb");

export const cy = PlayerIdSchema.make("cy-ccccccccccccc");

export interface RecordingViewer extends Viewer {
  readonly frames: string[];
}

export const recordingViewer = (player: PlayerId): RecordingViewer => {
  const frames: string[] = [];

  return {
    frames,
    player,
    send: (frame) => {
      frames.push(frame);
    },
  };
};

export const openToyHost = (
  core: HostedRoom<ToyTypes> = toyRoom,
  wrap: (storage: RoomStorage) => RoomStorage = (storage) => storage
) => {
  const memory = memoryStorage();
  const storage = wrap(memory.storage);

  openStorage(
    core,
    storage,
    {
      at: 1000,
      code: RoomCodeSchema.make("K7P2XZ"),
      host: ana,
      request: { avatar: "fox", name: "Ana" },
    },
    { hash: "a".repeat(64), player: ana }
  );

  const host = hostRoom(
    core,
    storage,
    Option.getOrThrow(loadRoom(core, storage))
  );

  const closings: string[] = [];

  const viewers: RecordingViewer[] = [];

  const connections = (): Connections => ({
    closeAll: (frame) => {
      closings.push(frame);
    },
    helloDeadline: Option.none(),
    viewers,
  });

  const decodeFrame = Schema.decodeSync(
    Schema.fromJsonString(host.codec.server)
  );

  const send = (
    player: PlayerId,
    id: string,
    at: number,
    command: ToyMemberCommand
  ) =>
    host.commit(
      {
        at,
        command: core.stamp(player, at, command),
        grant: Option.none(),
        origin: Origins.Member({ id: CommandIdSchema.make(id), player }),
      },
      connections()
    );

  const join = (player: PlayerId, at: number, name: string) =>
    host.commit(
      {
        at,
        command: core.stamp(
          player,
          at,
          core.joinCommand({ avatar: "owl", name })
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
            command: core.serverCommand(
              due,
              at,
              Uint8Array.from(
                { length: core.entropyFor(due) },
                (_, index) => (index * 7 + at) % 256
              )
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

  return {
    closings,
    connections,
    decodeFrame,
    host,
    join,
    memory,
    runDue,
    send,
    watch,
  };
};
