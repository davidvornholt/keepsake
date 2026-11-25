import {
  calm,
  type Spring,
  type Stiffness,
  settle,
  springAt,
  step,
} from '../motion/spring.ts';
import type { View } from './plane.ts';

// Moves the plane a photo lies on. Everything is a spring, so whatever the
// owner does next takes over from where things are, at the speed they have.

/** How much of each layer is to be seen, from 0 to 1. */
export type Shown = {
  /** The camera's picture under the finished photo. */
  readonly camera: number;
  /** The finished photo. */
  readonly edit: number;
  /** Everything: 0 while the photo isn't there yet. */
  readonly all: number;
};

type Names = keyof Shown;

const longestFrame = 0.05;
const millisecond = 1000;

export const makeMotion = (
  onFrame: (view: View, shown: Shown, now: number) => void,
) => {
  const place = { x: springAt(0), y: springAt(0), s: springAt(1) };
  const looks: Record<Names, Spring> = {
    camera: springAt(0),
    edit: springAt(1),
    all: springAt(1),
  };
  let stiffness = calm;
  let waiting = 0;
  let last = 0;
  let atRest: (() => void) | null = null;
  let isStopped = false;

  const viewOf = (): View => ({
    x: place.x.value,
    y: place.y.value,
    s: place.s.value,
  });

  const draw = (now: number) =>
    onFrame(
      viewOf(),
      {
        camera: looks.camera.value,
        edit: looks.edit.value,
        all: looks.all.value,
      },
      now,
    );

  const tick = (now: number) => {
    waiting = 0;
    // A frame's time can lie before the moment it was asked for.
    const seconds = Math.max(
      0,
      Math.min((now - last) / millisecond, longestFrame),
    );
    last = now;
    let isMoving = false;
    for (const spring of Object.values(place)) {
      isMoving = step(spring, stiffness, seconds) || isMoving;
    }
    let isFading = false;
    for (const spring of Object.values(looks)) {
      isFading = step(spring, calm, seconds) || isFading;
    }
    draw(now);
    // Drawing may have asked for the next frame already.
    if ((isMoving || isFading) && waiting === 0) {
      waiting = requestAnimationFrame(tick);
    }
    if (!isMoving && atRest !== null) {
      const then = atRest;
      atRest = null;
      then();
    }
  };

  const request = () => {
    if (waiting === 0 && !isStopped) {
      last = performance.now();
      waiting = requestAnimationFrame(tick);
    }
  };

  return {
    view: viewOf,
    target: (): View => ({
      x: place.x.target,
      y: place.y.target,
      s: place.s.target,
    }),
    request,
    /** Puts the plane somewhere at once. */
    jump: (view: View) => {
      for (const name of ['x', 'y', 's'] as const) {
        place[name].value = view[name];
        place[name].target = view[name];
        place[name].velocity = 0;
      }
      atRest = null;
      request();
    },
    /** Lets the plane travel somewhere; `then` is called when it has arrived. */
    travel: (view: View, how: Stiffness, then: (() => void) | null = null) => {
      stiffness = how;
      place.x.target = view.x;
      place.y.target = view.y;
      place.s.target = view.s;
      atRest = then;
      request();
    },
    /** Gives the plane the speed the finger had when it let go. */
    push: (x: number, y: number) => {
      place.x.velocity = x;
      place.y.velocity = y;
    },
    /** Says how much of each layer is to be seen. */
    show: (shown: Partial<Shown>, isAtOnce = false) => {
      for (const [name, value] of Object.entries(shown)) {
        const spring = looks[name as Names];
        spring.target = value;
        if (isAtOnce) {
          settle(spring);
        }
      }
      request();
    },
    stop: () => {
      isStopped = true;
      cancelAnimationFrame(waiting);
    },
  };
};

export type Motion = ReturnType<typeof makeMotion>;
