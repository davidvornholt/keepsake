import { clamp } from '../../../shared/boxes.ts';
import type { Box } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import {
  distanceFrom,
  fading,
  frameAround,
  isIn,
  maskIn,
  type Room,
  roomOf,
  shiftable,
  withRoom,
} from '../pixels/frames.ts';
import {
  brightest,
  brightnessOf,
  channels,
  indexOf,
  lightOf,
  mapPlanes,
  type Plane,
  type Planes,
  readerAt,
  valuesIn,
} from '../pixels/raster.ts';
import { averaging, multiplied } from '../pixels/smooth.ts';
import { inLightOf, type Tone, toneOf } from '../pixels/tones.ts';
import { type Shift, shiftOf } from '../placement/shift.ts';

/** How far around a box the photo's pixels are kept. */
const spare: Room = { pixels: 4, height: 0.12 };
/** How far around that the surroundings are looked at. */
const surroundings: Room = { pixels: 24, height: 0.8 };
/** Fewer surroundings than this say nothing about the light. */
const fewest = { pixels: 400, share: 0.2 };
/** What the others count, which the edit may have redrawn as well. */
const doubtful = 0.15;

/** What the light leaves over is measured in a view of this size. */
const smallSide = 64;
/** How far it is looked for, in pixels of that view, twice as far each time. */
const reach = { nearest: 2, furthest: 32 };
/** The share of known pixels from which a neighbourhood is known. */
const known = 0.05;
/** The most that is added to or taken from the light. */
const mostAdded = 0.15;

/** Below this, light is mostly noise. */
const darkest = 1e-3;
/** A photo this much darker than its edit shows little but noise. */
const mostGain = 3.2;
/** An edit this different around a box shows something else there. */
const mostDifference = 0.2;
/** How much detail around a box doesn't count, in parts of the room. */
const ringCalm = 3;

const half = 0.5;

const sum = (plane: Plane): number =>
  plane.reduce((total, value) => total + value, 0);

const ones = ({ width, height }: Size): Plane =>
  new Float32Array(width * height).fill(1);

/** The pixels that tell how an edit changed the light. */
const countedOf = (free: Plane, size: Size): Plane => {
  const count = sum(free);
  return count < fewest.pixels || count < fewest.share * free.length
    ? ones(size)
    : free;
};

/** Averages of blocks of pixels, with how much each block counts. */
const inBlocks = (plane: Plane, weights: Plane, size: Size, small: Size) => {
  const sums = new Float32Array(small.width * small.height);
  const counts = new Float32Array(sums.length);
  for (const [index, weight] of weights.entries()) {
    const column = index % size.width;
    const row = Math.floor(index / size.width);
    const block =
      Math.floor((row * small.height) / size.height) * small.width +
      Math.floor((column * small.width) / size.width);
    counts[block] = (counts[block] ?? 0) + weight;
    sums[block] = (sums[block] ?? 0) + weight * (plane[index] ?? 0);
  }
  const averages = sums.map((total, block) => {
    const count = counts[block] ?? 0;
    return count > 0 ? total / count : 0;
  });
  return { averages, counts };
};

/** Gives every block a value, from its closest neighbours that have one. */
const filledOut = (averages: Plane, counts: Plane, size: Size): Plane => {
  const isKnown = counts.map((count) => (count > 0 ? 1 : 0));
  let result: Plane = new Float32Array(averages.length);
  let done: Plane = new Float32Array(averages.length);
  for (let far = reach.nearest; far <= reach.furthest; far *= 2) {
    const average = averaging(counts, size, far)(averages);
    const near = averaging(ones(size), size, far)(isKnown);
    const before = done;
    result = result.map((value, index) =>
      (before[index] ?? 0) > 0 ? value : (average[index] ?? 0),
    );
    done = before.map((value, index) =>
      value > 0 || (near[index] ?? 0) > known ? 1 : 0,
    );
  }
  return averaging(ones(size), size, reach.nearest)(result);
};

/** Adds what is still missing to look like the edit, from around the box. */
const withLeftOver = (
  values: Planes,
  after: Planes,
  weights: Plane,
  size: Size,
): Planes => {
  const scale = Math.max(1, Math.max(size.width, size.height) / smallSide);
  const small = {
    width: Math.max(1, Math.round(size.width / scale)),
    height: Math.max(1, Math.round(size.height / scale)),
  };
  return mapPlanes(values, (plane, channel) => {
    const missing = plane.map(
      (value, index) => (after[channel][index] ?? 0) - value,
    );
    const { averages, counts } = inBlocks(missing, weights, size, small);
    const added = filledOut(averages, counts, small);
    return plane.map((value, index) => {
      const position = {
        x: index % size.width,
        y: Math.floor(index / size.width),
      };
      const more = readerAt(size, small, position)(added);
      return clamp(value + clamp(more, -mostAdded, mostAdded), 0, 1);
    });
  });
};

