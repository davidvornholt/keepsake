import type { Moment, Photo } from '../../shared/domain.ts';
import { type Look, likeness } from './look.ts';

/** Photos this many milliseconds apart belong together, however they look. */
const burstGap = 2000;
/** Photos further apart than this never do. */
const sceneGap = 120_000;
/** How many of 64 bits may differ between photos of the same scene. */
const sameSceneDistance = 12;
/** From this likeness on, two photos show the same scene from the same spot. */
const sameScene = 0.75;
/** How much more one photo may be zoomed in than the other of the same scene. */
const mostZoom = 1.25;
/**
 * How many of the last photos of a moment a photo is compared with, so that
 * one frame where something crossed the picture doesn't end the moment.
 */
const comparedBack = 3;

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

/** How much more `photo` was zoomed in than `before`, or null if unknown. */
const zoomOf = (before: Photo, photo: Photo): number | null => {
  if (before.focalLength === null || photo.focalLength === null) {
    return before.focalLength === photo.focalLength ? 1 : null;
  }
  return photo.focalLength / Math.max(Number.EPSILON, before.focalLength);
};

/**
 * Whether two photos show the same from about the same spot: held the same
 * way, zoomed about the same, and either alike in their pattern of light and
 * dark, or with the same picture in both when one is moved over the other.
 */
const looksAlike = (
  before: Photo,
  photo: Photo,
  looks: ReadonlyMap<string, Look>,
): boolean => {
  const zoom = zoomOf(before, photo);
  if (
    zoom === null ||
    before.orientation !== photo.orientation ||
    Math.max(zoom, 1 / zoom) > mostZoom
  ) {
    return false;
  }
  if (hashDistance(before.hash, photo.hash) <= sameSceneDistance) {
    return true;
  }
  const one = looks.get(before.id);
  const other = looks.get(photo.id);
  return (
    one !== undefined &&
    other !== undefined &&
    likeness(one, other, zoom) >= sameScene
  );
};

/** The offset from UTC most of the photos have, or UTC when none has one. */
const usualOffset = (photos: ReadonlyArray<Photo>): string => {
  const counts = new Map<string, number>();
  for (const { utcOffset } of photos) {
    if (utcOffset !== null) {
      counts.set(utcOffset, (counts.get(utcOffset) ?? 0) + 1);
    }
  }
  const [usual] = [...counts].toSorted(
    ([left, many], [right, more]) => more - many || left.localeCompare(right),
  );
  return usual?.[0] ?? 'Z';
};

/**
 * When each photo was taken, in milliseconds since 1970. The offset the camera
 * recorded counts, so the hour that comes twice when the clocks go back isn't
 * one; a photo without one gets the usual offset of the others.
 */
const timesOf = (photos: ReadonlyArray<Photo>): ReadonlyMap<string, number> => {
  const usual = usualOffset(photos);
  return new Map(
    photos.map(({ id, takenAt, utcOffset }) => [
      id,
      Date.parse(`${takenAt}${utcOffset ?? usual}`),
    ]),
  );
};

const belongsWith = (
  group: ReadonlyArray<Photo>,
  photo: Photo,
  context: {
    readonly looks: ReadonlyMap<string, Look>;
    readonly times: ReadonlyMap<string, number>;
  },
): boolean => {
  const { looks, times } = context;
  const last = group.at(-1);
  if (last === undefined) {
    return false;
  }
  const gap = (times.get(photo.id) ?? 0) - (times.get(last.id) ?? 0);
  if (gap <= burstGap) {
    return true;
  }
  return (
    gap <= sceneGap &&
    group
      .slice(-comparedBack)
      .toReversed()
      .some((before) => looksAlike(before, photo, looks))
  );
};

/**
 * Groups photos into moments, oldest first: photos taken one right after
 * the other, or that show the same from about the same spot within two
 * minutes of the moment's last photo. `looks` has what the photos look like, as far as it is known.
 */
export const momentsOf = (
  photos: ReadonlyArray<Photo>,
  looks: ReadonlyMap<string, Look> = new Map(),
): ReadonlyArray<Moment> => {
  const times = timesOf(photos);
  const oldestFirst = photos.toSorted(
    (left, right) =>
      (times.get(left.id) ?? 0) - (times.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id),
  );
  const groups: Array<Array<Photo>> = [];
  for (const photo of oldestFirst) {
    const group = groups.at(-1);
    if (group !== undefined && belongsWith(group, photo, { looks, times })) {
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
