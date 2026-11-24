import { clamp } from '../../../shared/boxes.ts';
import type { Box } from '../../../shared/domain.ts';
import type { Frame, Size } from '../../../shared/pictures.ts';

/** How much further something reaches, as a part of its height and more. */
export type Room = { readonly pixels: number; readonly height: number };

export const roomOf = ({ pixels, height }: Room, frame: Frame): number =>
  Math.round(pixels + height * frame.height);

/** The whole pixels that a box covers. */
export const frameAround = (box: Box, picture: Size): Frame => {
  const left = Math.floor(box.left * picture.width);
  const top = Math.floor(box.top * picture.height);
  return {
    left,
    top,
    width: Math.max(1, Math.ceil(box.right * picture.width) - left),
    height: Math.max(1, Math.ceil(box.bottom * picture.height) - top),
  };
};

/** A frame with room on each side, where the picture allows. */
export const withRoom = (frame: Frame, room: number, picture: Size): Frame => {
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

/** The part of a frame whose place after a shift is in the picture too. */
export const shiftable = (
  frame: Frame,
  shift: { readonly x: number; readonly y: number },
  picture: Size,
): Frame => {
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

export const isIn = (
  { left, top, width, height }: Frame,
  x: number,
  y: number,
): boolean => x >= left && x < left + width && y >= top && y < top + height;

/** How many pixels a pixel is away from a frame, 0 for those in it. */
export const distanceFrom = (
  { left, top, width, height }: Frame,
  x: number,
  y: number,
): number =>
  Math.hypot(
    Math.max(left - x, x - left - width + 1, 0),
    Math.max(top - y, y - top - height + 1, 0),
  );

/** Makes a step from 0 to 1 that starts and ends slowly. */
const smoothness = 3;

/** 1 for the pixels of a frame that are of some kind and 0 for others. */
export const maskIn = (
  frame: Frame,
  isOfKind: (x: number, y: number) => boolean,
): Float32Array =>
  Float32Array.from({ length: frame.width * frame.height }, (_, index) =>
    isOfKind(
      frame.left + (index % frame.width),
      frame.top + Math.floor(index / frame.width),
    )
      ? 1
      : 0,
  );

/** 1 up to a distance, then slowly less, until it is 0 after some more. */
export const fading = (
  distance: number,
  whole: number,
  more: number,
): number => {
  const part = clamp(1 - (distance - whole) / more, 0, 1);
  return part * part * (smoothness - 2 * part);
};
