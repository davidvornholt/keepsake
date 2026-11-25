// Springs that can be interrupted at any time: a new target keeps the speed.

export type Spring = {
  value: number;
  velocity: number;
  target: number;
};

export type Stiffness = {
  /** How hard it pulls towards the target. */
  readonly tension: number;
  /** How much it is slowed down. Critical damping is 2·√tension. */
  readonly friction: number;
};

/** A spring that comes to rest as fast as it can without swinging past. */
export const critical = (tension: number): Stiffness => ({
  tension,
  friction: 2 * Math.sqrt(tension),
});

const quickTension = 520;
const calmTension = 230;
const softTension = 130;

/** For things under the finger and for turning over photos. */
export const quick = critical(quickTension);
/** For photos that travel across the window. */
export const calm = critical(calmTension);
/** For the whole sheet settling into a new order. */
export const soft = critical(softTension);

export const springAt = (value: number): Spring => ({
  value,
  velocity: 0,
  target: value,
});

/** The longest step that is still stable, in seconds. */
const longestStep = 0.008;
const restDistance = 0.01;
const restSpeed = 0.05;

/** Moves a spring on by some seconds. Says whether it is still moving. */
export const step = (
  spring: Spring,
  { tension, friction }: Stiffness,
  seconds: number,
): boolean => {
  let left = seconds;
  while (left > 0) {
    const part = Math.min(left, longestStep);
    const force =
      tension * (spring.target - spring.value) - friction * spring.velocity;
    spring.velocity += force * part;
    spring.value += spring.velocity * part;
    left -= part;
  }
  const isResting =
    Math.abs(spring.target - spring.value) < restDistance &&
    Math.abs(spring.velocity) < restSpeed;
  if (isResting) {
    spring.value = spring.target;
    spring.velocity = 0;
  }
  return !isResting;
};

/** Puts a spring where it wants to be, at once. */
export const settle = (spring: Spring): void => {
  spring.value = spring.target;
  spring.velocity = 0;
};

/** How far something still glides when it is let go at this speed. */
export const glide = (velocity: number, halfLife: number): number =>
  (velocity * halfLife) / Math.LN2;

const bandStretch = 0.55;

/**
 * How far something follows the finger beyond its limit: ever less, and never
 * further than the room there is.
 */
export const rubberBand = (beyond: number, room: number): number => {
  const distance = Math.abs(beyond);
  return (
    Math.sign(beyond) *
    ((distance * room * bandStretch) / (room + bandStretch * distance))
  );
};

export const clamp = (value: number, least: number, most: number): number =>
  Math.min(Math.max(value, least), most);

export const mix = (from: number, to: number, share: number): number =>
  from + (to - from) * share;

/** The cubic that leaves 0 and comes to 1 without speed: 3s² − 2s³. */
const squares = 3;
const cubes = 2;

/** Eases in and out between 0 and 1. */
export const easeInOut = (share: number): number =>
  share * share * (squares - cubes * share);
