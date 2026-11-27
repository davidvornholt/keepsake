import type { ShootList } from '../../contract.ts';
import { decisionOf } from '../../news-of.ts';

// The order of the walk through what is new in all the albums.

type Summary = ShootList['shoots'][number];

/** The albums with something new, the one whose news is oldest first. */
export const walkOrder = (
  shoots: ReadonlyArray<Summary>,
  left: ReadonlySet<string> = new Set(),
): ReadonlyArray<string> =>
  shoots
    .filter(({ name, news }) => news > 0 && !left.has(name))
    .toSorted(
      (one, other) =>
        (one.newSince ?? '').localeCompare(other.newSince ?? '') ||
        one.name.localeCompare(other.name),
    )
    .map(({ name }) => name);

/** How many new things there are to look at in all the albums. */
export const newsIn = (shoots: ReadonlyArray<Summary>): number =>
  shoots.reduce((sum, { news }) => sum + news, 0);

/**
 * Whether an album waits for the owner's word as a whole, which the walk
 * shows before what is new about its photos.
 */
export const waitsForWord = (
  shoots: ReadonlyArray<Summary>,
  shoot: string,
): boolean => {
  const carrying = shoots.find(({ name }) => name === shoot)?.carrying;
  return carrying !== undefined && decisionOf(carrying) !== null;
};
