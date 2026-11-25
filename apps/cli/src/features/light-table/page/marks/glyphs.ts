// The marks a wax pencil makes, as the hand would draw them: a tick, a
// cross, a circle. Each is worked out from a few points and a number that
// stands for the hand's mood that time, so a mark looks the same whenever it
// is drawn again, and no two marks look alike.

export type Dot = {
  readonly x: number;
  readonly y: number;
  /** How wide the wax is here, as a share of the mark's size. */
  readonly width: number;
};

export type Stroke = ReadonlyArray<Dot>;

export type Glyph = {
  readonly strokes: ReadonlyArray<Stroke>;
  /** How long each stroke is, as a share of the whole mark. */
  readonly shares: ReadonlyArray<number>;
};

export const shapes = [
  'tick',
  'cross',
  'circle',
  'star',
  'slash',
  'swap',
  'no-star',
  'box',
  'underline',
] as const;
export type Shape = (typeof shapes)[number];

type Point = readonly [number, number];
type Path = {
  readonly points: ReadonlyArray<Point>;
  readonly isRound: boolean;
};

/**
 * The marks as the hand moves: points in hundredths of the mark's size, a
 * slash between two strokes, and a tilde before a stroke that is round.
 */
const drawings: Readonly<Record<Shape, string>> = {
  tick: '10,52 36,84 92,12',
  cross: '14,12 88,88 / 88,10 12,90',
  circle:
    '~22,22 41,13 63,14 82,23 94,39 95,58 86,75 67,87 44,90 22,84 7,69 1,49 7,29 23,14 47,7',
  star: '50,7 77,90 6,39 94,39 23,90 50,7',
  slash: '84,10 16,90',
  swap: '12,34 88,34 / 68,16 90,34 68,50 / 88,68 12,68 / 32,50 10,68 32,86',
  'no-star': '50,7 77,90 6,39 94,39 23,90 50,7 / 6,20 94,88',
  box: '2,6 99,1 97,98 1,95 3,0',
  underline: '0,40 50,62 100,38',
};

const hundredth = 0.01;

const pathOf = (text: string): Path => {
  const stroke = text.trim();
  const isRound = stroke.startsWith('~');
  return {
    isRound,
    points: (isRound ? stroke.slice(1) : stroke).split(' ').map((pair) => {
      const [x = '0', y = '0'] = pair.split(',');
      return [Number(x) * hundredth, Number(y) * hundredth];
    }),
  };
};

const pathsOf = (shape: Shape): ReadonlyArray<Path> =>
  drawings[shape].split('/').map(pathOf);

const fullTurn = Math.PI * 2;
const middle = 0.5;

/** The numbers of a well-known way to make numbers that look random. */
const randomFactor = 48_271;
const randomRange = 2_147_483_647;
const hashFactor = 31;

/** A number that stands for a text, such as the id of a photo. */
export const seedOf = (text: string): number => {
  let hash = 1;
  for (const letter of text) {
    hash = (hash * hashFactor + (letter.codePointAt(0) ?? 0)) % randomRange;
  }
  return hash;
};

/** Numbers from 0 to 1 that follow from a seed. */
const randomFrom = (seed: number) => {
  let state = (seed % (randomRange - 1)) + 1;
  return () => {
    state = (state * randomFactor) % randomRange;
    return state / randomRange;
  };
};

const dotsPerSpan = 9;

/** A point on the smooth curve through four points, between the middle two. */
const curveAt = (
  [before, from, to, after]: readonly [Point, Point, Point, Point],
  share: number,
): Point => {
  const at = (axis: 0 | 1) => {
    // The speed at each end follows from the points around it.
    const leaving = (to[axis] - before[axis]) / 2;
    const arriving = (after[axis] - from[axis]) / 2;
    const gap = to[axis] - from[axis];
    const square = share * share;
    return (
      from[axis] +
      leaving * share +
      (gap + gap + gap - leaving * 2 - arriving) * square +
      (leaving + arriving - gap * 2) * square * share
    );
  };
  return [at(0), at(1)];
};

