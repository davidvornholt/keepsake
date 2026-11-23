import { clamp, tidyBox } from '../../shared/boxes.ts';
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
 * The smallest crop of the wanted shape that shows the whole box, as large as
 * a crop has to be, and moved inside the picture.
 */
export const fitAspect = (box: Box, size: Size, aspect: AspectName): Box => {
  const ratio = ratioOf(aspect);
  const wanted = tidyBox(box);
  const wantedWidth = (wanted.right - wanted.left) * size.width;
  const wantedHeight = (wanted.bottom - wanted.top) * size.height;
  const smallestWidth =
    ratio >= 1 ? smallestLongSide : smallestLongSide * ratio;
  const widest = Math.min(size.width, size.height * ratio);
  const width = Math.min(
    Math.max(wantedWidth, wantedHeight * ratio, smallestWidth),
    widest,
  );
  const height = width / ratio;
  const left = clamp(
    ((wanted.left + wanted.right) / half) * size.width - width / half,
    0,
    size.width - width,
  );
  const top = clamp(
    ((wanted.top + wanted.bottom) / half) * size.height - height / half,
    0,
    size.height - height,
  );
  return {
    left: left / size.width,
    top: top / size.height,
    right: (left + width) / size.width,
    bottom: (top + height) / size.height,
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

/** The largest size an image model makes in a shape. */
export const outputSize = (aspect: AspectName): Size => {
  const ratio = ratioOf(aspect);
  let best: Size = { width: step, height: step };
  for (let width = step; width <= longestSide; width += step) {
    const height = Math.round(width / ratio / step) * step;
    const fits = height <= longestSide && width * height <= mostPixels;
    const isClose =
      height > 0 && Math.abs(width / height / ratio - 1) <= tolerance;
    if (fits && isClose && width * height > best.width * best.height) {
      best = { width, height };
    }
  }
  return best;
};

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
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
};
