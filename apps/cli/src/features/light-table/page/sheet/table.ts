import type { Box, Picture } from '../../contract.ts';
import type { Shown } from '../data/derive.ts';
import { type Scroller, scrollerAt } from '../motion/scroller.ts';
import {
  clamp,
  type Spring,
  type Stiffness,
  soft,
  springAt,
} from '../motion/spring.ts';
import { frameAt, nearestFrame } from './find.ts';
import { fittingFrame, largestFrame } from './fit.ts';
import {
  type Group,
  type Hold,
  type Layout,
  layOut,
  type Rect,
} from './layout.ts';
import { stopsOf } from './zoom.ts';

// The table as it is right now: where every frame is on its way to, and
// where it is at this moment. Nothing here knows about the screen.

/** One frame on the table, with all that is drawn on it. */
export type Frame = {
  readonly id: string;
  readonly picture: Picture;
  /** Whether the lamp shines through it: it is in the album. */
  readonly isLit: boolean;
  readonly number: number;
  readonly time: string;
  readonly score: number | null;
  /** What the finished photo shows of it, when the whole frame is shown. */
  readonly crop: Box | null;
  readonly isFavorite: boolean;
  readonly marks: ReadonlyArray<Shown>;
  readonly isWorkedOn: boolean;
  /**
   * How far it is in an album that was ordered: it waits to be edited, or
   * it is. Null for a photo that isn't part of an order.
   */
  readonly order: 'waits' | 'edited' | null;
  /** How many photos lie in its pile, itself included, when the pile is closed. */
  readonly pile: number;
  /**
   * Its part in a pile that lies open: the photo in front, or one from
   * behind it, which came out from under the front one.
   */
  readonly opened: {
    readonly front: string;
    readonly isFront: boolean;
    /** How many photos lie in the pile. */
    readonly count: number;
  } | null;
  /** Whether it lies a little apart from the frame before it. */
  readonly isApart: boolean;
};

export type Content = ReadonlyArray<{
  readonly key: string;
  readonly frames: ReadonlyArray<Frame>;
}>;

export type Placed = {
  frame: Frame;
  readonly x: Spring;
  readonly y: Spring;
  readonly w: Spring;
  readonly h: Spring;
  readonly alpha: Spring;
  readonly light: Spring;
  isLeaving: boolean;
};

export type Paper = {
  readonly key: string;
  readonly x: Spring;
  readonly y: Spring;
  readonly w: Spring;
  readonly h: Spring;
  readonly alpha: Spring;
  isLeaving: boolean;
};

export type Size = {
  readonly width: number;
  readonly height: number;
  /** The room the page's own bars take at the top. */
  readonly top: number;
  /** How much of that room they keep once the table is scrolled. */
  readonly pinned: number;
  /** The room something that floats over the foot of the table takes. */
  readonly foot: number;
};

/** A point of a frame that stays where it is on the screen. */
export type Anchor = {
  readonly id: string;
  /** How far down the frame the point is, from 0 to 1. */
  readonly within: number;
  readonly screenY: number;
};

/** A point of a frame that the hand holds while the frames change size. */
export type Held = {
  readonly id: string;
  /** Where in the frame the point is, across and down, from 0 to 1. */
  readonly share: number;
  readonly within: number;
  /** Where on the screen it is held. */
  x: number;
  y: number;
};

/** How the table lies on the screen: a point of it times `k`, moved by x and y. */
export type View = {
  readonly k: number;
  readonly x: number;
  readonly y: number;
};

/** The layout for one stop, and where the held point is in it. */
export type Stage = {
  readonly stop: number;
  readonly layout: Layout;
  readonly point: { readonly x: number; readonly y: number };
  /** The height of frame it was laid out for. */
  readonly frame: number;
};

/** The layouts a held point has been through, so that the way back is the same. */
export type Memory = {
  readonly held: Held;
  readonly stages: Map<number, Stage>;
  /** Whether the middle of the table was held, and no pointer. */
  readonly isMiddle: boolean;
  /** How far the table was scrolled when the frames came to rest. */
  scroll: number;
};

