import { clamp } from '../../../shared/boxes.ts';
import type { Box, Outline, Person, Sign } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { channels, indexOf } from '../pixels/raster.ts';

/** Where an edit shows a position of the original, along one axis. */
export type Line = { readonly scale: number; readonly offset: number };
/** Where an edit shows what the original shows, in pixels. */
export type Placement = { readonly x: Line; readonly y: Line };

/** Everything stays where it is. */
export const unmoved: Placement = {
  x: { scale: 1, offset: 0 },
  y: { scale: 1, offset: 0 },
};

export const placeOf = ({ scale, offset }: Line, position: number): number =>
  scale * position + offset;

export const movedOn = (
  { x, y }: Placement,
  by: { readonly x: number; readonly y: number },
): Placement => ({
  x: { ...x, offset: x.offset + by.x },
  y: { ...y, offset: y.offset + by.y },
});

/** Where an edit shows a box. */
export const placedBox = (box: Box, { x, y }: Placement, size: Size): Box => {
  const across = (position: number) =>
    clamp(placeOf(x, position * size.width) / size.width, 0, 1);
  const down = (position: number) =>
    clamp(placeOf(y, position * size.height) / size.height, 0, 1);
  return {
    left: across(box.left),
    top: down(box.top),
    right: across(box.right),
    bottom: down(box.bottom),
  };
};

export const placedSign = (
  sign: Sign,
  placement: Placement,
  size: Size,
): Sign => ({ ...sign, box: placedBox(sign.box, placement, size) });

/** Where an edit shows an outline. */
export const placedOutline = (
  outline: Outline,
  placement: Placement,
  size: Size,
): Outline =>
  outline.map(({ x, y }) => {
    const { left, top } = placedBox(
      { left: x, top: y, right: x, bottom: y },
      placement,
      size,
    );
    return { x: left, y: top };
  });

export const placedPerson = (
  { face, outline }: Person,
  placement: Placement,
  size: Size,
): Person => ({
  face: placedBox(face, placement, size),
  outline: placedOutline(outline, placement, size),
});

type Source = {
  readonly low: number;
  readonly high: number;
  /** How much the higher one counts. */
  readonly part: number;
};

/** The part of an axis that shows the photo. */
type Extent = { readonly start: number; readonly end: number };

/** Where each position of an edit would come from. */
const positionsOf = ({ scale, offset }: Line, length: number) =>
  Array.from({ length }, (_, position) => (position - offset) / scale);

const sourceAt = (exact: number, end: number): Source => {
  const low = Math.floor(exact);
  return { low, high: Math.min(low + 1, end - 1), part: exact - low };
};

/** Where each position of an edit comes from, or null if not from the photo. */
const sourcesOf = (
  line: Line,
  length: number,
  { start, end }: Extent,
): ReadonlyArray<Source | null> =>
  positionsOf(line, length).map((exact) =>
    exact < start || exact > end - 1 ? null : sourceAt(exact, end),
  );

/** The same, with the border going on beyond the photo. */
const nearestOf = (line: Line, length: number): ReadonlyArray<Source> =>
  positionsOf(line, length).map((exact) =>
    sourceAt(clamp(exact, 0, length - 1), length),
  );

type Sources = {
  readonly columns: ReadonlyArray<Source | null>;
  readonly rows: ReadonlyArray<Source | null>;
};

/** Writes pixels of a picture to where they are wanted. */
const write = (
  original: Raster,
  pixels: Uint8Array,
  { columns, rows }: Sources,
) => {
  for (const [row, down] of rows.entries()) {
    for (const [column, across] of columns.entries()) {
      if (down !== null && across !== null) {
        const target = indexOf(original, column, row);
        const topLeft = indexOf(original, across.low, down.low);
        const topRight = indexOf(original, across.high, down.low);
        const bottomLeft = indexOf(original, across.low, down.high);
        const bottomRight = indexOf(original, across.high, down.high);
        for (const channel of channels) {
          const read = (index: number) => original.pixels[index + channel] ?? 0;
          const top =
            read(topLeft) * (1 - across.part) + read(topRight) * across.part;
          const bottom =
            read(bottomLeft) * (1 - across.part) +
            read(bottomRight) * across.part;
          pixels[target + channel] = Math.round(
            top * (1 - down.part) + bottom * down.part,
          );
        }
      }
    }
  }
};

/**
 * The original with everything where the edit shows it, and the edit itself
 * where the photo shows nothing.
 */
export const placed = (
  original: Raster,
  edit: Raster,
  photo: Frame,
  { x, y }: Placement,
): Raster => {
  const { width, height } = original;
  const pixels = edit.pixels.slice();
  const { left, top } = photo;
  write(original, pixels, {
    columns: sourcesOf(x, width, { start: left, end: left + photo.width }),
    rows: sourcesOf(y, height, { start: top, end: top + photo.height }),
  });
  return { width, height, pixels };
};

/** A picture with everything elsewhere. Its border goes on where it ends. */
export const placedOn = (picture: Raster, { x, y }: Placement): Raster => {
  const { width, height } = picture;
  const pixels = new Uint8Array(picture.pixels.length);
  write(picture, pixels, {
    columns: nearestOf(x, width),
    rows: nearestOf(y, height),
  });
  return { width, height, pixels };
};
