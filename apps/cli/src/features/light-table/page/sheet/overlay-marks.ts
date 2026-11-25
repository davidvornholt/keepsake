import { glyphOf, seedOf } from '../marks/glyphs.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { sketchWax, stampWax } from '../marks/wax.ts';
import { clamp, mix } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import type { Rect } from './layout.ts';
import { stampSign } from './overlay-signs.ts';
import type { Frame } from './table.ts';

// The marks on a frame: the owner's wax, drawn by hand when it is new, the
// agent's blue pencil, and the heart of a favorite.

/** How long the hand takes to draw a mark, in milliseconds. */
const drawingTime = 340;

const markShare = 0.74;
/** From this size on a mark grows more slowly than its frame. */
const markSteady = 64;
const markGrowth = 0.22;
const leastMark = 9;
/** Over this many pixels a mark moves from the middle to a corner. */
const cornerRange = 140;
const cornerInset = 0.06;

type Square = { readonly x: number; readonly y: number; readonly size: number };

/** Where a mark goes: all over a small frame, in the corner of a large one. */
const markPlace = ({ x, y, w, h }: Rect): Square => {
  const side = Math.min(w, h);
  const size = Math.max(
    leastMark,
    side < markSteady
      ? side * markShare
      : markSteady * markShare + (side - markSteady) * markGrowth,
  );
  const toCorner = clamp((side - markSteady) / cornerRange, 0, 1);
  const inset = side * cornerInset;
  return {
    x: mix(x + (w - size) / 2, x + inset, toCorner),
    y: mix(y + (h - size) / 2, y + h - size - inset, toCorner),
    size,
  };
};

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

/** The blue pencil: a dot for an answer to look at, a ring for a mark an agent has. */
const drawBlue = (pencil: Pencil, rect: Rect, isAnswered: boolean) => {
  const radius = clamp(Math.min(rect.w, rect.h) * dotShare, leastDot, mostDot);
  const x = rect.x + rect.w - radius * dotInset;
  const y = rect.y + rect.h - radius * dotInset;
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
  { pencil, madeAt, now, scale }: Drawn,
  rect: Rect,
  shown: Frame['marks'][number] & { readonly photo: string },
): boolean => {
  const { kind } = shown.mark;
  const look = lookOf[kind];
  const key = seedTextOf(shown.photo, kind);
  const stamp = { shape: look.shape, seed: seedOf(key), wax: look.wax };
  const place = markPlace(rect);
  if (shown.state === 'news') {
    drawBlue(pencil, rect, true);
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
    drawBlue(pencil, rect, false);
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
      x: rect.x + at * markPlace(rect).size * besideShare,
    };
    isDrawing =
      drawMark(drawn, beside, { ...shown, photo: shown.mark.photo }) ||
      isDrawing;
  }
  if (frame.isFavorite) {
    const place = heartPlace(rect, drawn.ceiling);
    stampSign(drawn.pencil, 'heart', place, drawn.scale);
  }
  return isDrawing;
};
