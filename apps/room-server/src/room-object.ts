import * as Cloudflare from "@alchemy.run/cloudflare";
import type * as cf from "@cloudflare/workers-types";
import {
  HELLO_TIMEOUT_MS,
  HttpRefusalSchema,
  PING_FRAME,
  PONG_FRAME,
  SOCKET_SILENCE_LIMIT_MS,
  PLAYER_ID_BYTES,
  PlayerIdSchema,
  RoomCodeSchema,
  TOKEN_BYTES,
  TokenTextSchema,
} from "@nostakes/protocol";
import type { CloseReason, HttpRefusal } from "@nostakes/protocol";
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

import { Beacon } from "./beacon.js";
import { Entropy, liveEntropy } from "./entropy.js";
import { fullBucket, oversized, spendFrame } from "./frame-limits.js";
import type { FrameBucket } from "./frame-limits.js";
import type { HostedRoom, RoomTypes } from "./hosted-room.js";
import { refuseSocket } from "./refused-socket.js";
import {
  CommitNotes,
  hostRoom,
  loadRoom,
  openStorage,
  Origins,
} from "./room-host.js";
import type { CommitResult, Connections, RoomHost } from "./room-host.js";
import {
  InspectionSchema,
  JoinOutcomeSchema,
  MAX_MEMBERS,
  MAX_SOCKETS,
  OpenOutcomeSchema,
} from "./room-rpc.js";
import type { Inspection } from "./room-rpc.js";
import { attach, attachmentOf, AttachmentSchema } from "./socket-attachment.js";
import { acknowledgeClose, closeWith } from "./socket-close.js";
import { sqliteStorage } from "./sqlite-storage.js";
import { workerdGlobals } from "./workerd.js";

export interface RoomObjectOptions {
  readonly entropy: Layer.Layer<Entropy>;
  readonly beacon: Layer.Layer<Beacon>;
  readonly retainFor: number;
}

const refusalStatus: Record<HttpRefusal["refusal"], number> = {
  BadOrigin: 403,
  BadRequest: 400,
  NoFreeCode: 503,
  NotFound: 404,
  RoomFull: 409,
  RoomHalted: 410,
  UpgradeRequired: 426,
};

