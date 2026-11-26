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

/** Allows for rounding when a kept span fits exactly. */
const precision = 1e-9;

type Span = readonly [number, number];

/** Where a side of a crop of the given length may start to cover a span. */
const covering = (
  length: number,
  [low, boundsEnd]: Span,
  [keptStart, keptEnd]: Span,
): Span | null => {
  const from = Math.max(low, keptEnd - length);
  const to = Math.min(boundsEnd - length, keptStart);
  return from <= to + precision ? [from, Math.max(from, to)] : null;
};

/** Where a side of a crop of the given length starts, centred on a span. */
const centredOn = (
  [wantedStart, wantedEnd]: Span,
  length: number,
  [from, to]: Span,
): number => clamp((wantedStart + wantedEnd) / half - length / half, from, to);

/**
 * Fits the shape within the picture and as far beyond it as the box reaches,
 * at least as large as an edit needs. It shows the whole box where the shape
 * allows, and otherwise keeps what is to be kept, such as the subject and what
 * belongs to it, when that fits; if it doesn't, it is centred on the box.
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
  const width =
    Math.min(
      Math.max(wantedWidth, wantedHeight * ratio, smallestWidth),
      widest,
    ) / size.width;
  const height = (width * size.width) / ratio / size.height;
  const across: Span = [bounds.left, bounds.right];
  const down: Span = [bounds.top, bounds.bottom];
  const keptAcross = covering(width, across, [kept.left, kept.right]);
  const keptDown = covering(height, down, [kept.top, kept.bottom]);
  // What can't be kept whole is no reason to move the frame on either axis.
  const keeping = keptAcross !== null && keptDown !== null;
  const left = centredOn(
    [wanted.left, wanted.right],
    width,
    keeping ? keptAcross : [bounds.left, bounds.right - width],
  );
  const top = centredOn(
    [wanted.top, wanted.bottom],
    height,
    keeping ? keptDown : [bounds.top, bounds.bottom - height],
  );
  return { left, top, right: left + width, bottom: top + height };
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
