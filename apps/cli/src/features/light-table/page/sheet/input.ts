import { follow, hold, speedOf, type Trail } from '../motion/scroller.ts';
import { clamp, quick, rubberBand } from '../motion/spring.ts';
import { zoomNow } from './arrange.ts';
import type { Engine } from './engine.ts';
import { frameAt } from './find.ts';
import { type Anchor, anchorAt, frameLimits, scrollLimits } from './table.ts';

// What the wheel, the trackpad and fingers do to the table: scroll it, and
// change the size of the frames about the point between the fingers.

type Doing = {
  readonly onOpen: (id: string) => void;
  /** Called when the owner changed the size of the frames. */
  readonly onZoom: () => void;
};

/** How much a pixel of a pinch on a trackpad changes the size. */
const zoomPerPixel = 0.011;
const zoomPerNotchPixel = 0.0028;
const lineHeight = 18;
/** A wheel that turns in notches sends at least this much at once. */
const notch = 60;
/** A finger that moved less than this, in pixels, tapped. */
const slop = 8;
/** Spreading two fingers this much further at the largest size opens the photo. */
const openBy = 1.18;

type Finger = { x: number; y: number };

type Pinch = {
  anchor: Anchor;
  distance: number;
  /** How much further the fingers spread than the frames could grow. */
  beyond: number;
};

const pointOf = (element: HTMLElement, event: MouseEvent): Finger => {
  const bounds = element.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
};

const between = (fingers: ReadonlyArray<Finger>) => {
  const [first = { x: 0, y: 0 }, second = first] = fingers;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
};

/** A wheel turns in notches, which are far more than a pinch sends. */
const zoomOf = (event: WheelEvent): number =>
  Math.exp(
    -event.deltaY *
      (Math.abs(event.deltaY) >= notch ? zoomPerNotchPixel : zoomPerPixel),
  );

const scrollBy = ({ table }: Engine, delta: number) => {
  const { least, most } = scrollLimits(table);
  const { scroller } = table;
  if (Math.abs(delta) >= notch) {
    // A notch of a wheel is a jump; the table glides there.
    const from = scroller.target ?? scroller.value;
    scroller.target = clamp(from + delta, least, most);
  } else {
    hold(scroller);
    scroller.value = clamp(scroller.value + delta, least, most);
  }
};

const wheeling = (element: HTMLElement, engine: Engine, doing: Doing) => {
  const { table } = engine;
  return (event: WheelEvent) => {
    event.preventDefault();
    const { x, y } = pointOf(element, event);
    if (event.ctrlKey || event.metaKey) {
      const anchor = anchorAt(table, x, y);
      if (anchor !== null) {
        zoomNow(table, zoomOf(event), anchor);
        doing.onZoom();
      }
    } else {
      scrollBy(engine, event.deltaY * (event.deltaMode === 1 ? lineHeight : 1));
    }
    engine.request();
  };
};

const hovering = (element: HTMLElement, engine: Engine) => {
  const { table, state } = engine;
  const set = (id: string | null) => {
    if (state.hover !== id) {
      state.hover = id;
      element.style.cursor = id === null ? '' : 'pointer';
      engine.request();
    }
  };
  return {
    over: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        const { x, y } = pointOf(element, event);
        state.isCursorShown = false;
        set(frameAt(table.layout, x, y + table.scroller.value));
      }
    },
    out: () => set(null),
  };
};

