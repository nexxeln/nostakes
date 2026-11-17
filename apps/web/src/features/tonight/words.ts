const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const tonightSummary = (clips: readonly string[]) => {
  if (clips.length === 0) {
    return "Nothing yet.";
  }

  const ready = clips.filter((clip) => clip === "Ready").length;

  const making = clips.filter(
    (clip) => clip === "Making" || clip === "Queued"
  ).length;

  return [
    counted(clips.length, "moment", "moments"),
    ...(ready > 0 ? [`${counted(ready, "clip", "clips")} ready`] : []),
    ...(making > 0 ? [`${making} being made`] : []),
  ].join(" · ");
};

export const tonightCountText = (ready: number, making: number) => {
  if (ready > 0) {
    return `${ready} ready`;
  }

  return making > 0 ? "Making a clip" : "Moments and clips";
};
