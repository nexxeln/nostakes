export const chipsText = (amount: number) =>
  Math.trunc(amount).toLocaleString("en-US");

export const boardLine = (board: number, line: string) =>
  `Board ${board}: ${line}`;
