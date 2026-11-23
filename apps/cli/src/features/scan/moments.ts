import type { Moment, Photo } from '../../shared/domain.ts';

/** Photos this many milliseconds apart belong together, however they look. */
const burstGap = 2000;
/** Photos further apart than this never do. */
const sceneGap = 60_000;
/** How many of 64 bits may differ between photos of the same scene. */
const sameSceneDistance = 12;

const bitsPerDigit = 4;
const hexadecimal = 16;

/** How many bits two hashes differ in. */
export const hashDistance = (left: string, right: string): number => {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number.parseInt(left.charAt(index), hexadecimal);
    const b = Number.parseInt(right.charAt(index), hexadecimal);
    for (let bit = 0; bit < bitsPerDigit; bit += 1) {
      const difference =
        Math.floor(a / 2 ** bit) % 2 === Math.floor(b / 2 ** bit) % 2 ? 0 : 1;
      distance += difference;
    }
  }
  return distance;
};

const rows = 8;
const columns = 9;

/**
 * A hash from a picture shrunk to 9 by 8 grey pixels: one bit for each pixel,
 * telling whether it is darker than the one to its right.
 */
export const hashOf = (pixels: Uint8Array): string => {
  let hash = '';
  for (let row = 0; row < rows; row += 1) {
    let value = 0;
    for (let column = 0; column < columns - 1; column += 1) {
      const here = pixels[row * columns + column] ?? 0;
      const next = pixels[row * columns + column + 1] ?? 0;
      value = value * 2 + (here < next ? 1 : 0);
      if (column % bitsPerDigit === bitsPerDigit - 1) {
        hash += value.toString(hexadecimal);
        value = 0;
      }
    }
  }
  return hash;
};

const belongsWith = (before: Photo, photo: Photo): boolean => {
  const gap =
    Date.parse(`${photo.takenAt}Z`) - Date.parse(`${before.takenAt}Z`);
  if (gap <= burstGap) {
    return true;
  }
  return (
    gap <= sceneGap &&
    before.orientation === photo.orientation &&
    before.focalLength === photo.focalLength &&
    hashDistance(before.hash, photo.hash) <= sameSceneDistance
  );
};

/** Groups photos, oldest first, into moments. */
export const momentsOf = (
  photos: ReadonlyArray<Photo>,
): ReadonlyArray<Moment> => {
  const groups: Array<Array<Photo>> = [];
  for (const photo of photos) {
    const group = groups.at(-1);
    const before = group?.at(-1);
    if (
      group !== undefined &&
      before !== undefined &&
      belongsWith(before, photo)
    ) {
      group.push(photo);
    } else {
      groups.push([photo]);
    }
  }
  return groups.flatMap((group) => {
    const [first] = group;
    return first === undefined
      ? []
      : [{ id: first.id, photos: group.map(({ id }) => id) }];
  });
};
