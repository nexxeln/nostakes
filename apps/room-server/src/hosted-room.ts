import type { PlayerId, RoomCode, WireCodec } from "@nostakes/protocol";
import type { Option, Result } from "effect";

export interface RoomTypes {
  readonly State: unknown;
  readonly Command: unknown;
  readonly MemberCommand: unknown;
  readonly Event: unknown;
  readonly Redacted: unknown;
  readonly View: unknown;
  readonly Rejection: unknown;
  readonly Audience: unknown;
  readonly Due: unknown;
  readonly OpenRequest: unknown;
  readonly JoinRequest: unknown;
  readonly Signal: unknown;
  readonly Revoked: unknown;
}

export interface RoomSchemas<T extends RoomTypes> {
  readonly memberCommand: WireCodec<T["MemberCommand"]>;
  readonly event: WireCodec<T["Event"]>;
  readonly redacted: WireCodec<T["Redacted"]>;
  readonly view: WireCodec<T["View"]>;
  readonly rejection: WireCodec<T["Rejection"]>;
  readonly openRequest: WireCodec<T["OpenRequest"]>;
  readonly joinRequest: WireCodec<T["JoinRequest"]>;
  readonly signal: WireCodec<T["Signal"]>;
  readonly revoked: WireCodec<T["Revoked"]>;
}

export interface OpenInput<OpenRequest> {
  readonly code: RoomCode;
  readonly host: PlayerId;
  readonly at: number;
  readonly request: OpenRequest;
}

export interface Deadline<Due> {
  readonly at: number;
  readonly due: Due;
}

export interface HostedRoom<T extends RoomTypes> {
  readonly schemas: RoomSchemas<T>;
  readonly open: (input: OpenInput<T["OpenRequest"]>) => readonly T["Event"][];
  readonly joinCommand: (request: T["JoinRequest"]) => T["MemberCommand"];
  readonly stamp: (
    player: PlayerId,
    at: number,
    command: T["MemberCommand"]
  ) => T["Command"];
  readonly entropyFor: (due: T["Due"]) => number;
  readonly attendance: (
    state: T["State"],
    connected: readonly PlayerId[],
    at: number
  ) => Option.Option<T["Command"]>;
  readonly beaconRoundFor: (due: T["Due"]) => Option.Option<number>;
  readonly dueKind: (due: T["Due"]) => string;
  readonly commandKind: (command: T["Command"]) => string;
  readonly stalled: (
    state: T["State"],
    due: T["Due"],
    at: number
  ) => Option.Option<T["Command"]>;
  readonly serverCommand: (
    due: T["Due"],
    at: number,
    entropy: Uint8Array,
    signature: Option.Option<Uint8Array>
  ) => T["Command"];
  readonly decide: (
    state: T["State"],
    command: T["Command"]
  ) => Result.Result<readonly T["Event"][], T["Rejection"]>;
  readonly evolve: (state: T["State"], event: T["Event"]) => T["State"];
  readonly replay: (events: Iterable<T["Event"]>) => T["State"];
  readonly nextDeadline: (
    state: T["State"]
  ) => Option.Option<Deadline<T["Due"]>>;
  readonly audienceOf: (state: T["State"], player: PlayerId) => T["Audience"];
  readonly redact: (
    event: T["Event"],
    audience: T["Audience"]
  ) => Option.Option<T["Redacted"]>;
  readonly viewFor: (
    state: T["State"],
    audience: T["Audience"],
    at: number
  ) => T["View"];
  readonly haltedView: (
    state: T["State"],
    audience: T["Audience"],
    at: number
  ) => T["View"];
  readonly revoked: (state: T["State"], player: PlayerId) => boolean;
  readonly revokedView: (
    state: T["State"],
    player: PlayerId,
    at: number,
    halted: boolean
  ) => T["Revoked"];
  readonly invariants: (state: T["State"]) => readonly string[];
  readonly signalAllowed: (
    state: T["State"],
    sender: PlayerId,
    signal: T["Signal"]
  ) => boolean;
}
