import { hold as holdScroller } from '../motion/scroller.ts';
import {
  clamp,
  critical,
  easeInOut,
  type Spring,
  settle,
  step,
} from '../motion/spring.ts';
import {
  type Held,
  layoutOf,
  type Memory,
  type Stage,
  stopsFor,
  type Table,
  type View,
  viewAtRest,
  type Zooming,
} from './table.ts';
import { betweenStops, nearestStop } from './zoom.ts';

// The frames changing size under the hand. The table is laid out for a few
// sizes only, the stops. Between two stops the layout of the nearer one is
// shown larger or smaller about the point that is held, so nothing on it
// moves against anything else; where the nearer stop changes, the next
// layout comes in over the one before. Frames that go to a stop on their
// own, as after a key, show the layout of that stop coming in over the one
// they left, all the way. Each layout is made so that the held frame lies
// where the hand has it, as nearly as its rows allow, and each is shown
// about the point of that frame that is held. The point keeps its height
// under the hand the whole time, and its place across the table as long as
// the table still reaches from one side of the window to the other.

/** How long one layout takes to come in over another, in seconds. */
const fadeTime = 0.11;
/**
 * How the frames go to a stop: fast enough that they lie still a fifth of a
 * second after the hand has let go, and without swinging past it.
 */
const firmTension = 3400;
const firm = critical(firmTension);
/** Closer than this, in pixels, the frames have arrived. */
const arrivedWithin = 0.2;

/** Moves a spring on. Says whether it still has a way to go. */
const glide = (spring: Spring, seconds: number): boolean => {
  const isMoving = step(spring, firm, seconds);
  if (isMoving && Math.abs(spring.target - spring.value) < arrivedWithin) {
    settle(spring);
    return false;
  }
  return isMoving;
};
/** How far past the middle between two stops the nearer one changes. */
const reluctance = 0.06;
const half = 0.5;
/** A pointer that moved less than this, in pixels, holds the same point. */
const samePoint = 2;

const stageIn = (
  layout: Stage['layout'],
  held: Held,
  stop: number,
  frame: number,
): Stage => {
  const rect = layout.rects.get(held.id);
  return rect === undefined
    ? { stop, layout, point: { x: held.x, y: 0 }, frame }
    : {
        stop,
        layout,
        point: {
          x: rect.x + rect.w * held.share,
          y: rect.y + rect.h * held.within,
        },
        frame,
      };
};

/**
 * The layout for frames of some height in which the held frame lies where
 * the hand has it. Rows that break for the held frame can make a table
 * longer; where that would have it no longer fit the window, fitting comes
 * first.
 */
const layoutHolding = (
  table: Table,
  held: Held,
  frame: number,
): Stage['layout'] => {
  const holding = layoutOf(table, frame, {
    id: held.id,
    share: held.share,
    x: held.x,
  });
  if (holding.height <= table.size.height) {
    return holding;
  }
  const plain = layoutOf(table, frame);
  return plain.height <= table.size.height ? plain : holding;
};

const stageOf = (table: Table, memory: Memory, stop: number): Stage => {
  const known = memory.stages.get(stop);
  if (known !== undefined) {
    return known;
  }
  const { held } = memory;
  const frame = stopsFor(table)[stop] ?? table.frame.value;
  const stage = stageIn(layoutHolding(table, held, frame), held, stop, frame);
  memory.stages.set(stop, stage);
  return stage;
};

/** Whether what was remembered is of the table as it lies now. */
const isCurrent = (table: Table, memory: Memory | null): memory is Memory =>
  memory !== null &&
  memory.stages.get(table.stop)?.layout === table.layout &&
  memory.scroll === table.scroller.value;

const memoryFor = (table: Table, held: Held, isMiddle: boolean): Memory => {
  const { memory } = table;
  if (isCurrent(table, memory)) {
    const isSame =
      memory.held.id === held.id &&
      Math.abs(memory.held.x - held.x) <= samePoint &&
      Math.abs(memory.held.y - held.y) <= samePoint;
    // The middle of the table is held by the same frame as the last time,
    // so that the way back leads to where it began.
    if (isSame || (isMiddle && memory.isMiddle)) {
      return memory;
    }
  }
  const frame = stopsFor(table)[table.stop] ?? table.frame.value;
  const stages = new Map([
    [table.stop, stageIn(table.layout, held, table.stop, frame)],
  ]);
  return { held: { ...held }, stages, isMiddle, scroll: table.scroller.value };
};

