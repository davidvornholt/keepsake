import { clamp } from '../motion/spring.ts';

// The size of the frames as a place on a slider. Each step of the slider
// makes the frames larger by the same share, as each notch of a lens does.

type Limits = { readonly least: number; readonly most: number };

/** Where a height of the frames is between the smallest and the largest, from 0 to 1. */
export const shareOfFrame = (frame: number, { least, most }: Limits): number =>
  most <= least || frame <= 0
    ? 0
    : clamp(Math.log(frame / least) / Math.log(most / least), 0, 1);

/** The height of the frames at a place on the slider. */
export const frameOfShare = (share: number, { least, most }: Limits): number =>
  most <= least ? least : least * (most / least) ** clamp(share, 0, 1);

/** How much one press of plus or minus changes the height of the frames. */
export const zoomStep = 1.6;

/** How finely the slider for the size of the frames is divided. */
export const zoomSteps = 1000;
