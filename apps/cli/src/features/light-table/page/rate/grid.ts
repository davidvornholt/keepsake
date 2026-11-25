import type { Rect } from '../sheet/layout.ts';

// Where the photos of a moment lie while they are compared: as large as
// they can be with all of them in view.

type Space = { readonly width: number; readonly height: number };

export type Tiles = {
  readonly columns: number;
  /** Where each photo lies, and the strip below it for what belongs to it. */
  readonly photos: ReadonlyArray<Rect>;
  readonly below: ReadonlyArray<Rect>;
};

type Distances = {
  readonly gap: number;
  /** The height of the strip below each photo. */
  readonly strip: number;
  /** What stays free at the left and the right of the space. */
  readonly pad?: number;
};

/**
 * Lays photos of these shapes in a grid in the middle of a space, with a gap
 * between them and a strip below each.
 */
export const tilesFor = (
  shapes: ReadonlyArray<number>,
  whole: Space,
  { gap, strip, pad = 0 }: Distances,
): Tiles => {
  const space = { width: whole.width - pad * 2, height: whole.height };
  const count = shapes.length;
  if (count === 0) {
    return { columns: 1, photos: [], below: [] };
  }
  const widest = Math.max(...shapes);
  // Each cell gives up the gap and the strip, so the photos themselves fit.
  const fits = (across: number) => {
    const down = Math.ceil(count / across);
    const w = (space.width - gap * (across - 1)) / across;
    const h = (space.height - gap * (down - 1)) / down - strip;
    return Math.min(w, h * widest);
  };
  let columns = 1;
  for (let more = 2; more <= count; more += 1) {
    if (fits(more) > fits(columns)) {
      columns = more;
    }
  }
  const rows = Math.ceil(count / columns);
  const cellW = Math.max(1, fits(columns));
  const cellH = cellW / widest;
  const wholeW = columns * cellW + (columns - 1) * gap;
  const wholeH = rows * (cellH + strip) + (rows - 1) * gap;
  const left = pad + (space.width - wholeW) / 2;
  const top = (space.height - wholeH) / 2;
  const photos = shapes.map((shape, at) => {
    const inLast = at >= (rows - 1) * columns;
    const across = inLast ? count - (rows - 1) * columns : columns;
    // A last row that isn't full lies in the middle.
    const shift = ((columns - across) * (cellW + gap)) / 2;
    const w = Math.min(cellW, cellH * shape);
    const h = w / shape;
    const cellX = left + shift + (at % columns) * (cellW + gap);
    const cellY = top + Math.floor(at / columns) * (cellH + strip + gap);
    return { x: cellX + (cellW - w) / 2, y: cellY + (cellH - h), w, h };
  });
  return {
    columns,
    photos,
    below: photos.map(({ x, y, w, h }) => ({ x, y: y + h, w, h: strip })),
  };
};

/** The photo a key leads to from another one, or the same at an edge. */
export const stepIn = (
  count: number,
  columns: number,
  from: number | null,
  { right, down }: { readonly right: number; readonly down: number },
): number => {
  if (from === null) {
    return 0;
  }
  const next = from + right + down * columns;
  return next >= 0 && next < count ? next : from;
};
