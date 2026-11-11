import { Option, Result, Schema } from "effect";

import { pokerRoom } from "../../src/poker-room.js";
import type { PokerTypes } from "../../src/poker-room.js";
import { roomCodec } from "../../src/room-codec.js";
import type { ServerMessage } from "../../src/room-codec.js";

export type HeldMessage = ServerMessage<PokerTypes>;

export const KEPT_DECODED = 32;

const { server } = roomCodec(pokerRoom);

const decodeHeld = Schema.decodeUnknownResult(Schema.fromJsonString(server));

const seqOf = (decoded: HeldMessage): Option.Option<number> => {
  if (server.guards.Welcome(decoded)) {
    return Option.some(decoded.seq);
  }

  return server.guards.Events(decoded)
    ? Option.some(decoded.to)
    : Option.none();
};

export interface DecodedWindow {
  readonly hold: (arrival: HeldArrival) => boolean;
  readonly releaseAll: () => void;
  readonly holding: () => number;
}

export const decodedWindow = (size: number = KEPT_DECODED): DecodedWindow => {
  const held: HeldArrival[] = [];
  const state = { open: true };

  return {
    hold: (arrival) => {
      if (!state.open) {
        return false;
      }

      held.push(arrival);

      if (held.length > size) {
        held.shift()?.release();
      }

      return true;
    },
    holding: () => held.length,
    releaseAll: () => {
      state.open = false;

      for (const arrival of held.splice(0)) {
        arrival.release();
      }
    },
  };
};

export class HeldArrival {
  readonly text: string;

  readonly at: number;

  readonly kind: HeldMessage["_tag"];

  readonly seq: Option.Option<number>;

  readonly #window: DecodedWindow;

  #decoded: Option.Option<HeldMessage>;

  constructor(
    text: string,
    at: number,
    decoded: HeldMessage,
    window: DecodedWindow
  ) {
    this.text = text;
    this.at = at;
    this.kind = decoded._tag;
    this.seq = seqOf(decoded);
    this.#window = window;
    this.#decoded = window.hold(this) ? Option.some(decoded) : Option.none();
  }

  get message(): HeldMessage {
    return Option.getOrElse(this.#decoded, () => {
      const decoded = Result.getOrThrow(decodeHeld(this.text));

      if (this.#window.hold(this)) {
        this.#decoded = Option.some(decoded);
      }

      return decoded;
    });
  }

  get decoded(): boolean {
    return Option.isSome(this.#decoded);
  }

  release() {
    this.#decoded = Option.none();
  }
}
