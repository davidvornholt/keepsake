import type { Box } from '../../contract.ts';
import { calm, clamp, glide, quick } from '../motion/spring.ts';
import type { Rect } from '../sheet/layout.ts';
import { prefersReducedMotion } from '../ui/theme.ts';
import type { Gestures, Point } from './gestures.ts';
import type { Motion } from './motion.ts';
import { boxOf, onScreen, type View, zoomAbout } from './plane.ts';
import {
  closest,
  dividerOn,
  isCloser,
  kept,
  mostScale,
  restOf,
  type Setting,
  stretched,
  wipeAt,
  zoomedFrom,
} from './setting.ts';

// What a photo does when it is looked at: where it rests, how it follows the
// fingers, and what a gesture means in the state it is in.

/** How a photo comes in from the side: how far off it starts, and how fast it moves. */
export type Entry = { readonly x: number; readonly speed: number };

export type Wanted = {
  /** Turns the page. `entry` is how far the finger had come, and how fast. */
  readonly onSwipe: (direction: -1 | 1, entry: Entry) => boolean;
  readonly onDismiss: () => void;
  /** How far a finger has pulled the photo towards closing, from 0 to 1. */
  readonly onPull: (share: number) => void;
  readonly onBox: (box: Box) => void;
  readonly onDraft: (draft: Rect | null) => void;
  readonly onWipe: (share: number) => void;
};

type Doing = 'nothing' | 'pan' | 'swipe' | 'dismiss' | 'box' | 'wipe';

/** How much a pixel of a pinch on a trackpad or a notch of a wheel zooms. */
const zoomPerPixel = 0.011;
const wheelZoom = 0.0025;
const notch = 60;
/** Pinched smaller than this share of the fitting size, a photo closes. */
const closeBelow = 0.72;
const swipeShare = 0.2;
const swipeSpeed = 520;
const dismissDistance = 110;
const dismissSpeed = 720;
const dismissShrink = 0.45;
const glideTime = 0.16;
const wipeReach = 28;
const leastBox = 12;
const settleAfter = 140;
const leaveTime = 160;

const dragging = (motion: Motion, setting: Setting, wanted: Wanted) => {
  let doing: Doing = 'nothing';
  let from: View = motion.view();
  let draft: Rect | null = null;

  const begin = (to: Point, start: Point, isTouch: boolean): Doing => {
    from = motion.view();
    const across = Math.abs(to.x - start.x);
    const down = to.y - start.y;
    const divider = dividerOn(setting, from);
    if (setting.isDrawing) {
      return 'box';
    }
    if (setting.look === 'wipe' && Math.abs(start.x - divider) < wipeReach) {
      return 'wipe';
    }
    if (from.s > restOf(setting).s * zoomedFrom) {
      return 'pan';
    }
    if (!isTouch || setting.isWriting) {
      return 'nothing';
    }
    return across > Math.abs(down) || down < 0 ? 'swipe' : 'dismiss';
  };

  const draftOf = (to: Point, start: Point): Rect => ({
    x: Math.min(to.x, start.x),
    y: Math.min(to.y, start.y),
    w: Math.abs(to.x - start.x),
    h: Math.abs(to.y - start.y),
  });

  const move = (to: Point, start: Point) => {
    const by = { x: to.x - start.x, y: to.y - start.y };
    if (doing === 'box') {
      draft = draftOf(to, start);
      wanted.onDraft(draft);
    } else if (doing === 'wipe') {
      wanted.onWipe(wipeAt(setting, motion.view(), to.x));
    } else if (doing === 'pan') {
      motion.jump(
        stretched({ ...from, x: from.x + by.x, y: from.y + by.y }, setting),
      );
    } else if (doing === 'swipe') {
      motion.jump({ ...from, x: from.x + by.x });
    } else if (doing === 'dismiss') {
      const share = clamp(by.y / setting.room.h, 0, 1);
      wanted.onPull(share);
      motion.jump(
        zoomAbout(
          { ...from, x: from.x + by.x, y: from.y + by.y },
          1 - share * dismissShrink,
          to,
        ),
      );
    }
  };

  return {
    /** Says what the drag does. */
    onDrag: (to: Point, start: Point, isTouch: boolean): Doing => {
      if (doing === 'nothing') {
        doing = begin(to, start, isTouch);
      }
      move(to, start);
      return doing;
    },
    /** Ends the drag. Returns what it was, and how far it went. */
    end: () => {
      const was = doing;
      const drawn = draft;
      const view = motion.view();
      doing = 'nothing';
      draft = null;
      return { was, drawn, by: { x: view.x - from.x, y: view.y - from.y } };
    },
  };
};

