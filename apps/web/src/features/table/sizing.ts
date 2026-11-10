export interface RaiseSpot {
  readonly min: number;
  readonly max: number;
  readonly isBet: boolean;
  readonly bigBlind: number;
  readonly potTotal: number;
  readonly callTo: number;
  readonly toCall: number;
}

export interface Detent {
  readonly label: string;
  readonly value: number;
}

const STEPS_PER_DOUBLING = 40;

const stepAt = (value: number, bigBlind: number) => {
  const unit = Math.max(1, bigBlind);
  let multiple = 1;

  while (unit * multiple * STEPS_PER_DOUBLING < value) {
    multiple *= 2;
  }

  return unit * multiple;
};

export const halfRoundedDown = (amount: number) => {
  const doublings: { readonly chips: number; readonly half: number }[] = [];

  for (
    let step = { chips: 2, half: 1 };
    step.chips <= amount;
    step = { chips: step.chips + step.chips, half: step.half + step.half }
  ) {
    doublings.push(step);
  }

  let left = amount;
  let half = 0;

  for (const step of doublings.toReversed()) {
    if (left >= step.chips) {
      left -= step.chips;
      half += step.half;
    }
  }

  return half;
};

const halfPotRoundedDown = (spot: RaiseSpot) =>
  spot.callTo + halfRoundedDown(spot.potTotal + spot.toCall);

export const raiseDetents = (spot: RaiseSpot): readonly Detent[] =>
  [
    { label: spot.isBet ? "Min" : "Min raise", value: spot.min },
    { label: "½ pot", value: halfPotRoundedDown(spot) },
    { label: "Pot", value: spot.callTo + spot.potTotal + spot.toCall },
    { label: "All in", value: spot.max },
  ].filter(
    ({ value }, index, all) =>
      value >= spot.min &&
      value <= spot.max &&
      all.findIndex((other) => other.value === value) === index
  );

export const raiseLadder = (spot: RaiseSpot): readonly number[] => {
  const amounts = new Set(raiseDetents(spot).map(({ value }) => value));
  let value = spot.min;

  while (value < spot.max) {
    amounts.add(value);
    value += stepAt(value, spot.bigBlind);
  }

  amounts.add(spot.max);

  return [...amounts].toSorted((left, right) => left - right);
};
