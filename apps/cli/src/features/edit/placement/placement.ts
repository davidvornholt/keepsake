import { clamp } from '../../../shared/boxes.ts';
import type { Box, Person, Sign } from '../../../shared/domain.ts';
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

const placedBox = (box: Box, { x, y }: Placement, size: Size): Box => {
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

export const placedPerson = (
  { face, outline }: Person,
  placement: Placement,
  size: Size,
): Person => ({
  face: placedBox(face, placement, size),
  outline: outline.map((point) => {
    const { left, top } = placedBox(
      { left: point.x, top: point.y, right: point.x, bottom: point.y },
      placement,
      size,
    );
    return { x: left, y: top };
  }),
});

type Source = {
  readonly low: number;
  readonly high: number;
  /** How much the higher one counts. */
  readonly part: number;
};

/** Where each position of an edit comes from, or null if not from the photo. */
const sourcesOf = (
  { scale, offset }: Line,
  length: number,
  start: number,
  end: number,
): ReadonlyArray<Source | null> =>
  Array.from({ length }, (_, position) => {
    const exact = (position - offset) / scale;
    if (exact < start || exact > end - 1) {
      return null;
    }
    const low = Math.floor(exact);
    return { low, high: Math.min(low + 1, end - 1), part: exact - low };
  });

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
  const columns = sourcesOf(x, width, photo.left, photo.left + photo.width);
  const rows = sourcesOf(y, height, photo.top, photo.top + photo.height);
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
  return { width, height, pixels };
};
