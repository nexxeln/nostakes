import { placementOf, poseOf } from "../../features/moments/clip-plan.js";
import type {
  Layer,
  Motion,
  Placement,
} from "../../features/moments/clip-plan.js";

export const placementsAt = (
  layers: readonly Layer[],
  motion: Motion,
  ms: number
): readonly Placement[] =>
  layers.map((layer) => placementOf(layer, poseOf(layer, ms, motion)));

export const drawFrame = (
  ctx: OffscreenCanvasRenderingContext2D,
  bands: readonly ImageBitmap[],
  layers: readonly Layer[],
  placements: readonly Placement[]
) => {
  for (const [index, layer] of layers.entries()) {
    const placed = placements[index];
    const source = bands[layer.band];

    if (placed === undefined) {
      continue;
    }

    if (placed.alpha > 0 && source !== undefined) {
      ctx.globalAlpha = placed.alpha;
      ctx.setTransform(...placed.matrix);
      ctx.drawImage(
        source,
        layer.source.x,
        layer.source.y,
        layer.cell.width,
        layer.cell.height,
        placed.at.x,
        placed.at.y,
        layer.cell.width,
        layer.cell.height
      );
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
};
