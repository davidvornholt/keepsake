import { reveal } from './arrange.ts';
import type { Engine } from './engine.ts';
import { type Direction, nearestStaying, neighbour } from './find.ts';
import {
  type Anchor,
  type Content,
  frameLimits,
  type Held,
  heldAt,
  inSight,
  stopsFor,
  topOf,
} from './table.ts';
import { frameOfShare, shareOfFrame, stopsPerPress } from './zoom.ts';
import { letGo, stopAhead, zoomByHand, zoomToStop } from './zooming.ts';

// What the keyboard and the controls of the bar do to the table: move the
// cursor from frame to frame, and change the size of the frames.

/** The frame in the middle of what is seen, which stays there while the frames change size. */
const middleOf = ({ table }: Engine): Held | null =>
  heldAt(table, table.size.width / 2, (topOf(table) + table.size.height) / 2);

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
  if (id === null) {
    return null;
  }
  const half = 0.5;
  return id === middle.id
    ? { id, within: middle.within, screenY: middle.y }
    : { id, within: half, screenY: middle.y };
};

/** The frame the keyboard starts from: the first one that is fully in sight. */
const firstInSight = ({ table }: Engine): string | null => {
  const top = topOf(table);
  const known = new Set(
    inSight(table)
      .filter(({ y }) => y >= top)
      .map(({ placed }) => placed.frame.id),
  );
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
  const middle = middleOf(engine);
  if (middle !== null) {
    const from = table.zooming === null ? table.stop : stopAhead(table);
    const next = direction === 0 ? 0 : from + direction * stopsPerPress;
    zoomToStop(table, middle, next, true);
    engine.request();
  }
};

/** Sets the size of the frames from a place on the slider, while it is held. */
export const zoomToShare = (engine: Engine, share: number): void => {
  const { table } = engine;
  const middle = middleOf(engine);
  if (middle !== null) {
    zoomByHand(table, middle, frameOfShare(share, frameLimits(table)), true);
    engine.request();
  }
};

/** The slider was let go. */
export const zoomLetGo = (engine: Engine): void => {
  letGo(engine.table);
  engine.request();
};

/** Where the slider stands for the size the frames have now. */
export const zoomShare = ({ table }: Engine): number =>
  shareOfFrame(table.frame.value, frameLimits(table));

/** The height of frame the table rests at or is on its way to, for keeping. */
export const zoomKept = ({ table }: Engine): number | 'fit' => {
  if (table.zooming === null) {
    return table.zoom;
  }
  const stop = stopAhead(table);
  return stop === 0 ? 'fit' : (stopsFor(table)[stop] ?? 'fit');
};
