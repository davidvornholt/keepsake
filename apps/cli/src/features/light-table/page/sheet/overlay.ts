import type { Box } from '../../contract.ts';
import { isAboutFavorites } from '../data/derive.ts';
import { glyphOf, seedOf } from '../marks/glyphs.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { printCorners } from '../marks/print.ts';
import { sketchWax, stampWax } from '../marks/wax.ts';
import { clamp, mix } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import type { Rect } from './layout.ts';
import {
  type Content,
  type Frame,
  inSight,
  type Table,
  topOf,
} from './table.ts';

// What is drawn on the frames: the owner's wax, the agent's blue pencil, the
// crop of the finished photo, and the print along the edge of the film.

export type OverlayState = {
  /** The frame that is shown large right now, and so not here. */
  hidden: string | null;
  cursor: string | null;
  hover: string | null;
  /** Whether the keyboard is in use, so the cursor is shown. */
  isCursorShown: boolean;
  /** When each mark was made, so that new ones are drawn by hand. */
  readonly madeAt: Map<string, number>;
  hasContent: boolean;
};

export const makeOverlayState = (): OverlayState => ({
  hidden: null,
  cursor: null,
  hover: null,
  isCursorShown: false,
  madeAt: new Map(),
  hasContent: false,
});

const longAgo = Number.NEGATIVE_INFINITY;

/** The marks on the table that can still be taken back. */
const openMarks = (content: Content): ReadonlySet<string> =>
  new Set(
    content
      .flatMap(({ frames }) => frames)
      .flatMap(({ id, marks }) =>
        marks
          .filter(({ state }) => state === 'open')
          .map(({ mark }) => seedTextOf(id, mark.kind)),
      ),
  );

/** Remembers which marks are new, so that they are drawn stroke by stroke. */
export const noteMarks = (
  state: OverlayState,
  content: Content,
  now: number,
): void => {
  const present = openMarks(content);
  for (const key of state.madeAt.keys()) {
    if (!present.has(key)) {
      state.madeAt.delete(key);
    }
  }
  for (const key of present) {
    if (!state.madeAt.has(key)) {
      state.madeAt.set(key, state.hasContent ? now : longAgo);
    }
  }
  state.hasContent = state.hasContent || content.length > 0;
};

/** How long the hand takes to draw a mark, in milliseconds. */
export const drawingTime = 340;

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

const starShare = 0.24;
const leastStar = 7;
const mostStar = 26;
const starInset = 0.25;

/**
 * Where the star of a favourite goes: the upper right corner. While its frame
 * slides under the heading of its sheet the star stays below it, whole, for
 * as long as the frame has room for it.
 */
