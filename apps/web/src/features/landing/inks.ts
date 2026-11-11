const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gu;

const PAIR_BREAK = "|";

export interface Inks {
  readonly names: Map<string, string>;
}

export const emptyInks = (): Inks => ({ names: new Map() });

export const themed = (inks: Inks, light: string, dark: string): string => {
  const lights = light.match(COLOUR) ?? [];
  const darks = dark.match(COLOUR) ?? [];

  if (
    lights.length !== darks.length ||
    light.replaceAll(COLOUR, "") !== dark.replaceAll(COLOUR, "")
  ) {
    return light;
  }

  const queue = [...darks];

  return light.replaceAll(COLOUR, (found) => {
    const other = queue.shift() ?? found;

    if (other === found) {
      return found;
    }

    const pair = `${found}${PAIR_BREAK}${other}`;
    const name = inks.names.get(pair) ?? `--landing-ink-${inks.names.size}`;

    inks.names.set(pair, name);

    return `var(${name})`;
  });
};

export const inkRules = (inks: Inks) => {
  const pairs = [...inks.names.entries()].map(
    ([pair, name]) => [name, ...pair.split(PAIR_BREAK)] as const
  );

  const light = pairs.map(([name, value]) => `${name}:${value}`).join(";");

  const dark = pairs
    .map(([name, , value]) => `${name}:${value ?? ""}`)
    .join(";");

  return [
    `:root{${light}}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`,
    `:root[data-theme="dark"]{${dark}}`,
  ].join("");
};
