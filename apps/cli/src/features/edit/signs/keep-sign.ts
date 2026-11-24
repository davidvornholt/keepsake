import { clamp } from '../../../shared/boxes.ts';
import type { Sign } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { keepPatch } from '../patches/keep-patch.ts';
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
import { lightChange, relit } from '../pixels/light.ts';
import {
  brightest,
  brightnessOf,
  channels,
  indexOf,
  lightAt,
  mapPlanes,
  type Plane,
  type Planes,
  readerAt,
  shrunkLight,
  srgbOf,
  valuesIn,
} from '../pixels/raster.ts';
import { averaging, multiplied } from '../pixels/smooth.ts';
import { shiftOf } from '../placement/shift.ts';

/** How far around a sign its pixels are kept, as a box is never exact. */
const spare: Room = { pixels: 8, height: 0.35 };
/** How far around that the surroundings are looked at, in heights. */
const surroundings: Room = { pixels: 48, height: 1 };
/** Light is measured in a small view in which a sign is this high. */
const signHeight = 3;
/** How far away, in that view, the surroundings still count. */
const nearby = 4;
/** What the sign itself counts where there is nothing around it. */
const doubtful = 0.03;
/** The most that is added to or taken from the surroundings. */
const mostAdded = 0.2;
/** How much brighter than its surroundings a sign that shines is. */
const ownLight = 0.25;

const half = 0.5;

/** Where the surroundings are brighter than this, a sign doesn't shine. */
const daylight = 0.25;

const isInDaylight = (
  original: Raster,
  exact: Frame,
  frame: Frame,
): boolean => {
  const around = maskIn(frame, (x, y) => !isIn(exact, x, y));
  const brightness = multiplied(
    brightnessOf(valuesIn(original, frame)),
    around,
  );
  const sum = (plane: Plane) => plane.reduce((all, value) => all + value, 0);
  return sum(brightness) > daylight * sum(around);
};

/** How much each pixel of a small view is the surroundings of a sign. */
const surroundingsOf = (exact: Frame, frame: Frame, size: Size): Plane =>
  Float32Array.from({ length: size.width * size.height }, (_, index) => {
    const x =
      frame.left + (((index % size.width) + half) * frame.width) / size.width;
    const y =
      frame.top +
      ((Math.floor(index / size.width) + half) * frame.height) / size.height;
    const isSign =
      x >= exact.left &&
      x < exact.left + exact.width &&
      y >= exact.top &&
      y < exact.top + exact.height;
    return isSign ? doubtful : 1;
  });

type Light = Record<'before' | 'after' | 'change', Planes>;

/**
 * What the surroundings are like after a change of light, and what is still
 * missing to look like the edit, as sRGB values from 0 to 1. Around a lamp,
 * and where a photo is almost black, no change of its light does all of it.
 */
const leftOver = (
  { before, after, change }: Light,
  weights: Plane,
  size: Size,
) => {
  const average = averaging(weights, size, nearby);
  const reached = mapPlanes(before, (plane, channel) =>
    plane.map((light, index) =>
      srgbOf(relit(light, change[channel][index] ?? 0)),
    ),
  );
  return {
    usual: mapPlanes(reached, average),
    missing: mapPlanes(after, (plane, channel) =>
      average(
        plane.map((light, index) =>
          clamp(
            srgbOf(light) - (reached[channel][index] ?? 0),
            -mostAdded,
            mostAdded,
          ),
        ),
      ),
    ),
  };
};

/** Puts back a sign that may shine, in the light of its surroundings. */
const keepShining = (
  original: Raster,
  edit: Raster,
  { exact, wide }: { readonly exact: Frame; readonly wide: Frame },
): void => {
  const shift = shiftOf(original, edit, wide);
  const frame = shiftable(wide, shift, original);
  if (frame.width === 0 || frame.height === 0) {
    return;
  }
  const scale = Math.max(1, exact.height / signHeight);
  const size = {
    width: Math.max(1, Math.round(frame.width / scale)),
    height: Math.max(1, Math.round(frame.height / scale)),
  };
  const before = shrunkLight(original, frame, size);
  const after = shrunkLight(
    edit,
    { ...frame, left: frame.left + shift.x, top: frame.top + shift.y },
    size,
  );
  const everywhere = new Float32Array(size.width * size.height).fill(1);
  const change = lightChange(before, after, everywhere, size);
  const { usual, missing } = leftOver(
    { before, after, change },
    surroundingsOf(exact, frame, size),
    size,
  );
  const room = roomOf(spare, exact);
  for (let y = 0; y < frame.height; y += 1) {
    const row = frame.top + y;
    for (let x = 0; x < frame.width; x += 1) {
      const column = frame.left + x;
      const distance = distanceFrom(exact, column, row);
      const kept = fading(distance, room * half, room * half);
      if (kept > 0) {
        const source = indexOf(original, column, row);
        const target = indexOf(edit, column + shift.x, row + shift.y);
        const read = readerAt(frame, size, { x, y });
        const values = channels.map((channel) =>
          srgbOf(
            relit(
              lightAt(original.pixels[source + channel] ?? 0),
              read(change[channel]),
            ),
          ),
        );
        // What is much brighter than the surroundings is the sign's own light.
        const brighter = Math.max(
          ...channels.map(
            (channel) => (values[channel] ?? 0) - read(usual[channel]),
          ),
        );
        const matched = clamp(1 - brighter / ownLight, 0, 1);
        for (const channel of channels) {
          const value = clamp(
            (values[channel] ?? 0) + matched * read(missing[channel]),
            0,
            1,
          );
          edit.pixels[target + channel] = Math.round(
            kept * value * brightest +
              (1 - kept) * (edit.pixels[target + channel] ?? 0),
          );
        }
      }
    }
  }
};

/**
 * Puts a sign from the original photo into an edit of it, where the edit has
 * moved it and in the light the edit gave it. Changes `edit`.
 */
export const keepSign = (
  original: Raster,
  edit: Raster,
  sign: Sign,
  signs: ReadonlyArray<Sign>,
): void => {
  const exact = frameAround(sign.box, original);
  const wide = withRoom(exact, roomOf(surroundings, exact), original);
  const boxes = signs.map(({ box }) => box);
  const isDone =
    isInDaylight(original, exact, wide) &&
    keepPatch(original, edit, sign.box, boxes);
  if (!isDone) {
    keepShining(original, edit, { exact, wide });
  }
};
