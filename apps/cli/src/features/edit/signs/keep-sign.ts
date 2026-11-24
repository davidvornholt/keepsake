import { clamp } from '../../../shared/boxes.ts';
import type { Sign } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { lightChange, relit } from '../pixels/light.ts';
import {
  brightest,
  channels,
  indexOf,
  lightAt,
  mapPlanes,
  type Plane,
  type Planes,
  readerAt,
  shrunkLight,
  srgbOf,
} from '../pixels/raster.ts';
import { averaging } from '../pixels/smooth.ts';
import { type Shift, shiftOf } from '../placement/shift.ts';

/** How far around a sign its pixels are kept, as a box is never exact. */
const spare = { pixels: 8, height: 0.35 };
/** How far around that the surroundings are looked at, in heights. */
const surroundings = { pixels: 48, height: 1 };
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
/** Makes a step from 0 to 1 that starts and ends slowly. */
const smoothness = 3;

type Room = { readonly pixels: number; readonly height: number };

const roomOf = ({ pixels, height }: Room, frame: Frame): number =>
  Math.round(pixels + height * frame.height);

/** A frame with room on each side, where the picture allows. */
const widened = (frame: Frame, room: number, picture: Size): Frame => {
  const left = clamp(frame.left - room, 0, picture.width - 1);
  const top = clamp(frame.top - room, 0, picture.height - 1);
  const right = clamp(frame.left + frame.width + room, left + 1, picture.width);
  const bottom = clamp(
    frame.top + frame.height + room,
    top + 1,
    picture.height,
  );
  return { left, top, width: right - left, height: bottom - top };
};

const frameOfSign = ({ box }: Sign, picture: Size): Frame => {
  const left = Math.floor(box.left * picture.width);
  const top = Math.floor(box.top * picture.height);
  return {
    left,
    top,
    width: Math.max(1, Math.ceil(box.right * picture.width) - left),
    height: Math.max(1, Math.ceil(box.bottom * picture.height) - top),
  };
};

/** The part of a frame whose place after a shift is in the picture too. */
const shiftable = (frame: Frame, shift: Shift, picture: Size): Frame => {
  const left = Math.max(frame.left, -shift.x);
  const top = Math.max(frame.top, -shift.y);
  const right = Math.min(frame.left + frame.width, picture.width - shift.x);
  const bottom = Math.min(frame.top + frame.height, picture.height - shift.y);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
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

/** 1 at a sign, less towards the end of the room around it. */
const softly = (distance: number, room: number): number => {
  const part = clamp(1 - distance / room, 0, 1);
  return part * part * (smoothness - 2 * part);
};

/**
 * Puts a sign from the original photo into an edit of it, where the edit has
 * moved it and in the light the edit gave it. Changes `edit`.
 */
export const keepSign = (original: Raster, edit: Raster, sign: Sign): void => {
  const exact = frameOfSign(sign, original);
  const wide = widened(exact, roomOf(surroundings, exact), original);
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
    const above = Math.max(exact.top - row, row - exact.top - exact.height + 1);
    for (let x = 0; x < frame.width; x += 1) {
      const column = frame.left + x;
      const beside = Math.max(
        exact.left - column,
        column - exact.left - exact.width + 1,
      );
      const distance = Math.hypot(Math.max(above, 0), Math.max(beside, 0));
      const kept = softly(Math.max(distance - room * half, 0), room * half);
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