const touching = (element: HTMLElement, engine: Engine, doing: Doing) => {
  const { table } = engine;
  const fingers = new Map<number, Finger>();
  const trail: Trail = [];
  let from = { y: 0, scroll: 0 };
  let isDragging = false;
  let pinch: Pinch | null = null;

  const startPinch = () => {
    const middle = between([...fingers.values()]);
    const anchor = anchorAt(table, middle.x, middle.y);
    pinch =
      anchor === null ? null : { anchor, distance: middle.distance, beyond: 1 };
    isDragging = true;
  };

  const movePinch = (held: Pinch) => {
    const middle = between([...fingers.values()]);
    const ratio = middle.distance / Math.max(1, held.distance);
    const anchor = { ...held.anchor, screenY: middle.y };
    const isLargest = table.frame.value >= frameLimits(table).most;
    held.beyond = isLargest && ratio > 1 ? held.beyond * ratio : 1;
    held.distance = middle.distance;
    held.anchor = anchor;
    zoomNow(table, ratio, anchor);
    doing.onZoom();
    if (held.beyond > openBy) {
      pinch = null;
      fingers.clear();
      doing.onOpen(anchor.id);
    }
  };

  const drag = (finger: Finger, at: number) => {
    const { least, most } = scrollLimits(table);
    const wanted = from.scroll - (finger.y - from.y);
    const beyond = wanted - clamp(wanted, least, most);
    table.scroller.value =
      wanted - beyond + rubberBand(beyond, table.size.height);
    follow(trail, at, finger.y);
  };

  return {
    down: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        return;
      }
      element.setPointerCapture(event.pointerId);
      const finger = pointOf(element, event);
      fingers.set(event.pointerId, finger);
      hold(table.scroller);
      table.stiffness = quick;
      if (fingers.size === 2) {
        startPinch();
      } else {
        from = { y: finger.y, scroll: table.scroller.value };
        isDragging = false;
        trail.length = 0;
      }
    },
    move: (event: PointerEvent) => {
      const finger = fingers.get(event.pointerId);
      if (finger === undefined) {
        return;
      }
      Object.assign(finger, pointOf(element, event));
      if (pinch !== null && fingers.size === 2) {
        movePinch(pinch);
      } else if (fingers.size === 1 && pinch === null) {
        isDragging = isDragging || Math.abs(finger.y - from.y) > slop;
        if (isDragging) {
          drag(finger, event.timeStamp);
        }
      }
      engine.request();
    },
    up: (event: PointerEvent) => {
      const finger = fingers.get(event.pointerId);
      fingers.delete(event.pointerId);
      if (finger === undefined) {
        return;
      }
      if (pinch !== null) {
        // The finger that stays goes on scrolling from where it is.
        pinch = null;
        const [left] = fingers.values();
        from = { y: left?.y ?? 0, scroll: table.scroller.value };
        trail.length = 0;
      } else if (isDragging && fingers.size === 0) {
        table.scroller.velocity = -speedOf(trail, event.timeStamp);
      } else if (fingers.size === 0 && event.type === 'pointerup') {
        const id = frameAt(
          table.layout,
          finger.x,
          finger.y + table.scroller.value,
        );
        if (id !== null) {
          doing.onOpen(id);
        }
      }
      engine.request();
    },
  };
};

/** Lets the table be scrolled, zoomed and opened. Returns how to stop. */
export const listenToTable = (
  element: HTMLElement,
  engine: Engine,
  doing: Doing,
): (() => void) => {
  const ending = new AbortController();
  const options = { signal: ending.signal };
  const touch = touching(element, engine, doing);
  const hover = hovering(element, engine);
  element.addEventListener('wheel', wheeling(element, engine, doing), {
    ...options,
    passive: false,
  });
  element.addEventListener('pointerdown', touch.down, options);
  element.addEventListener('pointermove', touch.move, options);
  element.addEventListener('pointerup', touch.up, options);
  element.addEventListener('pointercancel', touch.up, options);
  element.addEventListener('pointermove', hover.over, options);
  element.addEventListener('pointerleave', hover.out, options);
  element.addEventListener(
    'click',
    (event) => {
      const { x, y } = pointOf(element, event);
      const id = frameAt(
        engine.table.layout,
        x,
        y + engine.table.scroller.value,
      );
      // A tap was answered when the finger was lifted.
      const isMouse =
        !(event instanceof PointerEvent) || event.pointerType === 'mouse';
      if (id !== null && isMouse) {
        doing.onOpen(id);
      }
    },
    options,
  );
  return () => ending.abort();
};
