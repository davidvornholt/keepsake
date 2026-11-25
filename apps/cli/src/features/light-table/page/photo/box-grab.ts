import { type PointerEvent, type RefObject, useRef } from 'react';
import type { Box } from '../../contract.ts';
import type { Rect } from '../sheet/layout.ts';
import { type Handle, isSameBox, moved, resized } from './box-edit.ts';

// The pointer that has taken hold of a box: of the whole of it, which moves
// it, or of a side or corner, which pulls it.

/** The smallest a box gets, in pixels: what a finger can still take hold of. */
export const leastSide = 24;

type Wanted = {
  readonly boxes: ReadonlyArray<{ readonly box: Box }>;
  readonly onSelect: (at: number | null) => void;
  /** Called before a box is changed, so that the change can be undone. */
  readonly onRecord: () => void;
  readonly onBox: (at: number, box: Box) => void;
};

export type Grab = {
  readonly at: number;
  readonly part: Handle | 'whole';
  readonly from: { readonly x: number; readonly y: number };
  readonly box: Box;
  hasMoved: boolean;
};

/** Follows the pointer that has taken hold of a box. */
export const useGrab = (props: Wanted, photoRef: RefObject<Rect | null>) => {
  const grabRef = useRef<Grab | null>(null);
  const begin = (
    event: PointerEvent<HTMLElement>,
    at: number,
    part: Grab['part'],
  ) => {
    const box = props.boxes[at]?.box;
    if (box === undefined || (event.pointerType === 'mouse' && event.button)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    grabRef.current = {
      at,
      part,
      from: { x: event.clientX, y: event.clientY },
      box,
      hasMoved: false,
    };
    props.onSelect(at);
    // The keyboard goes with the hand, so that Delete removes this box.
    event.currentTarget
      .closest('[data-box]')
      ?.querySelector<HTMLElement>('[data-box-tag]')
      ?.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const grab = grabRef.current;
    const photo = photoRef.current;
    if (grab === null || photo === null) {
      return;
    }
    const by = {
      x: (event.clientX - grab.from.x) / Math.max(1, photo.w),
      y: (event.clientY - grab.from.y) / Math.max(1, photo.h),
    };
    const least = { x: leastSide / photo.w, y: leastSide / photo.h };
    const next =
      grab.part === 'whole'
        ? moved(grab.box, by)
        : resized(grab.box, grab.part, by, least);
    if (!grab.hasMoved && isSameBox(next, grab.box)) {
      return;
    }
    if (!grab.hasMoved) {
      grab.hasMoved = true;
      props.onRecord();
    }
    props.onBox(grab.at, next);
  };
  const end = () => {
    grabRef.current = null;
  };
  return { begin, move, end };
};

export type Holding = ReturnType<typeof useGrab>;

/** What takes hold of a box, wherever on it. */
export const holdOf = (holding: Holding, at: number, part: Grab['part']) => ({
  onPointerDown: (event: PointerEvent<HTMLElement>) =>
    holding.begin(event, at, part),
  onPointerMove: holding.move,
  onPointerUp: holding.end,
  onPointerCancel: holding.end,
});
