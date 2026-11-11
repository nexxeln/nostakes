import { Schema } from "effect";

type Declared = Readonly<Record<string, Schema.Top>>;

export type PropertyHost<Properties extends Declared> = {
  -readonly [Name in keyof Properties]: Properties[Name]["Type"] | null;
};

export const adoptEarlyProperties = <Properties extends Declared>(
  element: PropertyHost<Properties>,
  properties: Properties
) => {
  for (const [name, schema] of Object.entries(properties)) {
    const early = Object.getOwnPropertyDescriptor(element, name);

    if (early !== undefined) {
      Reflect.deleteProperty(element, name);

      if (Schema.is(schema)(early.value)) {
        Reflect.set(element, name, early.value);
      }
    }
  }
};
