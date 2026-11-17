const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const tonightSummary = (clips: readonly string[]) => {
  if (clips.length === 0) {
    return "No moments yet.";
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

  return making > 0 ? "Making a clip" : "The night's moments";
};

export const reelLine = (state: string, made: number) => {
  if (state === "Ready") {
    return "Your best moments and the settle-up, cut to music.";
  }

  if (state === "Making") {
    return `Making reel ${Math.floor(made * 100)}%`;
  }

  if (state === "Queued") {
    return "Starts when the clips are done.";
  }

  return state === "Failed"
    ? "The reel didn't work on this phone."
    : "This phone can't make the reel.";
};
