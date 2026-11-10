import { CLOSE_CODES, closingFrame } from "@nostakes/protocol";
import type { CloseReason } from "@nostakes/protocol";
import { Result } from "effect";

export interface ClosableSocket {
  readonly send: (frame: string) => void;
  readonly close: (code: number, reason: string) => void;
}

const NORMAL_CLOSURE = 1000;

export const closeWith = (socket: ClosableSocket, reason: CloseReason) => {
  Result.try(() => {
    socket.send(closingFrame(reason));
  });
  Result.try(() => {
    socket.close(CLOSE_CODES[reason], reason);
  });
};

export const acknowledgeClose = (socket: ClosableSocket) => {
  Result.try(() => {
    socket.close(NORMAL_CLOSURE, "closed");
  });
};
