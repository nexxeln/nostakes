export const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));

export interface SpringLook {
  readonly frequency: number;
  readonly damping: number;
}

export const BOUNCY: SpringLook = { damping: 0.42, frequency: 2.1 };

export const SOFT: SpringLook = { damping: 0.7, frequency: 1.6 };

export const POP: SpringLook = { damping: 0.38, frequency: 3 };

export const sprung = (seconds: number, look: SpringLook = BOUNCY) => {
  if (seconds <= 0) {
    return 0;
  }

  const omega = 2 * Math.PI * look.frequency;
  const zeta = look.damping;
  const damped = omega * Math.sqrt(1 - zeta * zeta);

  return (
    1 -
    Math.exp(-zeta * omega * seconds) *
      (Math.cos(damped * seconds) +
        ((zeta * omega) / damped) * Math.sin(damped * seconds))
  );
};

export const eased = (along: number) => {
  const t = clamp(along);

  return t * t * (3 - 2 * t);
};

export const easedOut = (along: number) => 1 - (1 - clamp(along)) ** 3;

export const mixed = (from: number, to: number, along: number) =>
  from + (to - from) * along;

export const hashed = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;

  return value - Math.floor(value);
};