const starPlace = (rect: Rect, ceiling: number): Square => {
  const size = clamp(Math.min(rect.w, rect.h) * starShare, leastStar, mostStar);
  const inset = size * starInset;
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

type Drawn = {
  readonly pencil: Pencil;
  readonly state: OverlayState;
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
  { pencil, state, now, scale, ceiling }: Drawn,
  rect: Rect,
  shown: Frame['marks'][number] & { readonly photo: string },
): boolean => {
  const { kind } = shown.mark;
  const look = lookOf[kind];
  const key = seedTextOf(shown.photo, kind);
  const stamp = { shape: look.shape, seed: seedOf(key), wax: look.wax };
  const place = isAboutFavorites(kind)
    ? starPlace(rect, ceiling)
    : markPlace(rect);
  if (shown.state === 'news') {
    drawBlue(pencil, rect, true);
    return false;
  }
  const progress = (now - (state.madeAt.get(key) ?? longAgo)) / drawingTime;
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
const drawMarks = (drawn: Drawn, frame: Frame, rect: Rect): boolean => {
  let isDrawing = false;
  for (const shown of frame.marks) {
    isDrawing =
      drawMark(drawn, rect, { ...shown, photo: frame.id }) || isDrawing;
  }
  const hasStar = frame.marks.some(({ mark }) => isAboutFavorites(mark.kind));
  if (frame.isFavorite && !hasStar) {
    const seed = seedOf(seedTextOf(frame.id, 'favorite'));
    stampWax(
      drawn.pencil,
      { shape: 'star', seed, wax: 'wax-white' },
      starPlace(rect, drawn.ceiling),
      drawn.scale,
    );
  }
  return isDrawing;
};

/** From this height on a frame shows what the finished photo keeps of it. */
const cropFrom = 52;
const cornerShare = 0.16;
const leastCorner = 3;
const mostCorner = 13;
const cropLine = 1.25;
const cropEdge = 3;

/** Crop marks at the corners of what the finished photo shows. */
const drawCrop = (pencil: Pencil, rect: Rect, crop: Box) => {
  const left = rect.x + crop.left * rect.w;
  const right = rect.x + crop.right * rect.w;
  const top = rect.y + crop.top * rect.h;
  const bottom = rect.y + crop.bottom * rect.h;
  const arm = clamp(
    Math.min(right - left, bottom - top) * cornerShare,
    leastCorner,
    mostCorner,
  );
  printCorners(
    pencil,
    { x: left, y: top, w: right - left, h: bottom - top },
    { arm, line: cropLine, edge: cropEdge },
  );
};

const printSize = 10;
const printDrop = 8;
const printSpace = 7;
/** A frame narrower than this has room for its number only. */
const timeFrom = 78;
const scoreFrom = 120;
const numberLength = 4;

/** The number, time and score of a frame, printed below it. */
const drawPrint = (pencil: Pencil, frame: Frame, rect: Rect, gap: number) => {
  const y = rect.y + rect.h + gap + printDrop;
  pencil.textBaseline = 'middle';
  pencil.textAlign = 'left';
  pencil.fillStyle = colorOf(frame.isLit ? '--color-print' : '--color-quiet');
  const number = String(frame.number).padStart(numberLength, '0');
  pencil.fillText(number, rect.x, y);
  pencil.fillStyle = colorOf('--color-quiet');
  if (rect.w >= timeFrom) {
    const after = pencil.measureText(number).width + printSpace;
    pencil.fillText(frame.time, rect.x + after, y);
  }
  if (frame.score !== null && rect.w >= scoreFrom) {
    pencil.textAlign = 'right';
    pencil.fillText(`${frame.score}/10`, rect.x + rect.w, y);
  }
};

const outline = (pencil: Pencil, rect: Rect, grow: number) => {
  pencil.strokeRect(
    rect.x - grow,
    rect.y - grow,
    rect.w + grow * 2,
    rect.h + grow * 2,
  );
};

const pulseTime = 420;
const pulseLeast = 0.55;
const cursorGrow = 3;
const cursorEdge = 4;

/** The frame under the pointer, the one the keys act on, and those an agent works on. */
const drawOutlines = (
  { pencil, state, now }: Drawn,
  frame: Frame,
  rect: Rect,
): boolean => {
  if (frame.isWorkedOn) {
    const before = pencil.globalAlpha;
    pencil.globalAlpha =
      before * mix(pulseLeast, 1, (1 + Math.sin(now / pulseTime)) / 2);
    pencil.lineWidth = 2;
    pencil.strokeStyle = colorOf('--color-pencil-blue');
    outline(pencil, rect, 2);
    pencil.globalAlpha = before;
  }
  if (state.isCursorShown && state.cursor === frame.id) {
    pencil.lineWidth = cursorEdge;
    pencil.strokeStyle = colorOf('--color-sheet');
    outline(pencil, rect, cursorGrow);
    pencil.lineWidth = 2;
    pencil.strokeStyle = colorOf('--color-lamp');
    outline(pencil, rect, 2);
  } else if (state.hover === frame.id) {
    pencil.lineWidth = 1;
    pencil.strokeStyle = colorOf('--color-lamp');
    outline(pencil, rect, 1);
  }
  return frame.isWorkedOn;
};

/** Draws everything that lies on the frames. Says whether it still changes. */
export const drawOverlay = (
  pencil: Pencil,
  table: Table,
  state: OverlayState,
  { now, scale }: { readonly now: number; readonly scale: number },
): boolean => {
  const { width, height } = table.size;
  const { measure } = table.layout;
  const scroll = table.scroller.value;
  const lights = table.lights.value;
  pencil.setTransform(scale, 0, 0, scale, 0, 0);
  pencil.clearRect(0, 0, width, height);
  pencil.font = `600 ${printSize}px "Archivo Variable", sans-serif`;
  pencil.fontStretch = 'condensed';
  pencil.letterSpacing = '0.6px';
  const ceiling = topOf(table) + measure.head;
  const drawn: Drawn = { pencil, state, now, scale, ceiling };
  let isChanging = false;
  for (const placed of inSight(table)) {
    const { frame } = placed;
    const alpha = placed.alpha.value * lights;
    if (frame.id !== state.hidden && alpha > 0) {
      const rect = {
        x: placed.x.value,
        y: placed.y.value - scroll,
        w: placed.w.value,
        h: placed.h.value,
      };
      pencil.globalAlpha = alpha;
      if (frame.crop !== null && rect.h >= cropFrom) {
        drawCrop(pencil, rect, frame.crop);
      }
      const isDrawing = drawMarks(drawn, frame, rect);
      if (measure.hasEdgePrint && !placed.isLeaving) {
        drawPrint(pencil, frame, rect, measure.gap);
      }
      const isPulsing = drawOutlines(drawn, frame, rect);
      isChanging = isChanging || isDrawing || isPulsing;
    }
  }
  pencil.globalAlpha = 1;
  return isChanging;
};
