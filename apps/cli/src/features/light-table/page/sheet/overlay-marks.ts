import { glyphOf, seedOf } from '../marks/glyphs.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { markOnFrame, type Square } from '../marks/place.ts';
import { sketchWax, stampWax } from '../marks/wax.ts';
import { clamp } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import type { Rect } from './layout.ts';
import { stampSign } from './overlay-signs.ts';
import type { Frame } from './table.ts';

// The marks on a frame: the owner's wax, drawn by hand when it is new, the
// keepsake's blue pencil, and the heart of a favorite.

/** How long the hand takes to draw a mark, in milliseconds. */
const drawingTime = 340;

const heartShare = 0.2;
const leastHeart = 7;
const mostHeart = 22;
const heartInset = 0.3;
/** How far the marks of one frame lie apart, in their own size. */
const besideShare = 0.9;

/**
 * Where the heart of a favorite goes: the upper right corner. While its frame
 * slides under the heading of its sheet the heart stays below it, whole, for
 * as long as the frame has room for it.
 */
const heartPlace = (rect: Rect, ceiling: number): Square => {
  const size = clamp(
    Math.min(rect.w, rect.h) * heartShare,
    leastHeart,
    mostHeart,
  );
  const inset = size * heartInset;
  const lowest = rect.y + rect.h - size - inset;
  return {
    x: rect.x + rect.w - size - inset,
    y: Math.min(Math.max(rect.y, ceiling) + inset, lowest),
    size,
  };
};

const dotShare = 0.15;
const leastDot = 3;
const mostDot = 7;
const dotInset = 1.6;
const dotEdge = 1.5;
const ringWidth = 0.4;
const leastRing = 1.25;
const fullTurn = Math.PI * 2;

type Pencil = CanvasRenderingContext2D;

export type Drawn = {
  readonly pencil: Pencil;
  /** When each mark was made, so that new ones are drawn by hand. */
  readonly madeAt: ReadonlyMap<string, number>;
  readonly now: number;
  readonly scale: number;
  /** Where the heading of a sheet ends when it stays in sight. */
  readonly ceiling: number;
};

/**
 * The blue pencil: a dot for an answer to look at, a ring for a mark keepsake
 * has. It lies in the upper left corner, below the heading like the heart:
 * the lower right one is where a pile says how many lie in it.
 */
const drawBlue = (
  { pencil, ceiling }: { readonly pencil: Pencil; readonly ceiling: number },
  rect: Rect,
  isAnswered: boolean,
) => {
  const radius = clamp(Math.min(rect.w, rect.h) * dotShare, leastDot, mostDot);
  const inset = radius * dotInset;
  const x = rect.x + inset;
  const y = Math.min(
    Math.max(rect.y, ceiling) + inset,
    rect.y + rect.h - inset,
  );
  pencil.beginPath();
  pencil.arc(x, y, radius + dotEdge, 0, fullTurn);
  pencil.fillStyle = colorOf('--color-shade');
  pencil.fill();
  pencil.beginPath();
  pencil.arc(x, y, radius, 0, fullTurn);
  if (isAnswered) {
    pencil.fillStyle = colorOf('--color-pencil-blue');
    pencil.fill();
  } else {
    pencil.lineWidth = Math.max(leastRing, radius * ringWidth);
    pencil.strokeStyle = colorOf('--color-pencil-blue');
    pencil.stroke();
  }
};

/** Draws one mark of a frame. Says whether the hand is still drawing it. */
const drawMark = (
  { pencil, madeAt, now, scale, ceiling }: Drawn,
  rect: Rect,
  shown: Frame['marks'][number],
): boolean => {
  const look = lookOf[shown.pencil];
  const key = seedTextOf(shown.photo, shown.pencil);
  const stamp = { shape: look.shape, seed: seedOf(key), wax: look.wax };
  const place = markOnFrame(rect);
  if (shown.state === 'news') {
    drawBlue({ pencil, ceiling }, rect, true);
    return false;
  }
  const progress =
    (now - (madeAt.get(key) ?? Number.NEGATIVE_INFINITY)) / drawingTime;
  if (shown.state === 'open' && progress < 1) {
    sketchWax(
      pencil,
      glyphOf(stamp.shape, stamp.seed),
      { x: place.x, y: place.y, w: place.size, h: place.size },
      { color: colorOf(`--color-${look.wax}`), progress, scale },
    );
    return true;
  }
  stampWax(pencil, stamp, place, scale);
  if (shown.state === 'waiting') {
    drawBlue({ pencil, ceiling }, rect, false);
  }
  return false;
};

/** Draws the marks of one frame. Says whether one is still being drawn. */
export const drawMarks = (drawn: Drawn, frame: Frame, rect: Rect): boolean => {
  let isDrawing = false;
  for (const [at, shown] of frame.marks.entries()) {
    // The marks of the photos behind lie beside the one of the photo in front.
    const beside = {
      ...rect,
      x: rect.x + at * markOnFrame(rect).size * besideShare,
    };
    isDrawing = drawMark(drawn, beside, shown) || isDrawing;
  }
  if (frame.isFavorite) {
    const place = heartPlace(rect, drawn.ceiling);
    stampSign(drawn.pencil, 'heart', place, drawn.scale);
  }
  return isDrawing;
};
