import { advance as advanceScroller } from '../motion/scroller.ts';
import {
  calm,
  clamp,
  quick,
  type Spring,
  type Stiffness,
  settle,
  springAt,
  step,
} from '../motion/spring.ts';
import type { Layout, Rect } from './layout.ts';
import {
  type Anchor,
  type Frame,
  frameLimits,
  layoutOf,
  scrollLimits,
  type Table,
} from './table.ts';

// How the table changes: frames travel to a new order, grow and shrink
// about a point, and the table scrolls to what is looked for.

/** Grows or shrinks what lies on the table about a point of it. */
const scaleAbout = (table: Table, x: number, y: number, ratio: number) => {
  for (const placed of table.placed.values()) {
    placed.x.value = x + (placed.x.value - x) * ratio;
    placed.y.value = y + (placed.y.value - y) * ratio;
    placed.w.value *= ratio;
    placed.h.value *= ratio;
  }
  for (const paper of table.papers.values()) {
    paper.x.value = x + (paper.x.value - x) * ratio;
    paper.y.value = y + (paper.y.value - y) * ratio;
    paper.w.value *= ratio;
    paper.h.value *= ratio;
  }
};

const shiftAll = (table: Table, by: number) => {
  for (const placed of table.placed.values()) {
    placed.y.value += by;
  }
  for (const paper of table.papers.values()) {
    paper.y.value += by;
  }
};

const place = (table: Table, frame: Frame, rect: Rect) => {
  const known = table.placed.get(frame.id);
  if (known === undefined) {
    const alpha = springAt(0);
    alpha.target = 1;
    table.placed.set(frame.id, {
      frame,
      x: springAt(rect.x),
      y: springAt(rect.y),
      w: springAt(rect.w),
      h: springAt(rect.h),
      alpha,
      light: springAt(frame.isLit ? 1 : 0),
      isLeaving: false,
    });
    return;
  }
  known.frame = frame;
  known.isLeaving = false;
  known.x.target = rect.x;
  known.y.target = rect.y;
  known.w.target = rect.w;
  known.h.target = rect.h;
  known.alpha.target = 1;
  known.light.target = frame.isLit ? 1 : 0;
};

const placePapers = (table: Table, layout: Layout) => {
  const shown = new Set<string>();
  for (const { key, paper } of layout.sheets) {
    shown.add(key);
    const known = table.papers.get(key);
    if (known === undefined) {
      const alpha = springAt(0);
      alpha.target = 1;
      table.papers.set(key, {
        key,
        x: springAt(paper.x),
        y: springAt(paper.y),
        w: springAt(paper.w),
        h: springAt(paper.h),
        alpha,
        isLeaving: false,
      });
    } else {
      known.isLeaving = false;
      known.x.target = paper.x;
      known.y.target = paper.y;
      known.w.target = paper.w;
      known.h.target = paper.h;
      known.alpha.target = 1;
    }
  }
  for (const paper of table.papers.values()) {
    if (!shown.has(paper.key)) {
      paper.isLeaving = true;
      paper.alpha.target = 0;
    }
  }
};

/** Where the anchor's point is on the table as it is drawn right now. */
const pointOf = (table: Table, anchor: Anchor) => {
  const placed = table.placed.get(anchor.id);
  return placed === undefined
    ? null
    : {
        x: placed.x.value + placed.w.value / 2,
        y: placed.y.value + placed.h.value * anchor.within,
      };
};

/**
 * Lays everything out anew. What is on the table keeps its place on the
 * screen for now and travels to the new one; `ratio` says by how much the
 * frames grew since the last time.
 */
export const arrange = (
  table: Table,
  anchor: Anchor | null = null,
  ratio = 1,
): void => {
  const { content, scroller } = table;
  const point = anchor === null ? null : pointOf(table, anchor);
  if (point !== null && ratio !== 1) {
    scaleAbout(table, point.x, point.y, ratio);
  }
  const layout = layoutOf(table, table.frame.value);
  table.layout = layout;
  const target = anchor === null ? undefined : layout.rects.get(anchor.id);
  const wanted =
    anchor === null || target === undefined
      ? scroller.value
      : target.y + target.h * anchor.within - anchor.screenY;
  const { least, most } = scrollLimits(table);
  const next = clamp(wanted, least, most);
  shiftAll(table, next - scroller.value);
  scroller.value = next;
  const shown = new Set<string>();
  for (const frame of content.flatMap(({ frames }) => frames)) {
    const rect = layout.rects.get(frame.id);
    if (rect !== undefined) {
      shown.add(frame.id);
      place(table, frame, rect);
    }
  }
  for (const placed of table.placed.values()) {
    if (!shown.has(placed.frame.id)) {
      placed.isLeaving = true;
      placed.alpha.target = 0;
    }
  }
  placePapers(table, layout);
  table.isSettled = false;
};

