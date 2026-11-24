import { clamp } from '../../../shared/boxes.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { brightest, channels, indexOf, type Plane } from '../pixels/raster.ts';
import { averaging } from '../pixels/smooth.ts';

export type Shift = { readonly x: number; readonly y: number };

/** How far an edit may have moved a sign, in shares of the longer side. */
const furthest = 0.028;
/** The first search is in a view this many times smaller. */
const coarse = 4;
/** What is brighter or darker than its neighbourhood of this radius counts. */
const detailRadius = 6;
/** Less likeness than this tells nothing. */
const leastLikeness = 0.25;

/** The average brightness of blocks of pixels, 0 outside the picture. */
const greyOf = (raster: Raster, frame: Frame, block: number): Plane => {
  const width = Math.floor(frame.width / block);
  const height = Math.floor(frame.height / block);
  const plane = new Float32Array(width * height);
  for (let y = 0; y < height * block; y += 1) {
    const row = frame.top + y;
    for (let x = 0; x < width * block; x += 1) {
      const column = frame.left + x;
      if (
        row >= 0 &&
        row < raster.height &&
        column >= 0 &&
        column < raster.width
      ) {
        const source = indexOf(raster, column, row);
        const target = Math.floor(y / block) * width + Math.floor(x / block);
        let sum = 0;
        for (const channel of channels) {
          sum += raster.pixels[source + channel] ?? 0;
        }
        plane[target] =
          (plane[target] ?? 0) +
          sum / (channels.length * brightest * block * block);
      }
    }
  }
  return plane;
};

/** What differs from its neighbourhood, whatever the light. */
const detailOf = (raster: Raster, frame: Frame, block: number) => {
  const grey = greyOf(raster, frame, block);
  const size: Size = {
    width: Math.floor(frame.width / block),
    height: Math.floor(frame.height / block),
  };
  const everywhere = new Float32Array(grey.length).fill(1);
  const around = averaging(everywhere, size, detailRadius)(grey);
  return {
    ...size,
    plane: grey.map((value, index) => value - (around[index] ?? 0)),
  };
};

type Detail = ReturnType<typeof detailOf>;

/** How alike a picture and a part of a larger one are, from -1 to 1. */
const likeness = (small: Detail, large: Detail, at: Shift): number => {
  let products = 0;
  let smallSquares = 0;
  let largeSquares = 0;
  for (let y = 0; y < small.height; y += 1) {
    const row = (y + at.y) * large.width + at.x;
    for (let x = 0; x < small.width; x += 1) {
      const left = small.plane[y * small.width + x] ?? 0;
      const right = large.plane[row + x] ?? 0;
      products += left * right;
      smallSquares += left * left;
      largeSquares += right * right;
    }
  }
  const squares = smallSquares * largeSquares;
  return squares > 0 ? products / Math.sqrt(squares) : 0;
};

/** Where a picture is most alike within a larger one that reaches further. */
const bestShift = (small: Detail, large: Detail) => {
  const reach = {
    x: Math.floor((large.width - small.width) / 2),
    y: Math.floor((large.height - small.height) / 2),
  };
  let best = { x: 0, y: 0, likeness: Number.NEGATIVE_INFINITY };
  for (let y = -reach.y; y <= reach.y; y += 1) {
    for (let x = -reach.x; x <= reach.x; x += 1) {
      const found = likeness(small, large, { x: reach.x + x, y: reach.y + y });
      if (found > best.likeness) {
        best = { x, y, likeness: found };
      }
    }
  }
  return best;
};

const grownBy = (frame: Frame, room: number): Frame => ({
  left: frame.left - room,
  top: frame.top - room,
  width: frame.width + 2 * room,
  height: frame.height + 2 * room,
});

type Search = {
  /** How far to look, in pixels. */
  readonly room: number;
  /** How many times smaller the view is in which it looks. */
  readonly block: number;
};

/** About how far an edit has moved what is in a frame, and how surely. */
export const roughShiftOf = (
  original: Raster,
  edit: Raster,
  frame: Frame,
  { room, block }: Search,
) => {
  const found = bestShift(
    detailOf(original, frame, block),
    detailOf(edit, grownBy(frame, room), block),
  );
  return {
    x: clamp(found.x * block, -room, room),
    y: clamp(found.y * block, -room, room),
    likeness: found.likeness,
  };
};

/** How far an edit of a photo has moved what is in a frame of the original. */
export const shiftOf = (
  original: Raster,
  edit: Raster,
  frame: Frame,
): Shift => {
  const side = Math.max(original.width, original.height);
  const room = Math.ceil((furthest * side) / coarse) * coarse;
  const near = roughShiftOf(original, edit, frame, { room, block: coarse });
  if (near.likeness < leastLikeness) {
    return { x: 0, y: 0 };
  }
  const fine = bestShift(
    detailOf(original, frame, 1),
    detailOf(
      edit,
      grownBy(
        { ...frame, left: frame.left + near.x, top: frame.top + near.y },
        coarse,
      ),
      1,
    ),
  );
  return { x: near.x + fine.x, y: near.y + fine.y };
};
