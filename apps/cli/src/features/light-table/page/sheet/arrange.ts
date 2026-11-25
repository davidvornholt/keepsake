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
import type { Hold, Layout, Rect } from './layout.ts';
import {
  type Anchor,
  type Frame,
  layoutOf,
  type Placed,
  scrollLimits,
  stopsFor,
  type Table,
  viewAtRest,
} from './table.ts';
import { nearestStop } from './zoom.ts';
import { advanceZoom, endZoom } from './zooming.ts';

// How the table changes: frames travel to a new order, and the table
// scrolls to what is looked for.

const shiftAll = (table: Table, by: number) => {
  for (const placed of table.placed.values()) {
    placed.y.value += by;
  }
  for (const paper of table.papers.values()) {
    paper.y.value += by;
  }
};

/** Where a frame that comes out from under another one starts from. */
const startOf = (table: Table, frame: Frame, rect: Rect): Rect => {
  const front =
    frame.opened === null || frame.opened.isFront
      ? undefined
      : table.placed.get(frame.opened.front);
  return front === undefined
    ? rect
    : { x: front.x.value, y: front.y.value, w: front.w.value, h: rect.h };
};

const place = (table: Table, frame: Frame, rect: Rect) => {
  const known = table.placed.get(frame.id);
  if (known === undefined) {
    const from = startOf(table, frame, rect);
    const alpha = springAt(0);
    alpha.target = 1;
    const made = {
      frame,
      x: springAt(from.x),
      y: springAt(from.y),
      w: springAt(from.w),
      h: springAt(from.h),
      alpha,
      light: springAt(frame.isLit ? 1 : 0),
      isLeaving: false,
    };
    made.x.target = rect.x;
    made.y.target = rect.y;
    made.w.target = rect.w;
    made.h.target = rect.h;
    table.placed.set(frame.id, made);
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

/** Has a frame that is no longer shown go: back under the one it came from, if it did. */
const leave = (table: Table, placed: Placed) => {
  const { opened } = placed.frame;
  const front =
    opened === null || opened.isFront
      ? undefined
      : table.layout.rects.get(opened.front);
  if (front !== undefined) {
    placed.x.target = front.x;
    placed.y.target = front.y;
    placed.h.target = front.h;
    placed.w.target = (placed.w.value / Math.max(1, placed.h.value)) * front.h;
  }
  placed.isLeaving = true;
  placed.alpha.target = 0;
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

/**
 * Lays everything out anew, with frames as tall as the stop the table is
 * at. What is on the table keeps its place on the screen for now and
 * travels to the new one. An anchor keeps its height on the screen; a held
 * frame keeps its place across the table as well.
 */
export const arrange = (
  table: Table,
  anchor: Anchor | null = null,
  hold: Hold | null = null,
): void => {
  endZoom(table);
  const { content, scroller } = table;
  const stops = stopsFor(table);
  table.stop =
    table.zoom === 'fit' ? 0 : Math.max(1, nearestStop(stops, table.zoom));
  table.stop = Math.min(table.stop, stops.length - 1);
  table.frame.target = stops[table.stop] ?? table.frame.target;
  settle(table.frame);
  const layout = layoutOf(table, table.frame.value, hold);
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
      leave(table, placed);
    }
  }
  placePapers(table, layout);
  table.view = viewAtRest(table);
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

/** The bars make way as the table is scrolled down, and come back at its top. */
const tuckAway = (table: Table, scrolled: number) => {
  const { size, scroller, tuck } = table;
  const range = Math.max(0, size.top - size.pinned);
  const further = scrolled > 0 ? tuck.target + scrolled : tuck.target;
  tuck.target = clamp(Math.min(further, scroller.value), 0, range);
  if (scrolled !== 0) {
    // Under the wheel and the finger they move with the table.
    settle(tuck);
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
  const isZooming = advanceZoom(table, seconds, isStill);
  if (isStill) {
    arriveAll(table);
  }
  let isScrolling = false;
  if (table.zooming === null) {
    const before = table.scroller.value;
    isScrolling = advanceScroller(table.scroller, scrollLimits(table), seconds);
    tuckAway(table, table.scroller.value - before);
    table.view = viewAtRest(table);
  }
  const isTucking = step(table.tuck, quick, seconds);
  const isDimming = step(table.lights, calm, seconds);
  const isMoving = table.isSettled ? false : advanceFrames(table, seconds);
  table.isSettled = !isMoving;
  return isZooming || isScrolling || isTucking || isDimming || isMoving;
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
  // Below what is left of the bars, and of the heading of its sheet.
  const bars = size.top - table.tuck.target;
  const top = rect.y - bars - roomAround - table.layout.measure.head;
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
