import { isolated } from "./names.js";
import { nameOf, settlementText, signedNet } from "./room.js";
import type { ClosedView } from "./room.js";

export const HALTED_LINE =
  "The table stopped because of a fault. These are the standings from the last hand that was recorded properly.";

export interface HaltedRow {
  readonly player: ClosedView["settlement"]["balances"][number]["player"];
  readonly name: string;
  readonly detail: string;
  readonly net: number;
}

export const haltedRows = (view: ClosedView): readonly HaltedRow[] =>
  view.settlement.balances
    .toSorted((left, right) => right.net - left.net)
    .map(({ boughtIn, cashedOut, net, player }) => ({
      detail: `in ${boughtIn}, left with ${cashedOut}`,
      name: nameOf(view, player),
      net,
      player,
    }));

export const haltedText = (view: ClosedView) =>
  [
    HALTED_LINE,
    ...haltedRows(view).map(
      ({ detail, name, net }) =>
        `${signedNet(net)} ${isolated(name)} (${detail})`
    ),
    "",
    settlementText(view),
  ].join("\n");

export { signedNet as netText } from "./room.js";