/** Puts every frame and sheet where the layout has it, at once. */
const lay = (table: Table, { layout, stop }: Stage) => {
  table.layout = layout;
  table.stop = stop;
  for (const [id, placed] of table.placed) {
    const rect = layout.rects.get(id);
    if (rect !== undefined) {
      for (const [spring, value] of [
        [placed.x, rect.x],
        [placed.y, rect.y],
        [placed.w, rect.w],
        [placed.h, rect.h],
      ] as const) {
        spring.target = value;
        settle(spring);
      }
    }
  }
  for (const { key, paper } of layout.sheets) {
    const known = table.papers.get(key);
    if (known !== undefined) {
      for (const [spring, value] of [
        [known.x, paper.x],
        [known.y, paper.y],
        [known.w, paper.w],
        [known.h, paper.h],
      ] as const) {
        spring.target = value;
        settle(spring);
      }
    }
  }
  table.isSettled = false;
};

/** Takes hold of a point of the table, unless one is held already. */
const begin = (table: Table, held: Held, isMiddle: boolean): Zooming => {
  if (table.zooming !== null) {
    // One change of size at a time: the point that is held stays the same.
    return table.zooming;
  }
  holdScroller(table.scroller);
  const memory = memoryFor(table, held, isMiddle);
  const now = stageOf(table, memory, table.stop);
  lay(table, now);
  const next: Zooming = {
    memory,
    isHeld: false,
    now,
    ghost: null,
    fade: 1,
    span: null,
  };
  table.zooming = next;
  table.memory = memory;
  return next;
};

/**
 * Shows the layout of another stop, which comes in over what is seen: over
 * the layout now, or over the one before when that is still most of it. Never
 * more than two are seen.
 */
const turnTo = (table: Table, zooming: Zooming, stop: number): boolean => {
  if (zooming.now.stop === stop) {
    return false;
  }
  const isFresh = zooming.ghost === null || zooming.fade >= half;
  if (isFresh) {
    zooming.ghost = zooming.now;
    zooming.fade = 0;
  }
  zooming.now = stageOf(table, zooming.memory, stop);
  lay(table, zooming.now);
  return isFresh;
};

/** Has the frames go to a stop on their own, its layout coming in on the way. */
const headFor = (table: Table, zooming: Zooming, stop: number) => {
  const stops = stopsFor(table);
  const to = stops[stop] ?? table.frame.value;
  zooming.isHeld = false;
  table.frame.target = to;
  const from = zooming.span?.from ?? table.frame.value;
  if (turnTo(table, zooming, stop)) {
    zooming.span = { from: table.frame.value, to };
  } else if (zooming.ghost !== null) {
    zooming.span = { from, to };
  }
};

/** Changes the height of the frames at once, as two fingers and a slider do. */
export const zoomByHand = (
  table: Table,
  held: Held,
  frame: number,
  isMiddle = false,
): void => {
  const stops = stopsFor(table);
  const zooming = begin(table, held, isMiddle);
  zooming.isHeld = true;
  zooming.span = null;
  table.frame.target = clamp(frame, stops[0] ?? frame, stops.at(-1) ?? frame);
  settle(table.frame);
};

/** Lets go: the frames come to rest at the nearest stop. */
export const letGo = (table: Table): void => {
  const { zooming } = table;
  if (zooming?.isHeld === true) {
    headFor(table, zooming, nearestStop(stopsFor(table), table.frame.value));
  }
};

/** Has the frames go to a stop, as a key does. */
export const zoomToStop = (
  table: Table,
  held: Held,
  stop: number,
  isMiddle = false,
): void => {
  const zooming = begin(table, held, isMiddle);
  headFor(table, zooming, clamp(stop, 0, stopsFor(table).length - 1));
};

/** The stop the frames are on their way to. */
export const stopAhead = (table: Table): number =>
  nearestStop(stopsFor(table), table.frame.target);