/** How many times brighter an edit made the pixels of a mask. */
const gainOn = (
  mask: Plane,
  before: Planes,
  tones: ReadonlyArray<Tone>,
): number => {
  const light = (value: number) => Math.max(lightOf(value), darkest);
  const gains = brightnessOf(before).map((value) =>
    Math.log(light(toneOf(tones, value)) / light(value)),
  );
  return Math.exp(sum(multiplied(gains, mask)) / Math.max(sum(mask), 1));
};

/** How different two pictures are on a mask, apart from detail. */
const differenceOn = (
  mask: Plane,
  left: Planes,
  right: Planes,
  { size, radius }: { readonly size: Size; readonly radius: number },
): number => {
  const average = averaging(mask, size, radius);
  const squares = channels.map((channel) => {
    const differences = average(
      left[channel].map((value, index) => value - (right[channel][index] ?? 0)),
    );
    return sum(multiplied(multiplied(differences, differences), mask));
  });
  const total = squares.reduce((all, square) => all + square, 0);
  return Math.sqrt(total / Math.max(sum(mask) * channels.length, 1));
};

type Place = {
  /** The part of the photo that is looked at, and where the edit has it. */
  readonly frame: Frame;
  readonly shift: Shift;
  /** What is put back. */
  readonly exact: Frame;
  readonly room: number;
};

/** Where an edit shows a box, or null when it shows nothing of it. */
const placeOf = (original: Raster, edit: Raster, box: Box): Place | null => {
  const exact = frameAround(box, original);
  const wide = withRoom(exact, roomOf(surroundings, exact), original);
  const shift = shiftOf(original, edit, wide);
  const frame = shiftable(wide, shift, original);
  return frame.width === 0 || frame.height === 0
    ? null
    : { frame, shift, exact, room: roomOf(spare, exact) };
};

/** Writes a part of a picture into an edit, with a soft edge. */
const blend = (
  kept: Planes,
  edit: Raster,
  { frame, shift, exact, room }: Place,
): void => {
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const column = frame.left + x;
      const row = frame.top + y;
      const part = fading(distanceFrom(exact, column, row), room * half, room);
      if (part > 0) {
        const target = indexOf(edit, column + shift.x, row + shift.y);
        for (const channel of channels) {
          const value = kept[channel][y * frame.width + x] ?? 0;
          edit.pixels[target + channel] = Math.round(
            part * value * brightest +
              (1 - part) * (edit.pixels[target + channel] ?? 0),
          );
        }
      }
    }
  }
};

/** Whether an edit shows about the same as what would be put into it. */
const fits = (
  kept: Planes,
  after: Planes,
  { frame, exact, room }: Place,
): boolean => {
  const ring = maskIn(frame, (x, y) => {
    const distance = distanceFrom(exact, x, y);
    return distance > 0 && distance < room;
  });
  const radius = Math.max(2, Math.round(room / ringCalm));
  return (
    differenceOn(ring, after, kept, { size: frame, radius }) <= mostDifference
  );
};

/**
 * Puts what is in a box of the original photo into an edit of it, such as
 * somebody in the background, in the light the edit gave it. Nothing is put
 * back where the photo is almost black or the edit shows something else.
 * `boxes` are all that may be put back. Changes `edit`, and says whether it did.
 */
export const keepPatch = (
  original: Raster,
  edit: Raster,
  box: Box,
  boxes: ReadonlyArray<Box>,
): boolean => {
  const place = placeOf(original, edit, box);
  if (place === null) {
    return false;
  }
  const { frame, shift, exact, room } = place;
  const before = valuesIn(original, frame);
  const after = valuesIn(edit, {
    ...frame,
    left: frame.left + shift.x,
    top: frame.top + shift.y,
  });
  const others = boxes.map((other) =>
    withRoom(frameAround(other, original), room, original),
  );
  const free = maskIn(frame, (x, y) =>
    others.every((other) => !isIn(other, x, y)),
  );
  const { tones, values } = inLightOf(
    before,
    after,
    countedOf(free, frame),
    frame,
  );
  const near = withRoom(exact, room, original);
  const weights = maskIn(frame, (x, y) => !isIn(near, x, y)).map(
    (weight, index) => weight * Math.max(free[index] ?? 0, doubtful),
  );
  const kept = withLeftOver(values, after, weights, frame);
  const inside = maskIn(frame, (x, y) => isIn(exact, x, y));
  const isRight =
    gainOn(inside, before, tones) <= mostGain && fits(kept, after, place);
  if (isRight) {
    blend(kept, edit, place);
  }
  return isRight;
};
