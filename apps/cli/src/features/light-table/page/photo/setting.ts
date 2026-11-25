import { clamp, rubberBand } from '../motion/spring.ts';
import type { Rect } from '../sheet/layout.ts';
import { around, fitted, keptIn, type Plane, type View } from './plane.ts';

// What is set for a photo that is looked at, and what follows from it: where
// it rests, how close it may come, and what it may cover from close.

/** The finished photo, the camera's whole picture, or both with a divider. */
export type Look = 'edit' | 'before' | 'wipe';

export type Setting = {
  plane: Plane;
  /** Where on the screen the photo rests. */
  room: Rect;
  /** What it may cover once it is larger than that: all that is its own. */
  wide: Rect;
  look: Look;
  /** The scale at which one pixel of the picture is one of the screen. */
  full: number;
  /** Whether a drag draws a box on the photo. */
  isDrawing: boolean;
  /** Where the divider between before and after is, across the finished photo from 0 to 1. */
  wipe: number;
};

/** Beyond this share of the fitting size a photo counts as zoomed in. */
export const zoomedFrom = 1.03;
export const closest = 2;

/** The part of the plane that is looked at. */
export const partOf = ({ plane, look }: Setting): Rect => {
  const edit = plane.edit ?? plane.camera;
  return look === 'before' ? around(plane.camera, edit) : edit;
};

export const restOf = (setting: Setting): View =>
  fitted(partOf(setting), setting.room);

/** Where on the screen the divider between before and after stands. */
export const dividerOn = ({ plane, wipe }: Setting, view: View): number => {
  const edit = plane.edit ?? plane.camera;
  return view.x + (edit.x + edit.w * wipe) * view.s;
};

/** The share of the finished photo that lies left of a place on the screen. */
export const wipeAt = ({ plane }: Setting, view: View, x: number): number => {
  const edit = plane.edit ?? plane.camera;
  return clamp(((x - view.x) / view.s - edit.x) / edit.w, 0, 1);
};

export const mostScale = (setting: Setting): number =>
  Math.max(setting.full, restOf(setting).s) * closest;

export const isCloser = (setting: Setting, view: View): boolean =>
  view.s > restOf(setting).s * zoomedFrom;

/** The nearest view at which the photo leaves no room it could fill. */
export const kept = (setting: Setting, view: View): View =>
  keptIn(
    view,
    partOf(setting),
    isCloser(setting, view) ? setting.wide : setting.room,
  );

/** A view that follows the fingers past where it may rest, ever less. */
export const stretched = (view: View, setting: Setting): View => {
  const within = kept(setting, view);
  return {
    x: within.x + rubberBand(view.x - within.x, setting.room.w),
    y: within.y + rubberBand(view.y - within.y, setting.room.h),
    s: view.s,
  };
};
