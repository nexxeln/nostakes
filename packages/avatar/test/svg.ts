const TAG = /<(?<closing>\/?)(?<name>[a-z]+)[^>]*?(?<selfClosing>\/?)>/gu;

export const unclosedTags = (svg: string) => {
  const open: string[] = [];

  for (const match of svg.matchAll(TAG)) {
    const name = match.groups?.name ?? "";

    if (match.groups?.selfClosing === "/") {
      continue;
    }

    if (match.groups?.closing !== "/") {
      open.push(name);
    } else if (open.at(-1) === name) {
      open.pop();
    } else {
      open.push(`/${name}`);
    }
  }

  return open;
};

const OPEN_TAG = /<[a-z][^>]*>/gu;

const ATTRIBUTE = /\s(?<name>[a-z-]+)=/gu;

export const repeatedAttributes = (svg: string) =>
  [...svg.matchAll(OPEN_TAG)].flatMap((tag) => {
    const names = [...tag[0].matchAll(ATTRIBUTE)].map(
      (match) => match.groups?.name ?? ""
    );

    return names.filter((name, index) => names.indexOf(name) !== index);
  });
