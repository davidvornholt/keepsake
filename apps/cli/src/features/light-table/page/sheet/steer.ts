import { reveal, zoomTo } from './arrange.ts';
import type { Engine } from './engine.ts';
import { type Direction, nearestStaying, neighbour } from './find.ts';
import {
  type Anchor,
  anchorAt,
  type Content,
  frameLimits,
  inSight,
  topOf,
} from './table.ts';
import { frameOfShare, shareOfFrame, zoomStep } from './zoom.ts';

// What the keyboard and the controls of the bar do to the table: move the
// cursor from frame to frame, and change the size of the frames.

/** The frame in the middle of what is seen, which stays there while the frames change size. */
const middleOf = ({ table }: Engine) =>
  anchorAt(table, table.size.width / 2, (topOf(table) + table.size.height) / 2);

/**
 * What keeps its place when other frames are laid on the table: the frame
 * nearest to the middle that stays. A table that wasn't scrolled stays at
 * its top.
 */
export const stayingAnchor = (
  engine: Engine,
  content: Content,
): Anchor | null => {
  const { table } = engine;
  const middle = table.scroller.value <= 0 ? null : middleOf(engine);
  if (middle === null) {
    return null;
  }
  const staying = new Set(
    content.flatMap(({ frames }) => frames.map((frame) => frame.id)),
  );
  const id = nearestStaying(table.layout.order, middle.id, staying);
  if (id === null || id === middle.id) {
    return id === null ? null : middle;
  }
  const half = 0.5;
  return { id, within: half, screenY: middle.screenY };
};

/** The frame the keyboard starts from: the first one that is fully in sight. */
const firstInSight = ({ table }: Engine): string | null => {
  const top = table.scroller.value + topOf(table);
  const seen = inSight(table)
    .filter((placed) => placed.y.value >= top)
    .map((placed) => placed.frame.id);
  const known = new Set(seen);
  return table.layout.order.find((id) => known.has(id)) ?? null;
};

/** Moves the cursor a frame on. Says where it is now. */
export const moveCursor = (
  engine: Engine,
  direction: Direction,
): string | null => {
  const { table, state } = engine;
  const from = state.cursor ?? state.hover;
  const isKnown = from !== null && table.layout.rects.has(from);
  const next =
    isKnown && state.isCursorShown
      ? neighbour(table.layout, from, direction)
      : ((isKnown ? from : null) ?? firstInSight(engine));
  if (next !== null) {
    state.cursor = next;
    state.isCursorShown = true;
    reveal(table, next);
    engine.request();
  }
  return next;
};

/** The frame a key acts on: the one under the pointer, or the one the cursor is on. */
export const pointedAt = ({ table, state }: Engine): string | null => {
  const id = state.isCursorShown ? state.cursor : state.hover;
  return id !== null && table.layout.rects.has(id) ? id : null;
};

/** Makes the frames larger or smaller by a step, or as small as they get. */
export const zoomBy = (engine: Engine, direction: -1 | 0 | 1): void => {
  const { table } = engine;
  const from = table.frame.target;
  const next = direction === 0 ? 'fit' : from * zoomStep ** direction;
  zoomTo(table, next, middleOf(engine));
  engine.request();
};

/** Sets the size of the frames from a place on the slider. */
export const zoomToShare = (engine: Engine, share: number): void => {
  const { table } = engine;
  zoomTo(table, frameOfShare(share, frameLimits(table)), middleOf(engine));
  engine.request();
};

/** Where the slider stands for the size the frames have now. */
export const zoomShare = ({ table }: Engine): number =>
  shareOfFrame(table.frame.target, frameLimits(table));