/** Puts everything where it belongs at once, as when the page opens. */
export const settleAll = (table: Table): void => {
  for (const placed of table.placed.values()) {
    for (const spring of [placed.x, placed.y, placed.w, placed.h]) {
      settle(spring);
    }
  }
  for (const paper of table.papers.values()) {
    // The paper is there before anything lies on it.
    for (const spring of [paper.x, paper.y, paper.w, paper.h, paper.alpha]) {
      settle(spring);
    }
  }
};

const stepAll = (
  springs: ReadonlyArray<Spring>,
  stiffness: Stiffness,
  seconds: number,
): boolean => {
  let isMoving = false;
  for (const spring of springs) {
    isMoving = step(spring, stiffness, seconds) || isMoving;
  }
  return isMoving;
};

const advanceFrames = (table: Table, seconds: number): boolean => {
  let isMoving = false;
  for (const [id, placed] of table.placed) {
    const { x, y, w, h, alpha, light } = placed;
    const isOnItsWay = stepAll([x, y, w, h], table.stiffness, seconds);
    const isFading = stepAll([alpha, light], calm, seconds);
    isMoving = isMoving || isOnItsWay || isFading;
    if (placed.isLeaving && !isFading) {
      table.placed.delete(id);
    }
  }
  for (const [key, paper] of table.papers) {
    const isOnItsWay = stepAll(
      [paper.x, paper.y, paper.w, paper.h],
      table.stiffness,
      seconds,
    );
    const isFading = step(paper.alpha, calm, seconds);
    isMoving = isMoving || isOnItsWay || isFading;
    if (paper.isLeaving && !isFading) {
      table.papers.delete(key);
    }
  }
  return isMoving;
};

/** Puts every frame and paper where it belongs at once; what fades goes on. */
const arriveAll = (table: Table): void => {
  const { scroller, placed, papers } = table;
  if (scroller.target !== null) {
    scroller.value = scroller.target;
    scroller.target = null;
  }
  for (const { x, y, w, h } of [...placed.values(), ...papers.values()]) {
    for (const spring of [x, y, w, h]) {
      settle(spring);
    }
  }
};

/**
 * Moves everything on by some seconds. Says whether anything still moves.
 * For those who asked for less motion nothing travels: `isStill` has it
 * where it belongs at once, and what comes and goes only fades.
 */
export const advance = (
  table: Table,
  seconds: number,
  isStill = false,
): boolean => {
  const before = table.frame.value;
  if (isStill) {
    settle(table.frame);
  }
  const isZooming = step(table.frame, calm, seconds);
  if (table.frame.value !== before && before > 0) {
    arrange(table, table.anchor, table.frame.value / before);
  }
  if (isStill) {
    arriveAll(table);
  }
  const isScrolling = advanceScroller(
    table.scroller,
    scrollLimits(table),
    seconds,
  );
  const isDimming = step(table.lights, calm, seconds);
  const isMoving = table.isSettled ? false : advanceFrames(table, seconds);
  table.isSettled = !isMoving;
  return isZooming || isScrolling || isDimming || isMoving;
};

/** Starts changing the height of the frames, about an anchor. */
export const zoomTo = (
  table: Table,
  zoom: number | 'fit',
  anchor: Anchor | null,
): void => {
  const { least, most } = frameLimits(table);
  const frame = zoom === 'fit' ? least : clamp(zoom, least, most);
  table.zoom = frame <= least ? 'fit' : frame;
  table.anchor = anchor;
  table.frame.target = frame;
  table.stiffness = quick;
};

/** Changes the height of the frames at once, as two fingers do. */
export const zoomNow = (table: Table, ratio: number, anchor: Anchor): void => {
  const before = table.frame.value;
  zoomTo(table, before * ratio, anchor);
  settle(table.frame);
  if (before > 0 && table.frame.value !== before) {
    arrange(table, anchor, table.frame.value / before);
  }
};

const roomAround = 12;

/** Scrolls as little as needed to have a frame in sight. */
export const reveal = (table: Table, id: string, isAtOnce = false): void => {
  const rect = table.layout.rects.get(id);
  if (rect === undefined) {
    return;
  }
  const { size, scroller } = table;
  const from = scroller.target ?? scroller.value;
  // Once the table is scrolled the bars have made way.
  const top = rect.y - size.pinned - roomAround - table.layout.measure.head;
  const bottom = rect.y + rect.h + roomAround - size.height;
  const { least, most } = scrollLimits(table);
  const next = clamp(clamp(from, bottom, top), least, most);
  if (isAtOnce) {
    scroller.value = next;
    scroller.target = null;
  } else if (next !== from) {
    scroller.target = next;
  }
};
