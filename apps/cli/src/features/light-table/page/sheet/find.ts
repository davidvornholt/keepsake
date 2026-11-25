import { clamp } from '../motion/spring.ts';
import type { Layout, Rect, Row } from './layout.ts';

// Finding frames on the table: the one at a point, the nearest one, and the
// one an arrow key leads to.

/** The frame at a point of the table, if there is one. */
export const frameAt = (
  { rects, rows, order }: Layout,
  x: number,
  y: number,
): string | null => {
  // Sheets that lie side by side have rows at the same height.
  const across = rows.filter(({ top, height }) => y >= top && y < top + height);
  return (
    across
      .flatMap(({ from, to }) => order.slice(from, to))
      .find((id) => {
        const rect = rects.get(id);
        return rect !== undefined && x >= rect.x && x < rect.x + rect.w;
      }) ?? null
  );
};

/** The frame whose middle is nearest to a point. */
export const nearestFrame = (
  { rects, order }: Layout,
  x: number,
  y: number,
): string | null => {
  let nearest: string | null = null;
  let least = Number.POSITIVE_INFINITY;
  for (const id of order) {
    const rect = rects.get(id);
    if (rect !== undefined) {
      const distance =
        Math.abs(rect.y + rect.h / 2 - y) * 2 +
        Math.abs(rect.x + rect.w / 2 - x);
      if (distance < least) {
        least = distance;
        nearest = id;
      }
    }
  }
  return nearest;
};

export type Direction = 'left' | 'right' | 'up' | 'down' | 'first' | 'last';

/** Rows this near in height lie in one line. */
const sameLine = 0.5;

/** The rows of the line above or below a row. */
const lineBeside = (
  rows: ReadonlyArray<Row>,
  row: Row,
  direction: 'up' | 'down',
): ReadonlyArray<Row> => {
  const way = direction === 'up' ? -1 : 1;
  const beyond = rows.filter(({ top }) => (top - row.top) * way > sameLine);
  const nearest = Math.min(...beyond.map(({ top }) => (top - row.top) * way));
  return beyond.filter(({ top }) => (top - row.top) * way - nearest < sameLine);
};

/** The frame of some rows that lies nearest above or below another one. */
const inRows = (
  layout: Layout,
  rows: ReadonlyArray<Row>,
  from: Rect,
): string | null => {
  const middle = from.x + from.w / 2;
  let best: string | null = null;
  let least = Number.POSITIVE_INFINITY;
  for (const id of rows.flatMap((row) =>
    layout.order.slice(row.from, row.to),
  )) {
    const rect = layout.rects.get(id);
    const distance =
      rect === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(rect.x + rect.w / 2 - middle);
    if (distance < least) {
      least = distance;
      best = id;
    }
  }
  return best;
};

/** The frame an arrow key leads to from another one. */
export const neighbour = (
  layout: Layout,
  id: string,
  direction: Direction,
): string | null => {
  const { order, rows, rects } = layout;
  const position = order.indexOf(id);
  const rect = rects.get(id);
  if (direction === 'first' || position === -1 || rect === undefined) {
    return order[0] ?? null;
  }
  if (direction === 'last') {
    return order.at(-1) ?? null;
  }
  if (direction === 'left' || direction === 'right') {
    const next = position + (direction === 'left' ? -1 : 1);
    return order[clamp(next, 0, order.length - 1)] ?? null;
  }
  const row = rows.find(({ from, to }) => position >= from && position < to);
  const beside = row === undefined ? [] : lineBeside(rows, row, direction);
  return beside.length === 0 ? id : inRows(layout, beside, rect);
};

/**
 * Of the frames that stay on the table, the one nearest in the order to a
 * frame that may not.
 */
export const nearestStaying = (
  order: ReadonlyArray<string>,
  from: string,
  staying: ReadonlySet<string>,
): string | null => {
  const at = order.indexOf(from);
  if (at === -1) {
    return null;
  }
  for (let away = 0; away < order.length; away += 1) {
    const found = [order[at - away], order[at + away]].find(
      (id) => id !== undefined && staying.has(id),
    );
    if (found !== undefined) {
      return found;
    }
  }
  return null;
};
