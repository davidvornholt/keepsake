// How much of a frame goes into filling the atlas with pictures. On a large
// screen drawing takes longer, and a full share on top would cost a frame
// now and then, so the share follows how the frames come.

/** The milliseconds a frame gives at most, and at least. */
export const mostBudget = 4;
const leastBudget = 0.75;
/** A frame that took longer than this, in seconds, came late. */
const late = 0.02;
const less = 0.5;
const more = 1.08;

/** The share for the next frame: half after a late one, then slowly more. */
export const budgetAfter = (budget: number, seconds: number): number =>
  seconds > late
    ? Math.max(leastBudget, budget * less)
    : Math.min(mostBudget, budget * more);