/** Many points along a path: straight between corners, or curved. */
const along = ({ points, isRound }: Path): ReadonlyArray<Point> => {
  const dots: Array<Point> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] ?? [0, 0];
    const to = points[index + 1] ?? from;
    const before = points[index - 1] ?? from;
    const after = points[index + 2] ?? to;
    for (let part = 0; part < dotsPerSpan; part += 1) {
      const share = part / dotsPerSpan;
      dots.push(
        isRound
          ? curveAt([before, from, to, after], share)
          : [
              from[0] + (to[0] - from[0]) * share,
              from[1] + (to[1] - from[1]) * share,
            ],
      );
    }
  }
  const last = points.at(-1);
  return last === undefined ? dots : [...dots, last];
};

const lengthOf = (dots: ReadonlyArray<{ x: number; y: number }>): number => {
  let length = 0;
  for (let index = 1; index < dots.length; index += 1) {
    const from = dots[index - 1];
    const to = dots[index];
    if (from !== undefined && to !== undefined) {
      length += Math.hypot(to.x - from.x, to.y - from.y);
    }
  }
  return length;
};

/** How wide the wax is: the pencil lands, presses, and is flicked away. */
const baseWidth = 0.105;
const landing = 0.12;
const flick = 0.22;
const lightest = 0.5;

const pressureAt = (share: number): number => {
  if (share < landing) {
    return lightest + (1 - lightest) * (share / landing);
  }
  return share > 1 - flick
    ? lightest + (1 - lightest) * ((1 - share) / flick)
    : 1;
};

const wobble = 0.022;
const tilt = 0.09;
/** A box is drawn around something, so it leans less than a quick mark. */
const boxTilt = 0.03;
const widthChange = 0.2;
const flutter = 0.08;

/** The strokes of a mark as one hand drew it one time. */
export const glyphOf = (shape: Shape, seed: number): Glyph => {
  const random = randomFrom(seed);
  const between = (most: number) => (random() * 2 - 1) * most;
  const angle = between(shape === 'box' ? boxTilt : tilt);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const heavy = 1 + between(widthChange);
  const strokes = pathsOf(shape).map((path): Stroke => {
    const dots = along(path);
    // A slow wave along the stroke: the hand never draws a ruler's line.
    const waveX = random() * fullTurn;
    const waveY = random() * fullTurn;
    const bendX = between(wobble);
    const bendY = between(wobble);
    return dots.map(([x, y], index) => {
      const share = index / Math.max(1, dots.length - 1);
      const fromMiddleX =
        x + Math.sin(share * Math.PI + waveX) * bendX - middle;
      const fromMiddleY =
        y + Math.sin(share * Math.PI + waveY) * bendY - middle;
      return {
        x: middle + fromMiddleX * cos - fromMiddleY * sin,
        y: middle + fromMiddleX * sin + fromMiddleY * cos,
        width: baseWidth * heavy * pressureAt(share) * (1 + between(flutter)),
      };
    });
  });
  const lengths = strokes.map(lengthOf);
  const whole = lengths.reduce((sum, length) => sum + length, 0) || 1;
  return { strokes, shares: lengths.map((length) => length / whole) };
};

/** How much of a stroke is drawn slowly at its start; the rest speeds up. */
const slowShare = 0.6;

/**
 * How much of each stroke is drawn when this much of the whole mark is. The
 * hand starts each stroke slowly and ends it fast.
 */
export const drawnOf = (
  { shares }: Glyph,
  progress: number,
): ReadonlyArray<number> => {
  let before = 0;
  return shares.map((share) => {
    const part = Math.min(1, Math.max(0, (progress - before) / share));
    before += share;
    // Eases in and out, then leans towards the end of the stroke.
    const eased = (1 - Math.cos(part * Math.PI)) / 2;
    return eased * slowShare + part * part * (1 - slowShare);
  });
};
