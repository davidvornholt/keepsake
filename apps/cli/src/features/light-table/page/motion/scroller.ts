import { clamp, quick, type Stiffness, springAt, step } from './spring.ts';

// How far the table is scrolled. It follows the wheel and the finger at
// once, glides on when it is let go, and springs back from beyond its ends.

export type Scroller = {
  value: number;
  velocity: number;
  /** Where it is heading on its own, or null while it glides or rests. */
  target: number | null;
};

export const scrollerAt = (value: number): Scroller => ({
  value,
  velocity: 0,
  target: null,
});

/** How long a glide takes to lose half its speed, in seconds. */
export const glideHalfLife = 0.22;
const restSpeed = 4;
const half = 0.5;

/** Moves it on by some seconds. Says whether it is still moving. */
export const advance = (
  scroller: Scroller,
  { least, most }: { readonly least: number; readonly most: number },
  seconds: number,
  stiffness: Stiffness = quick,
): boolean => {
  const isBeyond = scroller.value < least || scroller.value > most;
  if (scroller.target === null && isBeyond) {
    scroller.target = clamp(scroller.value, least, most);
  }
  if (scroller.target !== null) {
    const spring = springAt(scroller.value);
    spring.velocity = scroller.velocity;
    spring.target = clamp(scroller.target, least, most);
    const isMoving = step(spring, stiffness, seconds);
    scroller.value = spring.value;
    scroller.velocity = spring.velocity;
    if (!isMoving) {
      scroller.target = null;
    }
    return isMoving;
  }
  if (Math.abs(scroller.velocity) < restSpeed) {
    scroller.velocity = 0;
    return false;
  }
  scroller.value += scroller.velocity * seconds;
  scroller.velocity *= half ** (seconds / glideHalfLife);
  return true;
};

/** Stops it where it is, as a finger does that lands on it. */
export const hold = (scroller: Scroller): void => {
  scroller.velocity = 0;
  scroller.target = null;
};

/** How fast the finger went at the end, from where it was and when. */
export type Trail = Array<{ readonly at: number; readonly value: number }>;

/** Only the last moments of a movement say how fast it was let go. */
const trailLength = 100;

export const follow = (trail: Trail, at: number, value: number): void => {
  trail.push({ at, value });
  while (trail.length > 2 && at - (trail[0]?.at ?? at) > trailLength) {
    trail.shift();
  }
};

const millisecond = 1000;
/** A finger that rested before it was lifted lets go without speed. */
const restBefore = 80;

/** The speed at the end of a trail, in units per second. */
export const speedOf = (trail: Trail, now: number): number => {
  const [first] = trail;
  const last = trail.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    last.at === first.at ||
    now - last.at > restBefore
  ) {
    return 0;
  }
  return ((last.value - first.value) / (last.at - first.at)) * millisecond;
};
