import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as cf from "@cloudflare/workers-types";
import {
  COMMAND_ALLOWANCE,
  FRAME_ALLOWANCE,
  HELLO_TIMEOUT_MS,
  PLAYER_FRAME_ALLOWANCE,
  PlainRefusalSchema,
  PING_FRAME,
  PONG_FRAME,
  SOCKET_SILENCE_LIMIT_MS,
  PLAYER_ID_BYTES,
  PlayerIdSchema,
  RoomCodeSchema,
  SIGNAL_ALLOWANCE,
  SOCKETS_PER_PLAYER,
  StandingsRequestSchema,
  TOKEN_BYTES,
  TokenTextSchema,
  fullBucket,
  spendToken,
  versionMismatch,
} from "@nostakes/protocol";
import type {
  Allowance,
  Bucket,
  CloseReason,
  CommandId,
  PlainRefusal,
  PlayerId,
} from "@nostakes/protocol";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  Equal,
  Layer,
  Option,
  Order,
  Redacted,
  Result,
  Schema,
} from "effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Hex from "effect/encoding/Hex";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { measureAll, recorder } from "./analytics.js";
import type { AnalyticsSink, RoomMeasures } from "./analytics.js";
import type { BeaconGaveUp } from "./beacon-gave-up.js";
import { askBeacon, Beacon } from "./beacon.js";
import type { BeaconAnswer } from "./beacon.js";
import type { CommandFault } from "./command-fault.js";
import { DeviceHashSchema } from "./device.js";
import { Entropy, liveEntropy } from "./entropy.js";
import { oversized } from "./frame-limits.js";
import type { HostedRoom, RoomTypes } from "./hosted-room.js";
import { measure } from "./measures.js";
import type { Measure } from "./measures.js";
import { RETRY_POLICY } from "./refused-deadline.js";
import type { RefusedDeadline, RetryPolicy } from "./refused-deadline.js";
import { refuseSocket } from "./refused-socket.js";
import {
  CommitNotes,
  hostRoom,
  loadRoom,
  openStorage,
  Origins,
  StandingsAnswers,
} from "./room-host.js";
import type { CommitResult, Connections, RoomHost } from "./room-host.js";
import {
  CheckOutcomeSchema,
  InspectionSchema,
  JoinOutcomeSchema,
  MAX_MEMBERS,
  OpenOutcomeSchema,
  PENDING_SOCKETS,
  StandingsOutcomeSchema,
} from "./room-rpc.js";
import type { Inspection } from "./room-rpc.js";
import { servedBuildOrNone } from "./served-build.js";
import {
  attach,
  attachmentOf,
  AttachmentSchema,
  openedOf,
  REJECTION_BYTES_PER_SOCKET,
  REJECTIONS_KEPT_PER_SOCKET,
} from "./socket-attachment.js";
import type { KeptRejection } from "./socket-attachment.js";
import { acknowledgeClose, closeWith } from "./socket-close.js";
import { sqliteStorage } from "./sqlite-storage.js";
import { workerdGlobals } from "./workerd.js";

export interface RoomObjectOptions<T extends RoomTypes, Tally> {
  readonly entropy: Layer.Layer<Entropy>;
  readonly beacon: Layer.Layer<Beacon>;
  readonly retainFor: number;
  readonly retries?: RetryPolicy;
  readonly analytics: AnalyticsSink<RuntimeContext>;
  readonly measures: RoomMeasures<T["Event"], Tally>;
}

const refusalStatus: Record<PlainRefusal["refusal"], number> = {
  BadOrigin: 403,
  BadRequest: 400,
  NoFreeCode: 503,
  NotAuthorized: 403,
  NotFound: 404,
  RoomFull: 409,
  RoomHalted: 410,
  RoomOpen: 409,
  RoomUnavailable: 503,
  ServerFault: 500,
  UpgradeRequired: 426,
};

export const refuse = (refusal: PlainRefusal["refusal"]) =>
  HttpServerResponse.schemaJson(PlainRefusalSchema)(
    { refusal },
    { status: refusalStatus[refusal] }
  ).pipe(Effect.orDie);

const sha256 = (bytes: Uint8Array) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", bytes)).pipe(
    Effect.map((digest) => new Uint8Array(digest))
  );

const liveBytes = (size: number) =>
  Entropy.use((entropy) => entropy.bytes(size)).pipe(
    Effect.provide(liveEntropy)
  );

const mintCredential = Effect.gen(function* mintCredential() {
  const playerBytes = yield* liveBytes(PLAYER_ID_BYTES);
  const tokenBytes = yield* liveBytes(TOKEN_BYTES);
  const hash = yield* sha256(tokenBytes);

  return {
    hash: Hex.encode(hash),
    player: PlayerIdSchema.make(Base64Url.encode(playerBytes)),
    token: TokenTextSchema.make(Base64Url.encode(tokenBytes)),
  };
});

