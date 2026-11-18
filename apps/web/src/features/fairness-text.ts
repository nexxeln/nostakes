import { beaconWaitLimitMs, QUICKNET } from "@nostakes/shuffle";

import { FairMarks } from "./model.js";
import type { FairHand, FairMark } from "./model.js";

const WAIT_SECONDS = beaconWaitLimitMs(QUICKNET) / 1000;

export const FAIR_LIMIT =
  "This proves nobody rigged or changed the deck after it was sealed. It doesn't hide cards from whoever runs the server.";

const timingText = (round: number, timing: string) => {
  if (timing === "InTime") {
    return `drand round ${round}, a public random number, shuffled it. This device got the seal before that number came out.`;
  }

  return timing === "TooCloseToCall"
    ? `drand round ${round}, a public random number, shuffled it. The seal arrived about when that number came out, too close to call by this device's clock.`
    : `drand round ${round}, a public random number, shuffled it. This device wasn't watching when the seal arrived, because it joined, reconnected, or was in the background. So it can't say on its own that the seal came first.`;
};

export const fairParagraph = ({ hand, mark }: FairHand): string =>
  FairMarks.match(mark, {
    Cancelled: ({ round }) =>
      `Hand ${hand} was sealed for drand round ${round}, then called off while this device was away. This device can't tell if that happened before the round. Players who were connected can.`,
    Checked: ({ cards, round, timing }) =>
      `Hand ${hand} checks out. Before the deal, the server sealed the deck. ${timingText(round, timing)} All ${cards} cards this device was shown match the sealed deck in that order.`,
    Failed: ({ reason }) =>
      `Hand ${hand} failed the check. ${reason} Copy the proof and share it with the table.`,
    NotChecked: ({ reachedLater, round }) =>
      `Hand ${hand} wasn't checked. The server said it couldn't reach drand round ${round} in the ${WAIT_SECONDS} seconds it waits, so it shuffled the deck itself. ${
        reachedLater
          ? "This device reached that round later. That shows the round exists now, not that the server could reach it then."
          : "This device couldn't reach that round either."
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
