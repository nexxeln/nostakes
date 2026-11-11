import type { Theme } from "../model.js";
import { pictureSvg } from "../moments/picture.js";
import { FELT_INSET, FRAME_SIZES } from "../pictures/paper.js";
import { settleUpSvg } from "../pictures/settle-up.js";
import type { LandingPicture } from "./elements.js";
import { emptyInks, inkRules, themed } from "./inks.js";
import { BAD_BEAT, SETTLE_UP } from "./night.js";

const look = (theme: Theme) =>
  ({ deck: "TwoColour", fonts: "", frame: "Table", theme }) as const;

const OPENING = /^<svg [^>]*>/u;

const MARGIN = FELT_INSET - 6;

const { height: HEIGHT, width: WIDTH } = FRAME_SIZES.Table;

export const PICTURE_BOX = {
  height: HEIGHT - MARGIN * 2,
  width: WIDTH - MARGIN * 2,
};

const framed = (svg: string, styles: string) =>
  svg.replace(
    OPENING,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARGIN} ${MARGIN} ${PICTURE_BOX.width} ${PICTURE_BOX.height}" aria-hidden="true"><style>${styles}</style>`
  );

export const landingPictures = (): Readonly<Record<LandingPicture, string>> => {
  const inks = emptyInks();

  const moment = themed(
    inks,
    pictureSvg(BAD_BEAT, look("Light")),
    pictureSvg(BAD_BEAT, look("Dark"))
  );

  const settleUp = themed(
    inks,
    settleUpSvg(SETTLE_UP, look("Light")),
    settleUpSvg(SETTLE_UP, look("Dark"))
  );

  const styles = inkRules(inks);

  return {
    Moment: framed(moment, styles),
    SettleUp: framed(settleUp, styles),
  };
};
