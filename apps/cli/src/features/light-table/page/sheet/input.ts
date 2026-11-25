import { follow, hold, speedOf, type Trail } from '../motion/scroller.ts';
import { clamp, rubberBand } from '../motion/spring.ts';
import type { Engine } from './engine.ts';
import { pileUnder } from './pile.ts';
import {
  frameLimits,
  frameUnder,
  type Held,
  heldAt,
  scrollLimits,
  type Table,
} from './table.ts';
import { letGo, stopAhead, zoomByHand, zoomToStop } from './zooming.ts';

// What the wheel, the trackpad and fingers do to the table: scroll it, and
// change the size of the frames about the point between the fingers.

type Doing = {
  readonly onOpen: (id: string) => void;
  /** Called with the photo in front of a pile whose corner was pressed. */
  readonly onPile: (front: string) => void;
  /** Called when the owner changed the size of the frames. */
  readonly onZoom: () => void;
};

/** How much a pixel of a pinch on a trackpad changes the size. */
const zoomPerPixel = 0.011;
const lineHeight = 18;
/** A wheel that turns in notches sends at least this much at once. */
const notch = 60;
/** A finger that moved less than this, in pixels, tapped. */
const slop = 8;
/** Spreading two fingers this much further at the largest size opens the photo. */
const openBy = 1.18;

type Finger = { x: number; y: number };

type Pinch = {
  held: Held;
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

/** By how much a pinch on a trackpad changes the size of the frames. */
const zoomOf = (event: WheelEvent): number =>
  Math.exp(-event.deltaY * zoomPerPixel);

/** After this long without a turn of the wheel, in milliseconds, the hand has let go. */
const wheelRest = 70;

const scrollBy = ({ table }: Engine, delta: number) => {
  const { least, most } = scrollLimits(table);
  const { scroller } = table;
  if (table.zooming !== null) {
    // The frames arrive first; a table that changes size isn't scrolled.
    return;
  }
  if (Math.abs(delta) >= notch) {
    // A notch of a wheel is a jump; the table glides there.
    const from = scroller.target ?? scroller.value;
    scroller.target = clamp(from + delta, least, most);
  } else {
    hold(scroller);
    scroller.value = clamp(scroller.value + delta, least, most);
  }
};

/** The stop a notch of the wheel leads to from where the frames are heading. */
const stopBeside = (table: Table, isLarger: boolean): number =>
  (table.zooming === null ? table.stop : stopAhead(table)) +
  (isLarger ? 1 : -1);

const wheeling = (element: HTMLElement, engine: Engine, doing: Doing) => {
  const { table } = engine;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const rest = () => {
    letGo(table);
    doing.onZoom();
    engine.request();
  };
  return (event: WheelEvent) => {
    event.preventDefault();
    const { x, y } = pointOf(element, event);
    if (event.ctrlKey || event.metaKey) {
      const held = heldAt(table, x, y);
      if (held === null) {
        return;
      }
      if (Math.abs(event.deltaY) >= notch) {
        // A wheel that turns in notches goes from stop to stop.
        zoomToStop(table, held, stopBeside(table, event.deltaY < 0));
        doing.onZoom();
      } else {
        zoomByHand(table, held, table.frame.value * zoomOf(event));
        clearTimeout(resting);
        resting = setTimeout(rest, wheelRest);
      }
    } else {
      scrollBy(engine, event.deltaY * (event.deltaMode === 1 ? lineHeight : 1));
    }
    engine.request();
  };
};

/** What pressing the corner of a pile does, said for the pointer that rests on it. */
const pileTitle = (table: Table, front: string): string => {
  const frame = table.placed.get(front)?.frame;
  const count = frame?.opened?.count ?? frame?.pile ?? 0;
  return frame?.opened === null || frame === undefined
    ? `${count} photos that show the same. Lay them out (Space)`
    : 'Put the stack together again (Space)';
};

/** Opens the photo at a point, or its pile when the corner of one is there. */
const press = (table: Table, doing: Doing, x: number, y: number) => {
  const pile = pileUnder(table, x, y);
  const id = frameUnder(table, x, y);
  if (pile !== null) {
    doing.onPile(pile);
  } else if (id !== null) {
    doing.onOpen(id);
  }
};

const hovering = (element: HTMLElement, engine: Engine) => {
  const { table, state } = engine;
  const set = (id: string | null, pile: string | null) => {
    if (state.hover !== id || state.hoverPile !== pile) {
      state.hover = id;
      state.hoverPile = pile;
      element.style.cursor = id === null ? '' : 'pointer';
      element.title = pile === null ? '' : pileTitle(table, pile);
      engine.request();
    }
  };
  return {
    over: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        const { x, y } = pointOf(element, event);
        state.isCursorShown = false;
        set(frameUnder(table, x, y), pileUnder(table, x, y));
      }
    },
    out: () => set(null, null),
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
    const held = heldAt(table, middle.x, middle.y);
    pinch =
      held === null ? null : { held, distance: middle.distance, beyond: 1 };
    isDragging = true;
  };

  const movePinch = (pinched: Pinch) => {
    const middle = between([...fingers.values()]);
    const ratio = middle.distance / Math.max(1, pinched.distance);
    const isLargest = table.frame.value >= frameLimits(table).most;
    pinched.beyond = isLargest && ratio > 1 ? pinched.beyond * ratio : 1;
    pinched.distance = middle.distance;
    zoomByHand(table, pinched.held, table.frame.value * ratio);
    // The table goes where the fingers go.
    const { held } = table.zooming?.memory ?? pinched;
    held.x = middle.x;
    held.y = middle.y;
    if (pinched.beyond > openBy) {
      const { id } = pinched.held;
      pinch = null;
      fingers.clear();
      letGo(table);
      doing.onOpen(id);
    }
  };

  const drag = (finger: Finger, at: number) => {
    if (table.zooming !== null) {
      // Once the frames have arrived the finger scrolls from where it is.
      from = { y: finger.y, scroll: table.scroller.value };
      return;
    }
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
        letGo(table);
        doing.onZoom();
        const [left] = fingers.values();
        from = { y: left?.y ?? 0, scroll: table.scroller.value };
        trail.length = 0;
      } else if (isDragging && fingers.size === 0) {
        table.scroller.velocity = -speedOf(trail, event.timeStamp);
      } else if (fingers.size === 0 && event.type === 'pointerup') {
        press(table, doing, finger.x, finger.y);
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
      // A tap was answered when the finger was lifted.
      const isMouse =
        !(event instanceof PointerEvent) || event.pointerType === 'mouse';
      if (isMouse) {
        press(engine.table, doing, x, y);
      }
    },
    options,
  );
  return () => ending.abort();
};
