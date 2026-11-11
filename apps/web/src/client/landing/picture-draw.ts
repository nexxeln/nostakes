import { BAD_BEAT, SETTLE_UP } from "../../features/landing/night.js";
import { pictureSvg } from "../../features/moments/picture.js";
import { FAMILIES } from "../../features/moments/score.js";
import {
  cardPose,
  partPose,
  planFor,
  REST,
  samplesOf,
  transformOf,
} from "../../features/moments/timeline.js";
import type { Pose } from "../../features/moments/timeline.js";
import { settleUpSvg } from "../../features/pictures/settle-up.js";
import { CARD_PART, DrawnPictureSchema } from "./picture-wire.js";
import type {
  MotionPlan,
  PictureReply,
  PictureRequest,
} from "./picture-wire.js";

const ENTRY_MS = 1400;

const SLIDE_MS = 900;

const PART_MARK = /data-part="(?<role>[a-z]+)" data-index="(?<index>\d+)"/gu;

const STILL = transformOf(REST);

const keyframesOf = (
  length: number,
  scale: number,
  pose: (ms: number) => Pose
): MotionPlan["keyframes"] =>
  samplesOf(length).map((ms) => {
    const at = pose(ms);

    return {
      offset: ms / Math.max(1, length),
      opacity: String(at.opacity),
      transform: transformOf({ ...at, dx: at.dx * scale, dy: at.dy * scale }),
    };
  });

const moving = (plan: MotionPlan) =>
  plan.keyframes.some(
    ({ opacity, transform }) => opacity !== "1" || transform !== STILL
  );

const momentMotions = (drawn: string, scale: number): MotionPlan[] => {
  const family = FAMILIES[BAD_BEAT.kind];
  const plan = planFor(family, BAD_BEAT.tier);

  const parts = [
    ...new Set(
      [...drawn.matchAll(PART_MARK)].map(
        ([, role, index]) => `${role}:${index}`
      )
    ),
  ];

  return [
    {
      keyframes: keyframesOf(ENTRY_MS, scale, (ms) =>
        cardPose(family, ms, plan)
      ),
      length: ENTRY_MS,
      part: CARD_PART,
    },
    ...parts.flatMap((part) => {
      const [role = "", index = "0"] = part.split(":");

      const motion = {
        keyframes: keyframesOf(ENTRY_MS, 1, (ms) =>
          partPose(role, Number(index), ms, family, BAD_BEAT.tier)
        ),
        length: ENTRY_MS,
        part,
      };

      return moving(motion) ? [motion] : [];
    }),
  ];
};

const SLIDE: MotionPlan["keyframes"] = [
  { offset: 0, opacity: "0", transform: "translate(0, 16%) rotate(4deg)" },
  { offset: 0.45, opacity: "1", transform: "translate(0, 7%) rotate(1.5deg)" },
  { offset: 1, opacity: "1", transform: "translate(0, 0) rotate(0deg)" },
];

export const drawPicture = ({
  picture,
  scale,
  theme,
}: PictureRequest): PictureReply => {
  const look = { deck: "TwoColour", fonts: "", frame: "Chat", theme } as const;

  if (picture === "Moment") {
    const drawn = pictureSvg(BAD_BEAT, look);

    return {
      drawn: DrawnPictureSchema.make(drawn),
      motions: momentMotions(drawn, scale),
    };
  }

  return {
    drawn: DrawnPictureSchema.make(settleUpSvg(SETTLE_UP, look)),
    motions: [{ keyframes: SLIDE, length: SLIDE_MS, part: CARD_PART }],
  };
};