const byNumber = Order.Number;

interface Buckets<K> {
  readonly get: (key: K) => Bucket | undefined;
  readonly set: (key: K, bucket: Bucket) => void;
}

const spendFrom = <K>(
  buckets: Buckets<K>,
  key: K,
  allowance: Allowance,
  at: number
) => {
  const spent = spendToken(
    allowance,
    buckets.get(key) ?? fullBucket(allowance, at),
    at
  );

  for (const bucket of Option.toArray(spent)) {
    buckets.set(key, bucket);
  }

  return Option.isSome(spent);
};

const keptWith = (
  kept: readonly KeptRejection[],
  added: KeptRejection
): readonly KeptRejection[] => {
  const newest = [...kept, added].slice(-REJECTIONS_KEPT_PER_SOCKET);
  let bytes = 0;

  return newest
    .toReversed()
    .filter(({ id, reply }) => {
      bytes += id.length + reply.length;

      return bytes <= REJECTION_BYTES_PER_SOCKET;
    })
    .toReversed();
};

const keepOnSocket = (socket: cf.WebSocket, added: KeptRejection) => {
  for (const live of Option.toArray(
    attachmentOf(socket).pipe(Option.filter(AttachmentSchema.guards.Live))
  )) {
    attach(
      socket,
      AttachmentSchema.cases.Live.make({
        ...live,
        rejected: keptWith(live.rejected, added),
      })
    );
  }
};

const oldestFirst = <A extends { readonly opened: number }>(
  open: readonly A[]
) =>
  Arr.sort(
    open,
    Order.mapInput(byNumber, ({ opened }: A) => opened)
  );

const send = (socket: cf.WebSocket, frame: string) => {
  Result.try(() => {
    socket.send(frame);
  });
};

const OpenCallSchema = <OpenRequest extends Schema.Top>(request: OpenRequest) =>
  Schema.Struct({
    code: RoomCodeSchema,
    device: Schema.optionalKey(DeviceHashSchema),
    request,
  });

const JoinCallSchema = <JoinRequest extends Schema.Top>(request: JoinRequest) =>
  Schema.Struct({ device: Schema.optionalKey(DeviceHashSchema), request });

const ROOM_KEY_LENGTH = 16;

export const roomKeyOf = (objectId: string) =>
  sha256(new TextEncoder().encode(`nostakes room ${objectId}`)).pipe(
    Effect.map((digest) => Hex.encode(digest).slice(0, ROOM_KEY_LENGTH))
  );

