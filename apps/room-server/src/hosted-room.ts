import type { PlayerId, RoomCode } from "@nostakes/protocol";
import type { Option, Result, Schema } from "effect";

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
}

export interface RoomSchemas<T extends RoomTypes> {
  readonly memberCommand: Schema.Codec<T["MemberCommand"], unknown>;
  readonly event: Schema.Codec<T["Event"], unknown>;
  readonly redacted: Schema.Codec<T["Redacted"], unknown>;
  readonly view: Schema.Codec<T["View"], unknown>;
  readonly rejection: Schema.Codec<T["Rejection"], unknown>;
  readonly openRequest: Schema.Codec<T["OpenRequest"], unknown>;
  readonly joinRequest: Schema.Codec<T["JoinRequest"], unknown>;
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
  readonly serverCommand: (
    due: T["Due"],
    at: number,
    entropy: Uint8Array
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
  readonly invariants: (state: T["State"]) => readonly string[];
}