export const refuse = (refusal: HttpRefusal["refusal"]) =>
  HttpServerResponse.schemaJson(HttpRefusalSchema)(
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

const send = (socket: cf.WebSocket, frame: string) => {
  Result.try(() => {
    socket.send(frame);
  });
};

const OpenCallSchema = <OpenRequest extends Schema.Top>(request: OpenRequest) =>
  Schema.Struct({ code: RoomCodeSchema, request });

const JoinCallSchema = <JoinRequest extends Schema.Top>(request: JoinRequest) =>
  Schema.Struct({ request });

export const roomObject = <T extends RoomTypes>(
  core: HostedRoom<T>,
  options: RoomObjectOptions
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
        const alarmRuns: { at: number; outcome: string }[] = [];
        const buckets = new WeakMap<cf.WebSocket, FrameBucket>();

        const hosted = () =>
          loadRoom(core, storage).pipe(
            Option.map((loaded) =>
              hostRoom(core, storage, loaded, options.retainFor)
            )
          );

        let host: Option.Option<RoomHost<T>> = hosted();

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
            Option.contains(except, socket)
              ? []
              : attachmentOf(socket).pipe(
                  Option.filter(AttachmentSchema.guards.Live),
                  Option.map(({ heardAt, player }) => ({
                    heardAt: Math.max(heardAt, answeredPingAt(socket)),
                    player,
                    socket,
                  })),
                  Option.toArray
                )
          );

        const pendingSince = (except: Option.Option<cf.WebSocket>) =>
          sockets().flatMap((socket) =>
            Option.contains(except, socket)
              ? []
              : attachmentOf(socket).pipe(
                  Option.filter(AttachmentSchema.guards.Pending),
                  Option.map(({ acceptedAt }) => ({ acceptedAt, socket })),
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

        const logCommit = (result: CommitResult<T>, command: T["Command"]) =>
          CommitNotes.$match(result.note, {
            Committed: () => Effect.void,
            Halted: ({ events, violations }) =>
              Effect.logError("room halted on an unsound commit", {
                command,
                events,
                violations,
              }),
            Rejected: () => Effect.void,
            Replayed: () => Effect.void,
            RoomHalted: () => Effect.void,
            StorageFailed: ({ cause }) =>
              Effect.logWarning("room commit could not be stored", {
                cause,
                command,
              }),
          });

        const armAlarm = (room: RoomHost<T>) => {
          room.armAlarm(connectionsOf(room, Option.none()).socketDeadline);
        };

        const closeSocket = (socket: cf.WebSocket, reason: CloseReason) => {
          const wasLive = attachmentOf(socket).pipe(
            Option.filter(AttachmentSchema.guards.Live)
          );

          attach(socket, AttachmentSchema.cases.Closed.make({ reason }));
          closeWith(socket, reason);

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

        for (const room of Option.toArray(host)) {
          armAlarm(room);
        }

        const welcomeSocket = (
          room: RoomHost<T>,
          socket: cf.WebSocket,
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

          attach(
            socket,
            AttachmentSchema.cases.Live.make({
              heardAt: at,
              player: player.value,
            })
          );

          const welcome = room.welcome(
            player.value,
            after,
            at,
            connectionsOf(room, Option.none())
          );

          if (Result.isFailure(welcome)) {
            return;
          }

          send(socket, welcome.success);

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
          frame: string | ArrayBuffer,
          at: number
        ): Option.Option<CloseReason> => {
          const tooLarge = oversized(frame);

          if (Option.isSome(tooLarge)) {
            return tooLarge;
          }

          const spent = spendFrame(buckets.get(socket) ?? fullBucket(at), at);

          if (Option.isNone(spent)) {
            return Option.some("TooManyFrames");
          }

          buckets.set(socket, spent.value);

          return frame instanceof ArrayBuffer
            ? Option.some("ProtocolViolation")
            : Option.none();
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
            const refusal = admit(socket, frame, at);

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
                AttachmentSchema.cases.Live.make({
                  heardAt: at,
                  player: live.player,
                })
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

                  const stamped = core.stamp(live.value.player, at, command);

                  const result = room.commit(
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

                  yield* logCommit(result, stamped);
                }),
              Hello: ({ after, token }) =>
                Effect.gen(function* greet() {
                  if (
                    !attachment.pipe(
                      Option.exists(AttachmentSchema.guards.Pending)
                    )
                  ) {
                    closeSocket(socket, "ProtocolViolation");

                    return;
                  }

                  const bytes = Base64Url.decode(Redacted.value(token)).pipe(
                    Result.getOrElse(() => new Uint8Array())
                  );

                  const hash = yield* sha256(bytes);
                  const now = yield* Clock.currentTimeMillis;

                  welcomeSocket(room, socket, hash, after, now);
                }),
              Ping: () =>
                Effect.sync(() => {
                  send(
                    socket,
                    codec.encodeFrame(codec.server.cases.Pong.make({}))
                  );
                }),
            });
          });

        const release = (socket: cf.WebSocket) =>
          Effect.sync(() => {
            const wasLive = attachmentOf(socket).pipe(
              Option.filter(AttachmentSchema.guards.Live)
            );

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
            connectionsOf(room, Option.none()).closeAll("NotFound");
            yield* storage.forget;
            host = Option.none();
            alarmRuns.push({ at, outcome: "Forgotten" });

            return;
          }

          expireHellos(at);
          dropSilent(at);

          const due = room
            .nextDeadline()
            .pipe(Option.filter((deadline) => deadline.at <= at));

          if (Option.isNone(due)) {
            alarmRuns.push({ at, outcome: "NothingDue" });
            armAlarm(room);

            return;
          }

          const bytes = yield* entropy.bytes(core.entropyFor(due.value.due));

          const signature = yield* Option.match(
            core.beaconRoundFor(due.value.due),
            {
              onNone: () => Effect.succeed(Option.none<Uint8Array>()),
              onSome: (round) => beacon.signature(round),
            }
          );

          const sentAt = yield* Clock.currentTimeMillis;

          const command = core.serverCommand(
            due.value.due,
            sentAt,
            bytes,
            signature
          );

          const result = room.commit(
            {
              at: sentAt,
              command,
              grant: Option.none(),
              origin: Origins.Server({ trigger: "Alarm" }),
            },
            connectionsOf(room, Option.none())
          );

          alarmRuns.push({ at, outcome: result.note._tag });
          armAlarm(room);

          yield* logCommit(result, command);
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

            openStorage(
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

            yield* logCommit(result, command);

            return codecOf(room).reply.match(result.reply, {
              Accepted: () =>
                JoinOutcomeSchema.cases.Joined.make({
                  player: minted.player,
                  token: minted.token,
                }),
              Rejected: () => JoinOutcomeSchema.cases.Refused.make({}),
              Unavailable: () => JoinOutcomeSchema.cases.RoomHalted.make({}),
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

        const upgrade = Effect.gen(function* upgradeSocket() {
          const request = yield* HttpServerRequest.HttpServerRequest;

          if (request.headers.upgrade?.toLowerCase() !== "websocket") {
            return yield* refuse("UpgradeRequired");
          }

          if (Option.isNone(host)) {
            return yield* refuseSocket("NotFound");
          }

          if (Option.isSome(host.value.snapshot().halted)) {
            return yield* refuseSocket("RoomHalted");
          }

          if (sockets().length >= MAX_SOCKETS) {
            return yield* refuseSocket("TooManySockets");
          }

          const at = yield* Clock.currentTimeMillis;
          const [response, socket] = yield* Cloudflare.upgrade();

          attach(
            socket.ws,
            AttachmentSchema.cases.Pending.make({ acceptedAt: at })
          );
          armAlarm(host.value);

          return response;
        });

        return {
          alarm: () => runAlarm,
          fetch: upgrade,
          inspect,
          join,
          open,
          webSocketClose: (socket: Cloudflare.WebSocket) => release(socket.ws),
          webSocketError: (socket: Cloudflare.WebSocket) => release(socket.ws),
          webSocketMessage: (
            socket: Cloudflare.WebSocket,
            message: string | ArrayBuffer
          ) => receive(socket.ws, message),
        };
      });
    })
  );
