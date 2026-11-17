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

export const reelLine = (state: string, made: number) => {
  if (state === "Ready") {
    return "The night's best moments and the settle-up, cut to music.";
  }

  if (state === "Making") {
    return `Making the reel, ${Math.floor(made * 100)}%`;
  }

  if (state === "Queued") {
    return "The reel is made once the clips are done.";
  }

  return state === "Failed"
    ? "This device could not make the reel."
    : "This device cannot make the reel.";
};
