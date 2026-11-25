// Going over the shelf with the arrow keys: sideways to the next album, up
// and down to the one that lies nearest in the next row.

type Point = { readonly x: number; readonly y: number };

/** Places closer in height than this, in pixels, lie in the same row. */
const sameRow = 8;

/** The nearest of the places wanted: in the nearest row, the nearest across. */
const nearestIn = (
  places: ReadonlyArray<Point>,
  from: Point,
  isWanted: (place: Point) => boolean,
): number | null => {
  const wanted = places
    .map((place, at) => ({
      at,
      down: Math.abs(place.y - from.y),
      across: Math.abs(place.x - from.x),
      isWanted: isWanted(place),
    }))
    .filter((place) => place.isWanted);
  const nearestRow = Math.min(...wanted.map(({ down }) => down));
  const [nearest] = wanted
    .filter(({ down }) => down - nearestRow <= sameRow)
    .toSorted((one, other) => one.across - other.across);
  return nearest?.at ?? null;
};

/**
 * Where a key leads from the place the keyboard is on, given where the
 * places lie. From nowhere, any key leads to the first.
 */
export const stepFrom = (
  places: ReadonlyArray<Point>,
  at: number,
  key: string,
): number => {
  const last = places.length - 1;
  const from = places[at];
  if (key === 'Home' || from === undefined) {
    return 0;
  }
  if (key === 'End') {
    return last;
  }
  if (key === 'ArrowRight') {
    return Math.min(last, at + 1);
  }
  if (key === 'ArrowLeft') {
    return Math.max(0, at - 1);
  }
  const isBelow = key === 'ArrowDown';
  return (
    nearestIn(places, from, (place) =>
      isBelow ? place.y > from.y + sameRow : place.y < from.y - sameRow,
    ) ?? at
  );
};