/** The frames changing size under the hand. */
export type Zooming = {
  readonly memory: Memory;
  /** Whether the hand is still on it. */
  isHeld: boolean;
  now: Stage;
  /** The layout that gives way to the one now, while both are seen. */
  ghost: Stage | null;
  /** How far the layout now has come in over the one before, from 0 to 1. */
  fade: number;
  /**
   * The heights of frame between which the layout now comes in, while the
   * frames go to a stop on their own. Null while the hand has them, when
   * it comes in over a moment of time.
   */
  span: { readonly from: number; readonly to: number } | null;
};

export type Table = {
  size: Size;
  content: Content;
  layout: Layout;
  /** The height of frame the owner chose, or `fit` for everything at once. */
  zoom: number | 'fit';
  /** Which of the stops the frames rest at. */
  stop: number;
  /** The height of a frame as the hand has it right now. */
  readonly frame: Spring;
  zooming: Zooming | null;
  memory: Memory | null;
  /** How the layout lies on the screen, and the one that gives way to it. */
  view: View;
  ghost: { readonly layout: Layout; readonly view: View } | null;
  fade: number;
  readonly placed: Map<string, Placed>;
  readonly papers: Map<string, Paper>;
  readonly scroller: Scroller;
  /** How far the bars have made way for the table. */
  readonly tuck: Spring;
  /** How bright the table is: 1, or 0 while one photo is looked at. */
  readonly lights: Spring;
  stiffness: Stiffness;
  isSettled: boolean;
  /** The frames with which everything fits, and what that was worked out for. */
  fit: {
    readonly content: Content;
    readonly size: Size;
    readonly frame: number;
    readonly stops: ReadonlyArray<number>;
  } | null;
};

export const groupsOf = (content: Content): ReadonlyArray<Group> =>
  content.map(({ key, frames }) => ({
    key,
    items: frames.map(({ id, picture, isApart }) => ({
      id,
      aspect: picture.width / picture.height,
      isApart,
    })),
  }));

export const makeTable = (): Table => ({
  size: { width: 1, height: 1, top: 0, pinned: 0, foot: 0 },
  content: [],
  layout: layOut([], 1, 1),
  zoom: 'fit',
  stop: 0,
  frame: springAt(0),
  zooming: null,
  memory: null,
  view: { k: 1, x: 0, y: 0 },
  ghost: null,
  fade: 1,
  placed: new Map(),
  papers: new Map(),
  scroller: scrollerAt(0),
  tuck: springAt(0),
  lights: springAt(1),
  stiffness: soft,
  isSettled: false,
  fit: null,
});

/** The tallest a frame gets on this table. */
export const tallestOf = ({ size }: Table): number =>
  largestFrame(size.width, size.height - size.top);

/**
 * Frames that fit above what floats at the foot of the table are worth
 * having while they keep this much of their height. A handful of photos
 * would lose more than that: they stay large, and the last of them is
 * scrolled out from under what floats.
 */
const keptAboveFoot = 0.7;

/** The frames with which everything is in sight at once, below the bars. */
const fittingOf = ({ content, size }: Table): number => {
  const groups = groupsOf(content);
  const room = size.height - size.top;
  const whole = fittingFrame(groups, size.width, room);
  if (size.foot === 0) {
    return whole;
  }
  const clear = fittingFrame(groups, size.width, room - size.foot);
  return clear >= whole * keptAboveFoot ? clear : whole;
};

const fitted = (table: Table) => {
  const { content, size, fit } = table;
  if (fit !== null && fit.content === content && fit.size === size) {
    return fit;
  }
  const frame = fittingOf(table);
  const stops = stopsOf({ least: frame, most: tallestOf(table) });
  const next = { content, size, frame, stops };
  table.fit = next;
  return next;
};

/** The frames with which everything is on the table at once. */
export const fitOf = (table: Table): number => fitted(table).frame;

export const frameLimits = (table: Table) => ({
  least: fitOf(table),
  most: Math.max(fitOf(table), tallestOf(table)),
});

/** The heights the frames of this table come to rest at. */
export const stopsFor = (table: Table): ReadonlyArray<number> =>
  fitted(table).stops;

/** The layout of what lies on the table with frames of some height. */
export const layoutOf = (
  table: Table,
  frame: number,
  hold: Hold | null = null,
): Layout =>
  layOut(groupsOf(table.content), table.size.width, frame, {
    top: table.size.top,
    tallest: tallestOf(table),
    hold,
  });

