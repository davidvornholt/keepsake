import { around, clamp, tidyBox, wholePicture } from '../../shared/boxes.ts';
import {
  type AspectName,
  aspectNames,
  type Box,
  ratioOf,
} from '../../shared/domain.ts';
import type { Frame, Size } from '../../shared/pictures.ts';

const half = 2;

/** The smallest long side of a crop, in pixels of the camera's picture. */
const smallestLongSide = 1600;

/**
 * Where a side of a crop of the given length starts, centred on the wanted
 * span and inside the bounds, and covering what has to be kept if it can.
 */
const placed = (
  [wantedStart, wantedEnd]: readonly [number, number],
  length: number,
  [low, boundsEnd]: readonly [number, number],
  [keptStart, keptEnd]: readonly [number, number],
): number => {
  const high = boundsEnd - length;
  const centred = (wantedStart + wantedEnd) / half - length / half;
  const keepingLow = Math.max(low, keptEnd - length);
  const keepingHigh = Math.min(high, keptStart);
  return keepingLow <= keepingHigh
    ? clamp(centred, keepingLow, keepingHigh)
    : clamp(centred, low, high);
};

/**
 * The smallest crop of the wanted shape that shows the whole box, as large as
 * a crop has to be. It goes beyond the picture only as far as the box does.
 * Where the shape makes it smaller than the box, it keeps what is to be kept,
 * such as the subject and what belongs to it, and loses some of the rest.
 */
export const fitAspect = (
  wanted: Box,
  size: Size,
  aspect: AspectName,
  kept: Box = wanted,
): Box => {
  const ratio = ratioOf(aspect);
  const bounds = around([wholePicture, wanted]);
  const most = {
    width: (bounds.right - bounds.left) * size.width,
    height: (bounds.bottom - bounds.top) * size.height,
  };
  const wantedWidth = (wanted.right - wanted.left) * size.width;
  const wantedHeight = (wanted.bottom - wanted.top) * size.height;
  const smallestWidth =
    ratio >= 1 ? smallestLongSide : smallestLongSide * ratio;
  const widest = Math.min(most.width, most.height * ratio);
  const width = Math.min(
    Math.max(wantedWidth, wantedHeight * ratio, smallestWidth),
    widest,
  );
  const height = width / ratio;
  const left = placed(
    [wanted.left, wanted.right],
    width / size.width,
    [bounds.left, bounds.right],
    [kept.left, kept.right],
  );
  const top = placed(
    [wanted.top, wanted.bottom],
    height / size.height,
    [bounds.top, bounds.bottom],
    [kept.top, kept.bottom],
  );
  return {
    left,
    top,
    right: left + width / size.width,
    bottom: top + height / size.height,
  };
};

/** The shape in the list that is closest to a picture's own. */
export const closestAspect = ({ width, height }: Size): AspectName => {
  const distance = (name: AspectName) =>
    Math.abs(Math.log(ratioOf(name) / (width / height)));
  return aspectNames.reduce((best, name) =>
    distance(name) < distance(best) ? name : best,
  );
};

/** A box inside the whole picture, seen from inside a crop of it. */
export const within = (box: Box, crop: Box): Box => {
  const width = crop.right - crop.left;
  const height = crop.bottom - crop.top;
  return tidyBox({
    left: (box.left - crop.left) / width,
    top: (box.top - crop.top) / height,
    right: (box.right - crop.left) / width,
    bottom: (box.bottom - crop.top) / height,
  });
};

// What the image model takes: both sides multiples of 16, the longer one at
// most 3840 pixels, and at most 8,294,400 pixels in all.
const step = 16;
const longestSide = 3840;
const mostPixels = 8_294_400;
/** A shape this far off the wanted one can't be told from it. */
const tolerance = 0.006;

const fits = ({ width, height }: Size): boolean =>
  Math.max(width, height) <= longestSide && width * height <= mostPixels;

/** The largest size an image model makes in a shape of that width to height. */
const largestSize = (ratio: number): Size => {
  let best: Size = { width: step, height: step };
  for (let width = step; width <= longestSide; width += step) {
    const height = Math.round(width / ratio / step) * step;
    const isClose =
      height > 0 && Math.abs(width / height / ratio - 1) <= tolerance;
    if (
      isClose &&
      fits({ width, height }) &&
      width * height > best.width * best.height
    ) {
      best = { width, height };
    }
  }
  return best;
};

export const outputSize = (aspect: AspectName): Size =>
  largestSize(ratioOf(aspect));

/** The size an image model makes of a picture, its own if it can. */
export const editableSize = (size: Size): Size =>
  size.width % step === 0 && size.height % step === 0 && fits(size)
    ? size
    : largestSize(size.width / size.height);

/**
 * The pixels of a crop, trimmed by a hair so its shape is exactly that of the
 * output and nothing is stretched.
 */
export const exactFrame = (box: Box, size: Size, output: Size): Frame => {
  const ratio = output.width / output.height;
  const boxWidth = (box.right - box.left) * size.width;
  const boxHeight = (box.bottom - box.top) * size.height;
  const width = Math.min(boxWidth, boxHeight * ratio);
  const height = width / ratio;
  const left = box.left * size.width + (boxWidth - width) / half;
  const top = box.top * size.height + (boxHeight - height) / half;
  // Each side is rounded, so none ends up a pixel outside the box.
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(left + width) - Math.round(left),
    height: Math.round(top + height) - Math.round(top),
  };
};
