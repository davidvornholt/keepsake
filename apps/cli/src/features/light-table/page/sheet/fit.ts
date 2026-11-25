import { type Group, layOut } from './layout.ts';

// How tall the frames are at most, at least, and when everything is to fit
// on the table at once.

/** The smallest frames anybody can still tell apart. */
export const smallestFrame = 14;
const largestShare = 0.6;
/** On a wide table two frames lie side by side at least; on a narrow one, one fills it. */
const wideFrom = 700;
const wideShare = 0.3;
const narrowShare = 0.6;
const searchSteps = 12;

/** The tallest a frame may get on a table of this size. */
export const largestFrame = (width: number, height: number): number =>
  Math.round(
    Math.max(
      smallestFrame * 2,
      Math.min(
        height * largestShare,
        width * (width >= wideFrom ? wideShare : narrowShare),
      ),
    ),
  );

/**
 * The height of frame with which everything fits on the table at once, or the
 * smallest one that is still of use when it doesn't.
 */
export const fittingFrame = (
  groups: ReadonlyArray<Group>,
  width: number,
  height: number,
): number => {
  let least = smallestFrame;
  let most = largestFrame(width, height);
  const tallest = most;
  const fits = (tried: number) =>
    layOut(groups, width, tried, { tallest }).height <= height;
  if (fits(most)) {
    return most;
  }
  for (let turn = 0; turn < searchSteps; turn += 1) {
    const middle = (least + most) / 2;
    if (fits(middle)) {
      least = middle;
    } else {
      most = middle;
    }
  }
  // Rows break elsewhere at each height, so a lower one can be too tall again.
  let frame = Math.floor(least);
  while (frame > smallestFrame && !fits(frame)) {
    frame -= 1;
  }
  return frame;
};