/** Where the table begins on the screen right now: below what is left of the bars. */
export const topOf = ({ size, tuck }: Table): number => size.top - tuck.value;

export const scrollLimits = ({ layout, size }: Table) => ({
  least: 0,
  most: Math.max(0, layout.height + size.foot - size.height),
});

/** How the table lies on the screen while nothing changes the size of its frames. */
export const viewAtRest = ({ scroller }: Table): View => ({
  k: 1,
  x: 0,
  y: -scroller.value,
});

export const throughView = ({ k, x, y }: View, rect: Rect): Rect => ({
  x: rect.x * k + x,
  y: rect.y * k + y,
  w: rect.w * k,
  h: rect.h * k,
});

/** The point of the table that is at a point of the screen. */
export const toTable = (
  { view }: Table,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } => ({
  x: (x - view.x) / view.k,
  y: (y - view.y) / view.k,
});

/** Where a frame is on the screen at this moment. */
export const onScreen = (table: Table, id: string): Rect | null => {
  const placed = table.placed.get(id);
  return placed === undefined
    ? null
    : throughView(table.view, {
        x: placed.x.value,
        y: placed.y.value,
        w: placed.w.value,
        h: placed.h.value,
      });
};

/** Where a frame will be on the screen once everything has arrived. */
export const restingOnScreen = (table: Table, id: string): Rect | null => {
  const rect = table.layout.rects.get(id);
  const scroll = table.scroller.target ?? table.scroller.value;
  return rect === undefined ? null : { ...rect, y: rect.y - scroll };
};

/** The frame at a point of the screen, if there is one. */
export const frameUnder = (
  table: Table,
  x: number,
  y: number,
): string | null => {
  const point = toTable(table, x, y);
  return frameAt(table.layout, point.x, point.y);
};

/**
 * The point of the nearest frame that is under a point of the screen, or
 * the nearest point of that frame when the screen shows none there: what is
 * held is always a point of a photo, so that it can stay where it is.
 */
export const heldAt = (table: Table, x: number, y: number): Held | null => {
  const point = toTable(table, x, y);
  const id = nearestFrame(table.layout, point.x, point.y);
  const rect = id === null ? null : onScreen(table, id);
  if (id === null || rect === null) {
    return null;
  }
  const share = clamp((x - rect.x) / rect.w, 0, 1);
  const within = clamp((y - rect.y) / rect.h, 0, 1);
  return {
    id,
    share,
    within,
    x: rect.x + rect.w * share,
    y: rect.y + rect.h * within,
  };
};

/** The same point, for where only its height on the screen matters. */
export const anchorAt = (table: Table, x: number, y: number): Anchor | null => {
  const held = heldAt(table, x, y);
  return held === null
    ? null
    : { id: held.id, within: held.within, screenY: held.y };
};

/** A frame as it is seen on the screen at this moment. */
export type Seen = Rect & { readonly placed: Placed };

/** The frames that are at least partly on the screen. */
export const inSight = (table: Table): ReadonlyArray<Seen> => {
  const { view } = table;
  const bottom = table.size.height;
  const seen: Array<Seen> = [];
  for (const placed of table.placed.values()) {
    const y = placed.y.value * view.k + view.y;
    const h = placed.h.value * view.k;
    if (y < bottom && y + h > 0) {
      seen.push({
        placed,
        x: placed.x.value * view.k + view.x,
        y,
        w: placed.w.value * view.k,
        h,
      });
    }
  }
  return seen;
};

/** The frames of the layout that gives way, where they are still seen. */
export const ghostInSight = (table: Table): ReadonlyArray<Seen> => {
  const { ghost } = table;
  if (ghost === null) {
    return [];
  }
  const bottom = table.size.height;
  const seen: Array<Seen> = [];
  for (const [id, rect] of ghost.layout.rects) {
    const placed = table.placed.get(id);
    const there = throughView(ghost.view, rect);
    if (placed !== undefined && there.y < bottom && there.y + there.h > 0) {
      seen.push({ placed, ...there });
    }
  }
  return seen;
};