/** How a stage lies on the screen when the frames are some pixels tall. */
const viewOf = (
  table: Table,
  { memory }: Zooming,
  stage: Stage,
  frame: number,
): View => {
  const { size } = table;
  const { held } = memory;
  const k = frame / Math.max(1, stage.frame);
  // The table doesn't leave the bars, nor the foot of the window.
  const highest = size.top * (1 - k);
  const lowest = Math.min(
    highest,
    size.height - size.foot - stage.layout.height * k,
  );
  // Nor does it leave more of the window empty at its sides than being
  // smaller does: a larger table reaches both sides, a smaller one neither
  // goes beyond them.
  const spare = size.width * (1 - k);
  return {
    k,
    x: clamp(
      held.x - stage.point.x * k,
      Math.min(0, spare),
      Math.max(0, spare),
    ),
    y: clamp(held.y - stage.point.y * k, lowest, highest),
  };
};

/** The frames have arrived: the table lies as it does when nothing moves. */
const finish = (table: Table, zooming: Zooming) => {
  const stops = stopsFor(table);
  const { scroller } = table;
  scroller.value = -viewOf(table, zooming, zooming.now, zooming.now.frame).y;
  scroller.target = null;
  scroller.velocity = 0;
  table.zoom = table.stop === 0 ? 'fit' : (stops[table.stop] ?? 'fit');
  zooming.memory.scroll = scroller.value;
  table.zooming = null;
  table.ghost = null;
  table.fade = 1;
  table.view = viewAtRest(table);
};

/** Ends a change of size where it was heading, at once. */
export const endZoom = (table: Table): void => {
  const { zooming } = table;
  if (zooming === null) {
    return;
  }
  const stops = stopsFor(table);
  const stop = nearestStop(stops, table.frame.target);
  table.frame.target = stops[stop] ?? table.frame.target;
  settle(table.frame);
  zooming.now = stageOf(table, zooming.memory, stop);
  lay(table, zooming.now);
  finish(table, zooming);
};

/** The stop whose layout is shown for the height the frames have now. */
const nearerStop = (table: Table, zooming: Zooming): number => {
  const { lower, upper, share } = betweenStops(
    stopsFor(table),
    table.frame.value,
  );
  const isOnUpper = zooming.now.stop === upper;
  const turn = half + (isOnUpper ? -reluctance : reluctance);
  return share > turn ? upper : lower;
};

/** How far the way between two heights of frame a third one is, from 0 to 1. */
const shareOfWay = (
  { from, to }: NonNullable<Zooming['span']>,
  frame: number,
): number => {
  const whole = Math.log(to / from);
  return whole === 0 ? 1 : clamp(Math.log(frame / from) / whole, 0, 1);
};

/** How far the layout now has come in, some seconds on. */
const fadeAfter = (table: Table, zooming: Zooming, seconds: number): number =>
  zooming.span === null
    ? Math.min(1, zooming.fade + seconds / fadeTime)
    : easeInOut(shareOfWay(zooming.span, table.frame.value));

/**
 * Moves a change of size on by some seconds. Says whether one is under way.
 * For those who asked for less motion nothing glides or fades.
 */
export const advanceZoom = (
  table: Table,
  seconds: number,
  isStill: boolean,
): boolean => {
  const { zooming } = table;
  if (zooming === null) {
    return false;
  }
  if (isStill && !zooming.isHeld) {
    endZoom(table);
    return false;
  }
  const isGrowing = glide(table.frame, seconds);
  if (zooming.isHeld) {
    turnTo(table, zooming, nearerStop(table, zooming));
  }
  const height = table.frame.value;
  zooming.fade = isStill ? 1 : fadeAfter(table, zooming, seconds);
  if (zooming.fade >= 1) {
    zooming.ghost = null;
    zooming.span = null;
  }
  const { now, ghost } = zooming;
  table.view = viewOf(table, zooming, now, height);
  table.ghost =
    ghost === null
      ? null
      : { layout: ghost.layout, view: viewOf(table, zooming, ghost, height) };
  table.fade = zooming.fade;
  const isArrived = !(zooming.isHeld || isGrowing) && zooming.fade >= 1;
  if (isArrived) {
    finish(table, zooming);
  }
  return true;
};
