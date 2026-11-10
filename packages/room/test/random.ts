const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

export const seededRandom = (seed: number) => {
  let state = (Math.abs(Math.trunc(seed)) % (MODULUS - 1)) + 1;

  const next = () => {
    state = (state * MULTIPLIER) % MODULUS;

    return state;
  };

  return {
    below: (bound: number) => next() % bound,
    chance: (numerator: number, denominator: number) =>
      next() % denominator < numerator,
  };
};

export type SeededRandom = ReturnType<typeof seededRandom>;
