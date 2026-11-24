import type { Size } from '../../../shared/pictures.ts';
import type { Plane } from '../pixels/raster.ts';

export const pixelsWhere = (
  plane: Plane,
  isWanted: (value: number) => boolean,
): ReadonlyArray<number> =>
  Array.from(plane.keys()).filter((pixel) => isWanted(plane[pixel] ?? 0));

const neighboursOf = (index: number, { width, height }: Size) => {
  const column = index % width;
  const row = Math.floor(index / width);
  return [
    ...(column > 0 ? [index - 1] : []),
    ...(column < width - 1 ? [index + 1] : []),
    ...(row > 0 ? [index - width] : []),
    ...(row < height - 1 ? [index + width] : []),
  ];
};

/** Goes from pixel to pixel, as far as it may. */
export const spread = (
  start: ReadonlyArray<number>,
  size: Size,
  enters: (
    pixel: number,
    way: { readonly from: number; readonly step: number },
  ) => boolean,
): void => {
  let front = start;
  for (let step = 1; front.length > 0; step += 1) {
    const next: Array<number> = [];
    for (const from of front) {
      for (const neighbour of neighboursOf(from, size)) {
        if (enters(neighbour, { from, step })) {
          next.push(neighbour);
        }
      }
    }
    front = next;
  }
};
