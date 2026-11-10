import { beaconWaitLimitMs, QUICKNET } from "@nostakes/shuffle";

import { FairMarks } from "./model.js";
import type { FairHand, FairMark } from "./model.js";

const WAIT_SECONDS = beaconWaitLimitMs(QUICKNET) / 1000;

const LIMIT =
  "It proves the deck was not rigged or changed after the seal. It does not hide cards from whoever runs the server.";

const timingText = (round: number, timing: string) => {
  if (timing === "InTime") {
    return `This device saw the seal arrive before drand published round ${round}, the public random number that ordered the deck.`;
  }

  return timing === "TooCloseToCall"
    ? `This device saw the seal arrive within a moment of drand's round ${round}, the public random number that ordered the deck, too close to call by this device's clock.`
    : `The deck was ordered by drand's public round ${round}. This device was not watching when the seal arrived, because it joined, reconnected, or was in the background, so it cannot say on its own that the seal came first.`;
};

export const fairParagraph = ({ hand, mark }: FairHand): string =>
  FairMarks.match(mark, {
    Cancelled: ({ round }) =>
      `Hand ${hand} was sealed for drand's round ${round} and called off while this device was away, so this device cannot tell whether that was before the round. Players who were connected can.`,
    Checked: ({ cards, round, timing }) =>
      `Hand ${hand} checks out. Before the deal, the server sealed the deck. ${timingText(round, timing)} All ${cards} cards this device was shown match the sealed deck in that order. ${LIMIT}`,
    Failed: ({ reason }) =>
      `Hand ${hand} failed the check. ${reason} Copy the proof and share it with the table.`,
    NotChecked: ({ reachedLater, round }) =>
      `Hand ${hand} was not checked. The server said it could not reach drand's round ${round} in the ${WAIT_SECONDS} seconds it waits, so it shuffled the deck itself. ${
        reachedLater
          ? "This device reached that round afterwards, which shows the round exists now, not whether the server could reach it then."
          : "This device could not reach that round either."
      }`,
  });

export interface SealedDealsTonight {
  readonly fromBeacon: number;
  readonly withoutBeacon: number;
}

export const tonightLine = ({
  fromBeacon,
  withoutBeacon,
}: SealedDealsTonight): string => {
  const sealed = fromBeacon + withoutBeacon;
  const hands = sealed === 1 ? "sealed hand" : "sealed hands";

  return `Dealt without drand tonight: ${
    withoutBeacon === 0 ? "none" : withoutBeacon
  } of ${sealed} ${hands}.`;
};

export const fairSymbol = (mark: FairMark): string =>
  FairMarks.match(mark, {
    Cancelled: () => "–",
    Checked: () => "✓",
    Failed: () => "!",
    NotChecked: () => "–",
  });

export const fairLabel = ({ hand, mark }: FairHand): string =>
  FairMarks.match(mark, {
    Cancelled: () => `Hand ${hand}: sealed and called off`,
    Checked: () => `Hand ${hand}: deck checked`,
    Failed: () => `Hand ${hand}: deck check failed`,
    NotChecked: () => `Hand ${hand}: deck not checked`,
  });