export const roomObject = <T extends RoomTypes, Tally>(
  core: HostedRoom<T>,
  options: RoomObjectOptions<T, Tally>
) =>
  Cloudflare.DurableObjectState.pipe(
    Effect.map((state) => {
      const OpenCall = OpenCallSchema(core.schemas.openRequest);
      const JoinCall = JoinCallSchema(core.schemas.joinRequest);

      return Effect.gen(function* makeRoomInstance() {
        const services = yield* Layer.build(
          Layer.merge(options.entropy, options.beacon)
        );

        const entropy = Context.get(services, Entropy);
        const beacon = Context.get(services, Beacon);
        const { raw } = state;

        const runtime = yield* workerdGlobals(
          "answer pings while the room hibernates"
        );

        raw.setWebSocketAutoResponse(
          new runtime.WebSocketRequestResponsePair(PING_FRAME, PONG_FRAME)
        );

        const storage = sqliteStorage(raw.storage, (pending) => {
          raw.waitUntil(pending);
        });

        const instance = Hex.encode(yield* liveBytes(8));
        const served = yield* servedBuildOrNone;
        const alarmRuns: { at: number; outcome: string }[] = [];
        const faults: string[] = [];
        const socketBuckets = new WeakMap<cf.WebSocket, Bucket>();
        const playerBuckets = new Map<PlayerId, Bucket>();
        const commandBuckets = new Map<PlayerId, Bucket>();
        const signalBuckets = new Map<PlayerId, Bucket>();
        const runtimeContext = yield* Effect.context<RuntimeContext>();

        const record = recorder(
          {
            write: (points) =>
              options.analytics
                .write(points)
                .pipe(Effect.provideContext(runtimeContext)),
          },
          yield* roomKeyOf(raw.id.toString()),
          (text) => {
            faults.push(text);
          }
        );

        const pending: Measure[] = [];
        let tally = options.measures.empty;

        const note = (...measures: readonly Measure[]) => {
          pending.push(...measures);
        };

        const measured = (
          events: readonly T["Event"][],
          device: Option.Option<string>
        ) => {
          const [next, measures] = measureAll(
            options.measures,
            tally,
            events,
            device
          );

          tally = next;
          note(...measures);
        };

        const flush = Effect.suspend(() => record(pending.splice(0)));

        const hosted = () =>
          loadRoom(core, storage, (events) => {
            [tally] = measureAll(
              options.measures,
              options.measures.empty,
              events,
              Option.none()
            );
          }).pipe(
            Option.map((loaded) =>
              hostRoom(
                core,
                storage,
                loaded,
                options.retainFor,
                options.retries ?? RETRY_POLICY
              )
            )
          );

        let host: Option.Option<RoomHost<T>> = hosted();

        yield* Effect.logInfo("the room object started").pipe(
          Effect.annotateLogs({
            instance,
            room: Option.isSome(host) ? "loaded from storage" : "empty",
            sockets: raw.getWebSockets().length,
          })
        );

        const codecOf = (room: RoomHost<T>) => room.codec;

        const sockets = () => raw.getWebSockets();

        const answeredPingAt = (socket: cf.WebSocket) =>
          Option.fromNullishOr(
            raw.getWebSocketAutoResponseTimestamp(socket)
          ).pipe(
            Option.map((answered) => answered.getTime()),
            Option.getOrElse(() => 0)
          );

        const liveSockets = (except: Option.Option<cf.WebSocket>) =>
          sockets().flatMap((socket) =>
            Option.exists(except, (excluded) => excluded === socket)
              ? []
              : attachmentOf(socket).pipe(
                  Option.filter(AttachmentSchema.guards.Live),
                  Option.map(({ heardAt, opened, player }) => ({
                    heardAt: Math.max(heardAt, answeredPingAt(socket)),
                    opened,
                    player,
                    socket,
                  })),
                  Option.toArray
                )
          );

        const pendingSince = (except: Option.Option<cf.WebSocket>) =>
          sockets().flatMap((socket) =>
            Option.exists(except, (excluded) => excluded === socket)
              ? []
              : attachmentOf(socket).pipe(
                  Option.filter(AttachmentSchema.guards.Pending),
                  Option.map(({ acceptedAt, opened }) => ({
                    acceptedAt,
                    opened,
                    socket,
                  })),
                  Option.toArray
                )
          );

        const connectionsOf = (
          room: RoomHost<T>,
          except: Option.Option<cf.WebSocket>
        ): Connections => ({
          closeAll: (reason) => {
            for (const socket of sockets()) {
              attach(socket, AttachmentSchema.cases.Closed.make({ reason }));
              closeWith(socket, reason);
              note(measure("SocketClosed", { reason }));
            }
          },
          socketDeadline: Arr.head(
            Arr.sort(
              [
                ...pendingSince(except).map(
                  ({ acceptedAt }) => acceptedAt + HELLO_TIMEOUT_MS
                ),
                ...liveSockets(except).map(
                  ({ heardAt }) => heardAt + SOCKET_SILENCE_LIMIT_MS
                ),
              ],
              byNumber
            )
          ),
          viewers: liveSockets(except).map(({ player, socket }) => ({
            player,
            send: (frame) => {
              send(socket, frame);
            },
          })),
        });

        const connectedPlayers = (except: Option.Option<cf.WebSocket>) =>
          Arr.dedupe(liveSockets(except).map(({ player }) => player));

        const announcePresence = (
          room: RoomHost<T>,
          except: Option.Option<cf.WebSocket>
        ) => {
          const frame = codecOf(room).encodeFrame(
            codecOf(room).server.cases.Presence.make({
              connected: connectedPlayers(except),
            })
          );

          for (const { socket } of liveSockets(except)) {
            send(socket, frame);
          }
        };

        const logCommit = (
          result: CommitResult<T>,
          command: T["Command"],
          device: Option.Option<string> = Option.none()
        ) =>
          Effect.sync(() => {
            measured(result.events, device);
          }).pipe(
            Effect.andThen(
              CommitNotes.$match(result.note, {
                Committed: () => Effect.void,
                Crashed: () =>
                  Effect.sync(() => {
                    note(measure("ServerFault", { fault: "CoreCrashed" }));
                  }),
                Halted: ({ events, violations }) =>
                  Effect.sync(() => {
                    note(measure("ServerFault", { fault: "RoomHalted" }));
                  }).pipe(
                    Effect.andThen(
                      Effect.logError("room halted on an unsound commit", {
                        command,
                        events,
                        violations,
                      })
                    )
                  ),
                Rejected: () => Effect.void,
                Replayed: () => Effect.void,
                RoomHalted: () => Effect.void,
                StorageFailed: ({ cause }) =>
                  Effect.sync(() => {
                    note(measure("ServerFault", { fault: "StorageFailed" }));
                  }).pipe(
                    Effect.andThen(
                      Effect.logWarning("room commit could not be stored", {
                        cause,
                        command,
                      })
                    )
                  ),
              })
            )
          );

        const logFault = (
          fault: RefusedDeadline | BeaconGaveUp | CommandFault
        ) =>
          Effect.sync(() => {
            faults.push(fault.message);
          }).pipe(
            Effect.andThen(
              Effect.logError(fault.message).pipe(
                Effect.annotateLogs({ error: fault._tag })
              )
            )
          );

        const noBeacon: BeaconAnswer = {
          gaveUp: Option.none(),
          signature: Option.none(),
        };

        const armAlarm = (room: RoomHost<T>) => {
          room.armAlarm(connectionsOf(room, Option.none()).socketDeadline);
        };

        const keepRejections = (socket: cf.WebSocket) => {
          for (const { player, rejected } of Option.toArray(
            attachmentOf(socket).pipe(
              Option.filter(AttachmentSchema.guards.Live)
            )
          )) {
            for (const room of Option.toArray(host)) {
              if (rejected.length > 0) {
                room.keepReplies(player, rejected);
              }
            }
          }
        };

        const closeSocket = (socket: cf.WebSocket, reason: CloseReason) => {
          const wasLive = attachmentOf(socket).pipe(
            Option.filter(AttachmentSchema.guards.Live)
          );

          keepRejections(socket);
          attach(socket, AttachmentSchema.cases.Closed.make({ reason }));
          closeWith(socket, reason);
          note(measure("SocketClosed", { reason }));

          for (const room of Option.toArray(host)) {
            const stillThere = connectedPlayers(Option.none());

            if (
              wasLive.pipe(
                Option.exists(({ player }) => !stillThere.includes(player))
              )
            ) {
              announcePresence(room, Option.none());
            }
          }
        };

        const attend = (except: Option.Option<cf.WebSocket>) =>
          Effect.gen(function* noteAttendance() {
            const at = yield* Clock.currentTimeMillis;

            for (const room of Option.toArray(host)) {
              for (const { command, result } of Option.toArray(
                room.noteAttendance(
                  connectedPlayers(except),
                  at,
                  connectionsOf(room, except)
                )
              )) {
                yield* logCommit(result, command);
              }
            }
          });

        for (const room of Option.toArray(host)) {
          armAlarm(room);
        }

        yield* attend(Option.none());
        yield* flush;

        const nextOpened = () =>
          1 +
          Math.max(
            0,
            ...sockets().flatMap((socket) =>
              Option.toArray(
                attachmentOf(socket).pipe(Option.flatMap(openedOf))
              )
            )
          );

        const makeRoomForPending = () => {
          const waiting = pendingSince(Option.none());

          for (const { socket } of oldestFirst(waiting).slice(
            0,
            Math.max(0, waiting.length + 1 - PENDING_SOCKETS)
          )) {
            closeSocket(socket, "TooManySockets");
          }
        };

        const welcomeSocket = (
          room: RoomHost<T>,
          socket: cf.WebSocket,
          opened: number,
          hash: Uint8Array,
          after: Option.Option<number>,
          at: number
        ) => {
          if (Option.isSome(room.snapshot().halted)) {
            closeSocket(socket, "RoomHalted");

            return;
          }

          const player = room.authenticate(hash);

          if (Option.isNone(player)) {
            closeSocket(socket, "NotAuthorized");

            return;
          }

          const wasConnected = connectedPlayers(Option.none()).includes(
            player.value
          );

          const older = liveSockets(Option.some(socket)).filter(
            (live) => live.player === player.value
          );

          attach(
            socket,
            AttachmentSchema.cases.Live.make({
              heardAt: at,
              opened,
              player: player.value,
              rejected: [],
            })
          );

          for (const { socket: oldest } of oldestFirst(older).slice(
            0,
            Math.max(0, older.length + 1 - SOCKETS_PER_PLAYER)
          )) {
            closeSocket(oldest, "OpenedElsewhere");
          }

          const welcome = room.welcome(
            player.value,
            after,
            at,
            connectionsOf(room, Option.none()),
            served
          );

          if (Result.isFailure(welcome)) {
            return;
          }

          send(socket, welcome.success);

          if (Option.isSome(after)) {
            note(measure("SocketResumed", {}));
          }

          if (wasConnected) {
            send(
              socket,
              codecOf(room).encodeFrame(
                codecOf(room).server.cases.Presence.make({
                  connected: connectedPlayers(Option.none()),
                })
              )
            );
          } else {
            announcePresence(room, Option.none());
          }

          armAlarm(room);
        };

        const admit = (
          socket: cf.WebSocket,
          sender: Option.Option<PlayerId>,
          frame: string | ArrayBuffer,
          at: number
        ): Option.Option<CloseReason> => {
          const tooLarge = oversized(frame);

          if (Option.isSome(tooLarge)) {
            return tooLarge;
          }

          const spent = Option.match(sender, {
            onNone: () => spendFrom(socketBuckets, socket, FRAME_ALLOWANCE, at),
            onSome: (player) =>
              spendFrom(playerBuckets, player, PLAYER_FRAME_ALLOWANCE, at),
          });

          if (!spent) {
            return Option.some("TooManyFrames");
          }

          return frame instanceof ArrayBuffer
            ? Option.some("ProtocolViolation")
            : Option.none();
        };

        const signalAllowance = (player: PlayerId, at: number) =>
          spendFrom(signalBuckets, player, SIGNAL_ALLOWANCE, at);

        const rejectedBefore = (player: PlayerId, id: CommandId) =>
          Arr.findFirst(
            sockets().flatMap((socket) =>
              attachmentOf(socket).pipe(
                Option.filter(AttachmentSchema.guards.Live),
                Option.filter((live) => live.player === player),
                Option.match({
                  onNone: () => [],
                  onSome: ({ rejected }) => rejected,
                })
              )
            ),
            (kept) => kept.id === id
          );

        const relaySignal = (
          room: RoomHost<T>,
          from: cf.WebSocket,
          sender: PlayerId,
          signal: T["Signal"],
          at: number
        ) => {
          const { halted, state: current } = room.snapshot();

          if (
            Option.isSome(halted) ||
            !signalAllowance(sender, at) ||
            !core.signalAllowed(current, sender, signal)
          ) {
            return;
          }

          const relayed = codecOf(room).encodeFrame(
            codecOf(room).server.cases.Signal.make({ from: sender, signal })
          );

          for (const { socket } of liveSockets(Option.some(from))) {
            send(socket, relayed);
          }
        };

        const receive = (socket: cf.WebSocket, frame: string | ArrayBuffer) =>
          Effect.gen(function* receiveFrame() {
            const at = yield* Clock.currentTimeMillis;
            const attachment = attachmentOf(socket);

            if (
              attachment.pipe(Option.exists(AttachmentSchema.guards.Closed))
            ) {
              return;
            }

            if (Option.isNone(host)) {
              closeSocket(socket, "NotFound");

              return;
            }

            const room = host.value;
            const codec = codecOf(room);

            const refusal = admit(
              socket,
              attachment.pipe(
                Option.filter(AttachmentSchema.guards.Live),
                Option.map(({ player }) => player)
              ),
              frame,
              at
            );

            if (Option.isSome(refusal)) {
              closeSocket(socket, refusal.value);

              return;
            }

            const decoded = codec.decodeClientFrame(frame);

            if (Result.isFailure(decoded)) {
              closeSocket(socket, "ProtocolViolation");

              return;
            }

            for (const live of Option.toArray(
              attachment.pipe(Option.filter(AttachmentSchema.guards.Live))
            )) {
              attach(
                socket,
                AttachmentSchema.cases.Live.make({ ...live, heardAt: at })
              );
            }

            yield* codec.client.match(decoded.success, {
              Command: ({ command, id }) =>
                Effect.gen(function* runCommand() {
                  const live = attachment.pipe(
                    Option.filter(AttachmentSchema.guards.Live)
                  );

                  if (Option.isNone(live)) {
                    closeSocket(socket, "ProtocolViolation");

                    return;
                  }

                  if (
                    !spendFrom(
                      commandBuckets,
                      live.value.player,
                      COMMAND_ALLOWANCE,
                      at
                    )
                  ) {
                    closeSocket(socket, "TooManyFrames");

                    return;
                  }

                  const earlier = rejectedBefore(live.value.player, id);

                  if (Option.isSome(earlier)) {
                    send(
                      socket,
                      codec.encodeFrame(
                        codec.server.cases.Reply.make({
                          id,
                          result: codec.decodeReply(earlier.value.reply),
                        })
                      )
                    );

                    return;
                  }

                  const stamped = core.stamp(live.value.player, at, command);

                  const { fault, result, stall } = room.answerMember(
                    {
                      at,
                      command: stamped,
                      grant: Option.none(),
                      origin: Origins.Member({ id, player: live.value.player }),
                    },
                    connectionsOf(room, Option.none())
                  );

                  send(
                    socket,
                    codec.encodeFrame(
                      codec.server.cases.Reply.make({
                        id,
                        result: result.reply,
                      })
                    )
                  );

                  if (CommitNotes.$is("Rejected")(result.note)) {
                    keepOnSocket(socket, { id, reply: result.note.reply });
                  }

                  yield* logCommit(result, stamped);

                  for (const thrown of Option.toArray(fault)) {
                    yield* logFault(thrown);
                  }

                  for (const stalled of Option.toArray(stall)) {
                    yield* logCommit(stalled.result, stalled.command);
                  }
                }),
              Hello: ({ after, protocol, token }) =>
                Effect.gen(function* greet() {
                  const waiting = attachment.pipe(
                    Option.filter(AttachmentSchema.guards.Pending)
                  );

                  if (Option.isNone(waiting)) {
                    closeSocket(socket, "ProtocolViolation");

                    return;
                  }

                  const mismatch = versionMismatch(protocol);

                  if (Option.isSome(mismatch)) {
                    closeSocket(socket, mismatch.value);

                    return;
                  }

                  const bytes = Base64Url.decode(Redacted.value(token)).pipe(
                    Result.getOrElse(() => new Uint8Array())
                  );

                  const hash = yield* sha256(bytes);
                  const now = yield* Clock.currentTimeMillis;

                  welcomeSocket(
                    room,
                    socket,
                    waiting.value.opened,
                    hash,
                    after,
                    now
                  );
                }),
              Ping: () =>
                Effect.sync(() => {
                  send(
                    socket,
                    codec.encodeFrame(codec.server.cases.Pong.make({}))
                  );
                }),
              Signal: ({ signal }) =>
                Effect.sync(() => {
                  for (const live of Option.toArray(
                    attachment.pipe(Option.filter(AttachmentSchema.guards.Live))
                  )) {
                    relaySignal(room, socket, live.player, signal, at);
                  }
                }),
            });
          });

        const release = (
          socket: cf.WebSocket,
          ending: "ClosedByClient" | "SocketError"
        ) =>
          Effect.sync(() => {
            const wasLive = attachmentOf(socket).pipe(
              Option.filter(AttachmentSchema.guards.Live)
            );

            if (
              !attachmentOf(socket).pipe(
                Option.exists(AttachmentSchema.guards.Closed)
              )
            ) {
              note(measure("SocketClosed", { reason: ending }));
            }

            keepRejections(socket);
            acknowledgeClose(socket);

            for (const room of Option.toArray(host)) {
              const stillThere = connectedPlayers(Option.some(socket));

              if (
                wasLive.pipe(
                  Option.exists(({ player }) => !stillThere.includes(player))
                )
              ) {
                announcePresence(room, Option.some(socket));
              }

              room.armAlarm(
                connectionsOf(room, Option.some(socket)).socketDeadline
              );
            }
          });

        const expireHellos = (at: number) => {
          for (const { acceptedAt, socket } of pendingSince(Option.none())) {
            if (acceptedAt + HELLO_TIMEOUT_MS <= at) {
              closeSocket(socket, "HelloTimeout");
            }
          }
        };

        const dropSilent = (at: number) => {
          for (const { heardAt, socket } of liveSockets(Option.none())) {
            if (heardAt + SOCKET_SILENCE_LIMIT_MS <= at) {
              closeSocket(socket, "Unresponsive");
            }
          }
        };

        const runAlarm = Effect.gen(function* runAlarm() {
          const at = yield* Clock.currentTimeMillis;

          if (Option.isNone(host)) {
            return;
          }

          const room = host.value;

          if (room.expiresAt() <= at) {
            note(...Option.toArray(options.measures.abandoned(tally)));
            connectionsOf(room, Option.none()).closeAll("NotFound");
            yield* storage.forget;
            host = Option.none();
            alarmRuns.push({ at, outcome: "Forgotten" });

            return;
          }

          expireHellos(at);
          dropSilent(at);
          yield* attend(Option.none());

          const due = room.dueAt(at);

          if (Option.isNone(due)) {
            alarmRuns.push({ at, outcome: "NothingDue" });
            armAlarm(room);

            return;
          }

          const bytes = yield* entropy.bytes(core.entropyFor(due.value.due));

          const { gaveUp, signature } = yield* Option.match(
            core.beaconRoundFor(due.value.due),
            {
              onNone: () => Effect.succeed(noBeacon),
              onSome: (round) => askBeacon(beacon, room.snapshot().code, round),
            }
          );

          const sentAt = yield* Clock.currentTimeMillis;

          const command = core.serverCommand(
            due.value.due,
            sentAt,
            bytes,
            signature
          );

          const { refused, result, stall } = room.answerDeadline(
            due.value,
            command,
            sentAt,
            connectionsOf(room, Option.none())
          );

          alarmRuns.push({ at, outcome: result.note._tag });
          armAlarm(room);

          yield* logCommit(result, command);

          for (const fault of Option.toArray(gaveUp)) {
            yield* logFault(fault);
          }

          for (const refusal of Option.toArray(refused)) {
            note(measure("AlarmRefused", { deadline: refusal.deadline }));
            yield* logFault(refusal);
          }

          for (const stalled of Option.toArray(stall)) {
            yield* logCommit(stalled.result, stalled.command);
          }
        });

        const open = (input: typeof OpenCall.Encoded) =>
          Effect.gen(function* openRoom() {
            const decoded = yield* Schema.decodeEffect(OpenCall)(input).pipe(
              Effect.option
            );

            if (Option.isNone(decoded)) {
              return OpenOutcomeSchema.cases.Invalid.make({});
            }

            const call = decoded.value;

            if (Option.isSome(host)) {
              return OpenOutcomeSchema.cases.AlreadyOpen.make({
                code: call.code,
              });
            }

            const minted = yield* mintCredential;
            const at = yield* Clock.currentTimeMillis;

            if (Option.isSome(host)) {
              return OpenOutcomeSchema.cases.AlreadyOpen.make({
                code: call.code,
              });
            }

            const opened = openStorage(
              core,
              storage,
              {
                at,
                code: call.code,
                host: minted.player,
                request: call.request,
              },
              { hash: minted.hash, player: minted.player }
            );

            host = hosted();
            tally = options.measures.empty;
            measured(opened, Option.fromUndefinedOr(call.device));

            for (const room of Option.toArray(host)) {
              armAlarm(room);
            }

            return OpenOutcomeSchema.cases.Opened.make({
              player: minted.player,
              token: minted.token,
            });
          }).pipe(
            Effect.flatMap(Schema.encodeEffect(OpenOutcomeSchema)),
            Effect.orDie
          );

        const join = (input: typeof JoinCall.Encoded) =>
          Effect.gen(function* joinRoom() {
            const decoded = yield* Schema.decodeEffect(JoinCall)(input).pipe(
              Effect.option
            );

            if (Option.isNone(decoded)) {
              return JoinOutcomeSchema.cases.Invalid.make({});
            }

            const call = decoded.value;
            const minted = yield* mintCredential;
            const at = yield* Clock.currentTimeMillis;

            if (Option.isNone(host)) {
              return JoinOutcomeSchema.cases.NotFound.make({});
            }

            const room = host.value;
            const members = room.snapshot().credentials.length;

            if (Option.isSome(room.snapshot().halted)) {
              return JoinOutcomeSchema.cases.RoomHalted.make({});
            }

            if (members >= MAX_MEMBERS) {
              return JoinOutcomeSchema.cases.RoomFull.make({ members });
            }

            const command = core.stamp(
              minted.player,
              at,
              core.joinCommand(call.request)
            );

            const result = room.commit(
              {
                at,
                command,
                grant: Option.some({
                  hash: minted.hash,
                  player: minted.player,
                }),
                origin: Origins.Server({ trigger: "Join" }),
              },
              connectionsOf(room, Option.none())
            );

            yield* logCommit(
              result,
              command,
              Option.fromUndefinedOr(call.device)
            );

            return codecOf(room).reply.match(result.reply, {
              Accepted: () =>
                JoinOutcomeSchema.cases.Joined.make({
                  player: minted.player,
                  token: minted.token,
                }),
              Rejected: ({ rejection }) =>
                JoinOutcomeSchema.cases.Refused.make({
                  rejection: Schema.encodeSync(core.schemas.rejection)(
                    rejection
                  ),
                }),
              Unavailable: ({ reason }) =>
                reason === "RoomFault"
                  ? JoinOutcomeSchema.cases.Faulted.make({})
                  : JoinOutcomeSchema.cases.RoomHalted.make({}),
            });
          }).pipe(
            Effect.flatMap(Schema.encodeEffect(JoinOutcomeSchema)),
            Effect.orDie
          );

        const inspect = () =>
          Effect.sync((): Inspection => {
            const snapshot = host.pipe(Option.map((room) => room.snapshot()));
            const rows = Option.isSome(host) ? storage.eventsAfter(0) : [];

            return {
              alarmRuns,
              code: snapshot.pipe(Option.map(({ code }) => code)),
              events: rows.map(({ event }) => event),
              faults,
              halted: snapshot.pipe(Option.flatMap(({ halted }) => halted)),
              headSeq: snapshot.pipe(
                Option.match({
                  onNone: () => 0,
                  onSome: ({ headSeq }) => headSeq,
                })
              ),
              instance,
              members: snapshot.pipe(
                Option.match({
                  onNone: () => 0,
                  onSome: ({ credentials }) => credentials.length,
                })
              ),
              memoryMatchesLog: snapshot.pipe(
                Option.exists(({ state: inMemory }) =>
                  Equal.equals(
                    inMemory,
                    core.replay(
                      rows.map((row) =>
                        Option.getOrThrow(host).codec.decodeEvent(row.event)
                      )
                    )
                  )
                )
              ),
              replies: Option.isSome(host) ? storage.countReplies() : 0,
              rowsWritten: storage.rowsWritten(),
              seqs: rows.map(({ seq }) => seq),
              sockets: {
                live: liveSockets(Option.none()).length,
                pending: pendingSince(Option.none()).length,
              },
            };
          }).pipe(
            Effect.flatMap(Schema.encodeEffect(InspectionSchema)),
            Effect.orDie
          );

        const check = () =>
          Effect.sync(() =>
            Option.isSome(host)
              ? CheckOutcomeSchema.cases.Found.make({})
              : CheckOutcomeSchema.cases.NotFound.make({})
          ).pipe(
            Effect.flatMap(Schema.encodeEffect(CheckOutcomeSchema)),
            Effect.orDie
          );

        const standings = (input: typeof StandingsRequestSchema.Encoded) =>
          Effect.gen(function* readStandings() {
            const decoded = yield* Schema.decodeEffect(StandingsRequestSchema)(
              input
            ).pipe(Effect.option);

            if (Option.isNone(decoded)) {
              return StandingsOutcomeSchema.cases.Invalid.make({});
            }

            if (Option.isNone(host)) {
              return StandingsOutcomeSchema.cases.NotFound.make({});
            }

            const room = host.value;

            const bytes = Base64Url.decode(
              Redacted.value(decoded.value.token)
            ).pipe(Result.getOrElse(() => new Uint8Array()));

            const hash = yield* sha256(bytes);
            const at = yield* Clock.currentTimeMillis;

            return StandingsAnswers.$match(room.standings(hash, at), {
              Halted: ({ view }) =>
                StandingsOutcomeSchema.cases.Halted.make({
                  view: Schema.encodeSync(core.schemas.view)(view),
                }),
              NotAuthorized: () =>
                StandingsOutcomeSchema.cases.NotAuthorized.make({}),
              NotHalted: () => StandingsOutcomeSchema.cases.NotHalted.make({}),
            });
          }).pipe(
            Effect.flatMap(Schema.encodeEffect(StandingsOutcomeSchema)),
            Effect.orDie
          );

        const upgrade = Effect.gen(function* upgradeSocket() {
          const request = yield* HttpServerRequest.HttpServerRequest;

          if (request.headers.upgrade?.toLowerCase() !== "websocket") {
            return yield* refuse("UpgradeRequired");
          }

          if (Option.isNone(host)) {
            note(measure("SocketClosed", { reason: "NotFound" }));

            return yield* refuseSocket("NotFound");
          }

          if (Option.isSome(host.value.snapshot().halted)) {
            note(measure("SocketClosed", { reason: "RoomHalted" }));

            return yield* refuseSocket("RoomHalted");
          }

          makeRoomForPending();

          const at = yield* Clock.currentTimeMillis;
          const opened = nextOpened();
          const [response, socket] = yield* Cloudflare.upgrade();

          attach(
            socket.ws,
            AttachmentSchema.cases.Pending.make({ acceptedAt: at, opened })
          );
          armAlarm(host.value);

          return response;
        });

        return {
          alarm: () => runAlarm.pipe(Effect.ensuring(flush)),
          check,
          fetch: upgrade.pipe(Effect.ensuring(flush)),
          inspect,
          join: (input: typeof JoinCall.Encoded) =>
            join(input).pipe(Effect.ensuring(flush)),
          open: (input: typeof OpenCall.Encoded) =>
            open(input).pipe(Effect.ensuring(flush)),
          standings: (input: typeof StandingsRequestSchema.Encoded) =>
            standings(input).pipe(Effect.ensuring(flush)),
          webSocketClose: (socket: Cloudflare.WebSocket) =>
            release(socket.ws, "ClosedByClient").pipe(
              Effect.andThen(attend(Option.some(socket.ws))),
              Effect.ensuring(flush)
            ),
          webSocketError: (socket: Cloudflare.WebSocket) =>
            release(socket.ws, "SocketError").pipe(
              Effect.andThen(attend(Option.some(socket.ws))),
              Effect.ensuring(flush)
            ),
          webSocketMessage: (
            socket: Cloudflare.WebSocket,
            message: string | ArrayBuffer
          ) =>
            receive(socket.ws, message).pipe(
              Effect.andThen(attend(Option.none())),
              Effect.ensuring(flush)
            ),
        };
      });
    })
  );
