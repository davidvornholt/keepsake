import { clamp } from '../motion/spring.ts';
import type { Rect } from './layout.ts';
import { frameUnder, onScreen, type Table } from './table.ts';

// A pile of photos that show the same, as it lies on the table: the one in
// front, and behind it the edges of the others, up and to the right.

/** How many edges show behind the photo in front, however many lie there. */
const mostEdges = 2;
const edgeShare = 0.035;
const leastEdge = 2;
const mostEdge = 6;
/** A frame lower than this is too small to show a pile. */
const pileFrom = 26;

export type Pile = {
  /** The photo in front, a little smaller than its frame. */
  readonly face: Rect;
  /** The photos behind, the furthest first. */
  readonly edges: ReadonlyArray<Rect>;
};

/** How a frame that stands for `count` photos lies in its place. */
export const pileIn = (rect: Rect, count: number): Pile => {
  const edges = rect.h < pileFrom ? 0 : Math.min(mostEdges, count - 1);
  if (edges <= 0) {
    return { face: rect, edges: [] };
  }
  const step = clamp(rect.h * edgeShare, leastEdge, mostEdge);
  const w = rect.w - step * edges;
  const h = rect.h - step * edges;
  return {
    face: { x: rect.x, y: rect.y + step * edges, w, h },
    edges: Array.from({ length: edges }, (_, at) => {
      const away = edges - at;
      return {
        x: rect.x + step * away,
        y: rect.y + step * (edges - away),
        w,
        h,
      };
    }),
  };
};

/** The corner of a pile that opens and closes it is at least this large, for a finger. */
const leastCorner = 28;
const mostCorner = 48;
const cornerShare = 0.45;

/** The lower right corner of a frame, where its pile is opened and closed. */
export const cornerOf = (rect: Rect): Rect => {
  const size = Math.min(
    rect.w,
    rect.h,
    clamp(Math.min(rect.w, rect.h) * cornerShare, leastCorner, mostCorner),
  );
  return {
    x: rect.x + rect.w - size,
    y: rect.y + rect.h - size,
    w: size,
    h: size,
  };
};

/**
 * The pile whose corner is at a point of the screen: the photo in front of
 * it, whether the pile is closed or lies open.
 */
export const pileUnder = (
  table: Table,
  x: number,
  y: number,
): string | null => {
  const id = frameUnder(table, x, y);
  const frame = id === null ? undefined : table.placed.get(id)?.frame;
  const rect = id === null ? null : onScreen(table, id);
  if (frame === undefined || rect === null) {
    return null;
  }
  const isPile = frame.pile > 1 || frame.opened?.isFront === true;
  const corner = cornerOf(pileIn(rect, frame.pile).face);
  const isOn =
    x >= corner.x &&
    y >= corner.y &&
    x <= corner.x + corner.w &&
    y <= corner.y + corner.h;
  return isPile && isOn ? frame.id : null;
};
