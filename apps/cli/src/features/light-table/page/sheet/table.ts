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
import { nearestFrame } from './find.ts';
import { fittingFrame, largestFrame } from './fit.ts';
import { type Group, type Layout, layOut, type Rect } from './layout.ts';

// The table as it is right now: where every frame is on its way to, and
// where it is at this moment. Nothing here knows about the screen.

/** One frame on the table, with all that is drawn on it. */
export type Frame = {
  readonly id: string;
  readonly picture: Picture;
  /** Whether the lamp shines through it: it is in the album. */
  readonly isLit: boolean;
  readonly isMomentStart: boolean;
  readonly number: number;
  readonly time: string;
  readonly score: number | null;
  /** What the finished photo shows of it, when the whole frame is shown. */
  readonly crop: Box | null;
  readonly isFavorite: boolean;
  readonly marks: ReadonlyArray<Shown>;
  readonly isWorkedOn: boolean;
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

export type Table = {
  size: Size;
  content: Content;
  layout: Layout;
  /** The height of a frame, or `fit` for everything at once. */
  zoom: number | 'fit';
  readonly frame: Spring;
  anchor: Anchor | null;
  readonly placed: Map<string, Placed>;
  readonly papers: Map<string, Paper>;
  readonly scroller: Scroller;
  /** How bright the table is: 1, or 0 while one photo is looked at. */
  readonly lights: Spring;
  stiffness: Stiffness;
  isSettled: boolean;
  /** The frames with which everything fits, and what that was worked out for. */
  fit: {
    readonly content: Content;
    readonly size: Size;
    readonly frame: number;
  } | null;
};

export const groupsOf = (content: Content): ReadonlyArray<Group> =>
  content.map(({ key, frames }) => ({
    key,
    items: frames.map(({ id, picture, isMomentStart }) => ({
      id,
      aspect: picture.width / picture.height,
      isMomentStart,
    })),
  }));

export const makeTable = (): Table => ({
  size: { width: 1, height: 1, top: 0, pinned: 0, foot: 0 },
  content: [],
  layout: layOut([], 1, 1),
  zoom: 'fit',
  frame: springAt(0),
  anchor: null,
  placed: new Map(),
  papers: new Map(),
  scroller: scrollerAt(0),
  lights: springAt(1),
  stiffness: soft,
  isSettled: false,
  fit: null,
});

/** The frames with which everything is on the table at once. */
export const fitOf = (table: Table): number => {
  const { content, size, fit } = table;
  if (fit !== null && fit.content === content && fit.size === size) {
    return fit.frame;
  }
  const frame = fittingFrame(
    groupsOf(content),
    size.width,
    size.height - size.top,
  );
  table.fit = { content, size, frame };
  return frame;
};

/** The tallest a frame gets on this table. */
export const tallestOf = ({ size }: Table): number =>
  largestFrame(size.width, size.height - size.top);

export const frameLimits = (table: Table) => ({
  least: fitOf(table),
  most: tallestOf(table),
});

/** The layout of what lies on the table with frames of some height. */
export const layoutOf = (table: Table, frame: number): Layout =>
  layOut(groupsOf(table.content), table.size.width, frame, {
    top: table.size.top,
    tallest: tallestOf(table),
  });

/**
 * Where the table begins on the screen right now. The bars make way as it
 * is scrolled, down to what they keep.
 */
export const topOf = ({ size, scroller }: Table): number =>
  clamp(size.top - scroller.value, size.pinned, size.top);

export const scrollLimits = ({ layout, size }: Table) => ({
  least: 0,
  most: Math.max(0, layout.height + size.foot - size.height),
});

/** Where a frame is on the screen at this moment. */
export const onScreen = (table: Table, id: string): Rect | null => {
  const placed = table.placed.get(id);
  return placed === undefined
    ? null
    : {
        x: placed.x.value,
        y: placed.y.value - table.scroller.value,
        w: placed.w.value,
        h: placed.h.value,
      };
};

/** Where a frame will be on the screen once everything has arrived. */
export const restingOnScreen = (table: Table, id: string): Rect | null => {
  const rect = table.layout.rects.get(id);
  const scroll = table.scroller.target ?? table.scroller.value;
  return rect === undefined ? null : { ...rect, y: rect.y - scroll };
};

/** The point of the nearest frame that is under a point of the screen. */
export const anchorAt = (table: Table, x: number, y: number): Anchor | null => {
  const id = nearestFrame(table.layout, x, y + table.scroller.value);
  const rect = id === null ? null : onScreen(table, id);
  return id === null || rect === null
    ? null
    : { id, within: clamp((y - rect.y) / rect.h, 0, 1), screenY: y };
};

/** The frames that are at least partly on the screen. */
export const inSight = (table: Table): ReadonlyArray<Placed> => {
  const top = table.scroller.value;
  const bottom = top + table.size.height;
  const seen: Array<Placed> = [];
  for (const placed of table.placed.values()) {
    if (placed.y.value < bottom && placed.y.value + placed.h.value > top) {
      seen.push(placed);
    }
  }
  return seen;
};
