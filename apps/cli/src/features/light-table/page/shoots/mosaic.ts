import type { Picture } from '../../contract.ts';
import { clamp } from '../motion/spring.ts';

// The photos that stand for a shoot, laid in rows that fill a box from edge
// to edge. How many of them are shown follows from the size of the box.

export type Tile = {
  readonly key: string;
  /** Null for a frame nothing is on, as at the end of a film. */
  readonly picture: Picture | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type Box = { readonly width: number; readonly height: number };

const blankAspect = 1.5;
/** About this many rows fill a window, and no row is lower or taller than these. */
const rowsInWindow = 4.4;
const lowestRow = 96;
const tallestRow = 250;
/** On a narrow window a row holds two photos at least. */
const acrossAtLeast = 2.4;
/** Covers that fill this much of the rows asked for are enough for them. */
const enough = 0.8;
/**
 * Too few covers for a row are shown wider, by this much at most, each giving
 * up some of its top and bottom, before blank frames make up the rest.
 */
const widestCover = 1.7;

/** How tall the rows of a mosaic are in a window of some size. */
export const rowHeightIn = (window: Box): number =>
  clamp(
    Math.min(window.height / rowsInWindow, window.width / acrossAtLeast),
    lowestRow,
    tallestRow,
  );

type Shape = {
  readonly key: string;
  readonly picture: Picture | null;
  readonly aspect: number;
};

const shapeOf = (picture: Picture): Shape => ({
  key: picture.src,
  picture,
  aspect: picture.width / Math.max(1, picture.height),
});

const lengthOf = (shapes: ReadonlyArray<Shape>): number =>
  shapes.reduce((sum, { aspect }) => sum + aspect, 0);

/** How many rows the box gets: as many as asked for, or as the covers can fill. */
const rowsFor = (
  covers: ReadonlyArray<Shape>,
  { width, height }: Box,
  look: { readonly rowHeight: number; readonly gap: number },
): number => {
  const wanted = Math.max(1, Math.round(height / look.rowHeight));
  const have = lengthOf(covers);
  for (let rows = wanted; rows > 1; rows -= 1) {
    const tall = (height - look.gap * (rows - 1)) / rows;
    if (have >= ((rows * width) / tall) * enough) {
      return rows;
    }
  }
  return 1;
};

/** The first covers that fill the rows, and blank frames when they run out. */
const chosenFor = (
  covers: ReadonlyArray<Shape>,
  length: number,
  rows: number,
): ReadonlyArray<Shape> => {
  const fitting: Array<Shape> = [];
  let covered = 0;
  for (const cover of covers) {
    const half = cover.aspect / 2;
    if (covered + half <= length || fitting.length < rows) {
      fitting.push(cover);
      covered += cover.aspect;
    }
  }
  const wider = clamp(length / Math.max(covered, 1), 1, widestCover);
  const chosen = fitting.map((shape) => ({
    ...shape,
    aspect: shape.aspect * wider,
  }));
  let sum = covered * wider;
  while (sum + blankAspect / 2 <= length || chosen.length < rows) {
    chosen.push({
      key: `blank-${chosen.length}`,
      picture: null,
      aspect: blankAspect,
    });
    sum += blankAspect;
  }
  return chosen;
};

/** Splits the shapes into rows that are as nearly equally long as they get. */
const split = (
  shapes: ReadonlyArray<Shape>,
  rows: number,
): ReadonlyArray<ReadonlyArray<Shape>> => {
  const each = lengthOf(shapes) / rows;
  const lines: Array<Array<Shape>> = [];
  let line: Array<Shape> = [];
  let sum = 0;
  for (const [at, shape] of shapes.entries()) {
    const left = shapes.length - at;
    const open = rows - lines.length;
    const isFull =
      line.length > 0 &&
      open > 1 &&
      (sum + shape.aspect / 2 > each * (lines.length + 1) || left < open);
    if (isFull) {
      lines.push(line);
      line = [];
    }
    line.push(shape);
    sum += shape.aspect;
  }
  return [...lines, line];
};

/**
 * Lays the covers of a shoot in a box. Every row is as wide as the box and
 * all together are as tall, for which each picture gives up a little of its
 * edges.
 */
export const mosaicOf = (
  covers: ReadonlyArray<Picture>,
  box: Box,
  look: { readonly rowHeight: number; readonly gap: number },
): ReadonlyArray<Tile> => {
  if (box.width <= 0 || box.height <= 0) {
    return [];
  }
  const shapes = covers.map(shapeOf);
  const rows = rowsFor(shapes, box, look);
  const tall = (box.height - look.gap * (rows - 1)) / rows;
  const lines = split(chosenFor(shapes, (rows * box.width) / tall, rows), rows);
  // The height each row needs to be as wide as the box, before all are
  // made to fill it together.
  const needed = lines.map((line) => {
    const room = box.width - look.gap * (line.length - 1);
    return Math.max(1, room) / lengthOf(line);
  });
  const fit =
    (box.height - look.gap * (lines.length - 1)) /
    needed.reduce((sum, height) => sum + height, 0);
  const tiles: Array<Tile> = [];
  let y = 0;
  for (const [at, line] of lines.entries()) {
    const natural = needed[at] ?? tall;
    const h = natural * fit;
    let x = 0;
    for (const { key, picture, aspect } of line) {
      const w = aspect * natural;
      tiles.push({ key, picture, x, y, w, h });
      x += w + look.gap;
    }
    y += h + look.gap;
  }
  return tiles;
};
