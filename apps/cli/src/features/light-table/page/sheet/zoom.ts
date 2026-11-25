import { clamp } from '../motion/spring.ts';

// The size of the frames as a place on a slider, and the sizes they come to
// rest at. Each stop makes the frames larger by the same share, as each
// notch of a lens does.

export type Limits = { readonly least: number; readonly most: number };

/** Where a height of the frames is between the smallest and the largest, from 0 to 1. */
export const shareOfFrame = (frame: number, { least, most }: Limits): number =>
  most <= least || frame <= 0
    ? 0
    : clamp(Math.log(frame / least) / Math.log(most / least), 0, 1);

/** The height of the frames at a place on the slider. */
export const frameOfShare = (share: number, { least, most }: Limits): number =>
  most <= least ? least : least * (most / least) ** clamp(share, 0, 1);

/** By how much the frames grow from one stop to the next. */
export const stopRatio = 1.25;
/** A stop this close below the largest one would hardly differ from it. */
const closeTo = 1.1;

/**
 * The heights the frames come to rest at: the one with which everything is
 * on the table at once, the largest one, and those between.
 */
export const stopsOf = ({ least, most }: Limits): ReadonlyArray<number> => {
  const stops = [least];
  let next = least * stopRatio;
  while (next * closeTo < most) {
    stops.push(next);
    next *= stopRatio;
  }
  return most > least ? [...stops, most] : stops;
};

/** The stop nearest to a height of the frames. */
export const nearestStop = (
  stops: ReadonlyArray<number>,
  frame: number,
): number => {
  let nearest = 0;
  let least = Number.POSITIVE_INFINITY;
  for (const [at, stop] of stops.entries()) {
    const away = Math.abs(Math.log(frame / stop));
    if (away < least) {
      least = away;
      nearest = at;
    }
  }
  return nearest;
};

/** Where a height lies between two stops next to each other. */
export type Between = {
  readonly lower: number;
  readonly upper: number;
  /** From 0 at the lower stop to 1 at the upper one. */
  readonly share: number;
};

export const betweenStops = (
  stops: ReadonlyArray<number>,
  frame: number,
): Between => {
  const last = stops.length - 1;
  const above = stops.findIndex((stop) => stop > frame);
  const upper = above === -1 ? last : Math.max(1, above);
  const lower = Math.max(0, upper - 1);
  const from = stops[lower] ?? frame;
  const to = stops[Math.min(upper, last)] ?? frame;
  if (last < 1 || to <= from) {
    return { lower, upper: lower, share: 0 };
  }
  return {
    lower,
    upper,
    share: clamp(Math.log(frame / from) / Math.log(to / from), 0, 1),
  };
};

/** How many stops one press of plus or minus goes. */
export const stopsPerPress = 2;

/** How finely the slider for the size of the frames is divided. */
export const zoomSteps = 1000;
