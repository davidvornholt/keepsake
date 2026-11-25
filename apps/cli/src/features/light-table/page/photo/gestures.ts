import { follow, speedOf, type Trail } from '../motion/scroller.ts';

// What a mouse, a trackpad and fingers do on a photo, told apart: a drag, a
// pinch, a tap, a turn of the wheel.

export type Point = { readonly x: number; readonly y: number };

export type Gestures = {
  /** A finger or the pressed mouse moved. `from` is where it went down. */
  readonly onDrag: (to: Point, from: Point, isTouch: boolean) => void;
  /** Two fingers moved: how much further apart, about where, and how far along. */
  readonly onPinch: (ratio: number, about: Point, by: Point) => void;
  /** Everything was let go, at this speed in pixels per second. */
  readonly onRelease: (speed: Point, isTouch: boolean) => void;
  readonly onTap: (at: Point, isTouch: boolean, isSecond: boolean) => void;
  readonly onWheel: (at: Point, by: Point, isZoom: boolean) => void;
};

/** A pointer that moved less than this, in pixels, didn't drag. */
const slop = 7;
/** Two taps within this time and distance are a double tap. */
const doubleTime = 320;
const doubleDistance = 28;
const lineHeight = 18;

type Finger = { x: number; y: number; readonly from: Point };

const middleOf = (fingers: ReadonlyArray<Finger>) => {
  const [first = { x: 0, y: 0 }, second = first] = fingers;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
};

const tracking = (element: HTMLElement, gestures: Gestures) => {
  const fingers = new Map<number, Finger>();
  const trailX: Trail = [];
  const trailY: Trail = [];
  let isDragging = false;
  let pinch: ReturnType<typeof middleOf> | null = null;
  let lastTap = { at: 0, x: 0, y: 0 };

  const pointOf = (event: MouseEvent): Point => {
    const bounds = element.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const tap = (event: PointerEvent, at: Point) => {
    const isSecond =
      event.timeStamp - lastTap.at < doubleTime &&
      Math.hypot(at.x - lastTap.x, at.y - lastTap.y) < doubleDistance;
    lastTap = { at: isSecond ? 0 : event.timeStamp, ...at };
    gestures.onTap(at, event.pointerType !== 'mouse', isSecond);
  };

  const moveOne = (event: PointerEvent, finger: Finger) => {
    const far = Math.hypot(finger.x - finger.from.x, finger.y - finger.from.y);
    isDragging = isDragging || far > slop;
    if (isDragging) {
      follow(trailX, event.timeStamp, finger.x);
      follow(trailY, event.timeStamp, finger.y);
      gestures.onDrag(finger, finger.from, event.pointerType !== 'mouse');
    }
  };

  return {
    down: (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      element.setPointerCapture(event.pointerId);
      const at = pointOf(event);
      fingers.set(event.pointerId, { ...at, from: at });
      trailX.length = 0;
      trailY.length = 0;
      if (fingers.size === 2) {
        pinch = middleOf([...fingers.values()]);
        isDragging = true;
      } else {
        isDragging = false;
      }
    },
    move: (event: PointerEvent) => {
      const finger = fingers.get(event.pointerId);
      if (finger === undefined) {
        return;
      }
      Object.assign(finger, pointOf(event));
      if (pinch !== null && fingers.size === 2) {
        const now = middleOf([...fingers.values()]);
        gestures.onPinch(now.distance / Math.max(1, pinch.distance), now, {
          x: now.x - pinch.x,
          y: now.y - pinch.y,
        });
        pinch = now;
      } else if (pinch === null && fingers.size === 1) {
        moveOne(event, finger);
      }
    },
    up: (event: PointerEvent) => {
      const finger = fingers.get(event.pointerId);
      if (finger === undefined) {
        return;
      }
      fingers.delete(event.pointerId);
      if (fingers.size > 0) {
        return;
      }
      const isTouch = event.pointerType !== 'mouse';
      if (isDragging || pinch !== null) {
        const speed =
          pinch === null
            ? {
                x: speedOf(trailX, event.timeStamp),
                y: speedOf(trailY, event.timeStamp),
              }
            : { x: 0, y: 0 };
        pinch = null;
        isDragging = false;
        gestures.onRelease(speed, isTouch);
      } else if (event.type === 'pointerup') {
        tap(event, finger);
      }
    },
    wheel: (event: WheelEvent) => {
      event.preventDefault();
      const lines = event.deltaMode === 1 ? lineHeight : 1;
      gestures.onWheel(
        pointOf(event),
        { x: event.deltaX * lines, y: event.deltaY * lines },
        event.ctrlKey || event.metaKey,
      );
    },
  };
};

/** Tells an element's gestures apart. Returns how to stop. */
export const listenToGestures = (
  element: HTMLElement,
  gestures: Gestures,
): (() => void) => {
  const ending = new AbortController();
  const options = { signal: ending.signal };
  const track = tracking(element, gestures);
  element.addEventListener('pointerdown', track.down, options);
  element.addEventListener('pointermove', track.move, options);
  element.addEventListener('pointerup', track.up, options);
  element.addEventListener('pointercancel', track.up, options);
  element.addEventListener('wheel', track.wheel, {
    ...options,
    passive: false,
  });
  return () => ending.abort();
};
