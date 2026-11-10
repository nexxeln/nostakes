import { FairMarks } from "./model.js";
import type { FairHand, FairMark } from "./model.js";

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
    NotChecked: ({ round }) =>
      `Hand ${hand} was not checked. The server said drand's round ${round} was not available in time and shuffled the deck itself, and this device could not get that round from drand either, so the claim stands.`,
  });

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