type Parts = {
  readonly motion: Motion;
  readonly setting: Setting;
  readonly wanted: Wanted;
};

/** Lets go of the photo: it glides on, turns the page, closes, or comes back. */
const releasing = ({ motion, setting, wanted }: Parts) => {
  const settle = () => {
    const rest = restOf(setting);
    const view = motion.target();
    const most = mostScale(setting);
    if (view.s <= rest.s) {
      motion.travel(rest, quick);
    } else if (view.s > most) {
      const middle = {
        x: setting.room.x + setting.room.w / 2,
        y: setting.room.y + setting.room.h / 2,
      };
      const closer = zoomAbout(view, most / view.s, middle);
      motion.travel(kept(setting, closer), quick);
    } else {
      motion.travel(kept(setting, view), quick);
    }
  };

  const afterPan = (speed: Point) => {
    const view = motion.view();
    const on = {
      ...view,
      x: view.x + glide(speed.x, glideTime),
      y: view.y + glide(speed.y, glideTime),
    };
    motion.push(speed.x, speed.y);
    motion.travel(kept(setting, on), calm);
  };

  const afterSwipe = (by: Point, speed: Point) => {
    const isFar = Math.abs(by.x) > setting.room.w * swipeShare;
    const isFast = Math.abs(speed.x) > swipeSpeed && speed.x * by.x > 0;
    const hasTurned =
      (isFar || isFast) &&
      wanted.onSwipe(by.x < 0 ? 1 : -1, { x: by.x, speed: speed.x });
    if (!hasTurned) {
      motion.push(speed.x, 0);
      motion.travel(restOf(setting), quick);
    }
  };

  const afterPull = (by: Point, speed: Point) => {
    if (by.y > dismissDistance || speed.y > dismissSpeed) {
      wanted.onDismiss();
    } else {
      wanted.onPull(0);
      motion.travel(restOf(setting), quick);
    }
  };

  return { settle, afterPan, afterSwipe, afterPull };
};

const zooming = ({ motion, setting }: Parts) => {
  const by = (ratio: number, about: Point) => {
    const view = motion.view();
    const least = restOf(setting).s * closeBelow;
    const to = clamp(view.s * ratio, least, mostScale(setting) * closest);
    motion.jump(stretched(zoomAbout(view, to / view.s, about), setting));
  };
  return {
    by,
    isZoomed: () => isCloser(setting, motion.target()),
    /** Goes to full size about a point, or back to the whole photo. */
    toggle: (about: Point) => {
      const rest = restOf(setting);
      if (isCloser(setting, motion.target())) {
        motion.travel(rest, quick);
        return;
      }
      const full =
        setting.full > rest.s * zoomedFrom ? setting.full : rest.s * closest;
      const closer = zoomAbout(rest, full / rest.s, about);
      motion.travel(kept(setting, closer), quick);
    },
  };
};

/** The box a drag drew, in fractions of the finished photo: the part of it on the photo. */
const drawnBox = ({ motion, setting }: Parts, drawn: Rect): Box | null => {
  const part = onScreen(
    setting.plane.edit ?? setting.plane.camera,
    motion.view(),
  );
  const box = boxOf(drawn, part);
  const inside = {
    left: clamp(box.left, 0, 1),
    top: clamp(box.top, 0, 1),
    right: clamp(box.right, 0, 1),
    bottom: clamp(box.bottom, 0, 1),
  };
  const wide = (inside.right - inside.left) * part.w;
  const tall = (inside.bottom - inside.top) * part.h;
  return Math.min(wide, tall) < leastBox ? null : inside;
};

