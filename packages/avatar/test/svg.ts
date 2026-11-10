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