/** What happens when everything is let go. */
const released = (
  parts: Parts,
  { was, by, drawn }: ReturnType<ReturnType<typeof dragging>['end']>,
  speed: Point,
) => {
  const { motion, setting, wanted } = parts;
  const release = releasing(parts);
  const isTiny = motion.view().s < restOf(setting).s * closeBelow * zoomedFrom;
  if (was === 'box') {
    const box = drawn === null ? null : drawnBox(parts, drawn);
    wanted.onDraft(null);
    if (box !== null) {
      wanted.onBox(box);
    }
  } else if (was === 'pan') {
    release.afterPan(speed);
  } else if (was === 'swipe') {
    release.afterSwipe(by, speed);
  } else if (was === 'dismiss') {
    release.afterPull(by, speed);
  } else if (isTiny) {
    // Two fingers pinched the photo small: it goes back to the table.
    wanted.onDismiss();
  } else if (was === 'nothing') {
    release.settle();
  }
};

export const makeControl = (
  motion: Motion,
  setting: Setting,
  wanted: Wanted,
) => {
  const parts = { motion, setting, wanted };
  const drag = dragging(motion, setting, wanted);
  const release = releasing(parts);
  const zoom = zooming(parts);
  let settling = 0;
  let isAside = false;
  const onRelease = (speed: Point) => {
    // A photo on its way back to the table has been let go of already.
    const ended = drag.end();
    if (!motion.isLeaving()) {
      released(parts, ended, speed);
    }
  };

  const gestures: Gestures = {
    onDrag: (to, start, isTouch) => {
      if (!motion.isLeaving()) {
        const doing = drag.onDrag(to, start, isTouch);
        isAside = doing === 'swipe' || (doing === 'nothing' && isAside);
      }
    },
    onPinch: (ratio, about, by) => {
      if (motion.isLeaving()) {
        return;
      }
      isAside = false;
      const view = motion.view();
      motion.jump({ ...view, x: view.x + by.x, y: view.y + by.y });
      zoom.by(ratio, about);
    },
    onRelease,
    onTap: (at, _, isSecond) => {
      if (isSecond && !motion.isLeaving()) {
        isAside = false;
        zoom.toggle(at);
      }
    },
    onWheel: (at, by, isZoom) => {
      if (motion.isLeaving()) {
        return;
      }
      const isNotch = Math.abs(by.y) >= notch;
      if (isZoom || isNotch) {
        zoom.by(Math.exp(-by.y * (isNotch ? wheelZoom : zoomPerPixel)), at);
      } else if (zoom.isZoomed()) {
        const view = motion.view();
        const moved = { ...view, x: view.x - by.x, y: view.y - by.y };
        motion.jump(kept(setting, moved));
      }
      clearTimeout(settling);
      settling = Number(
        setTimeout(() => {
          if (!motion.isLeaving()) {
            release.settle();
          }
        }, settleAfter),
      );
    },
  };

  return {
    gestures,
    zoom,
    /** Whether the photo comes in from the side, or is pulled there. */
    isAside: () => isAside,
    /** Opens the photo: from a frame of the table, from the side, or in place. */
    enter: (from: View | null, entry: Entry | null) => {
      const rest = restOf(setting);
      isAside = entry !== null;
      if (prefersReducedMotion() || (from === null && entry === null)) {
        motion.jump(rest);
      } else if (from !== null) {
        motion.jump(from);
        motion.travel(rest, calm);
      } else if (entry !== null) {
        motion.jump({ ...rest, x: rest.x + entry.x });
        motion.push(entry.speed, 0);
        motion.travel(rest, quick);
      }
      // Where it is shows before the next frame, so no frame shows it elsewhere.
      motion.flush();
    },
    /**
     * Moves to where the photo rests now, as when the window changes. A
     * photo that was looked at from close stays as close, on the same spot.
     */
    rest: (isAtOnce: boolean, wasClose: boolean) => {
      const to =
        wasClose && zoom.isZoomed()
          ? kept(setting, motion.target())
          : restOf(setting);
      if (isAtOnce || prefersReducedMotion()) {
        motion.jump(to);
      } else {
        motion.travel(to, calm);
      }
    },
    /**
     * Lets the photo travel back to its frame on the table, wherever the
     * table takes that meanwhile. From here on the photo takes no input, and
     * nothing can keep `then` from being called.
     */
    leave: (to: () => View | null, then: () => void) => {
      isAside = false;
      clearTimeout(settling);
      drag.end();
      if (to() === null || prefersReducedMotion()) {
        motion.show({ all: 0 });
        motion.depart(
          () => null,
          () => undefined,
        );
        setTimeout(then, leaveTime);
      } else {
        motion.depart(to, then);
      }
    },
  };
};

export type Control = ReturnType<typeof makeControl>;
