import { calm } from '../motion/spring.ts';
import { makeGliding, type Shown } from './gliding.ts';
import type { View } from './plane.ts';

// Moves the plane a photo lies on, and takes it back to the table. Whatever
// the owner does next takes over from where things are, except on the way
// back: that one nothing may interrupt or forget.

/** However the table moves meanwhile, a photo is back on it after this long, in seconds. */
const longestLeave = 0.7;

type Leaving = {
  /** Where the frame it goes back to is right now. */
  readonly to: () => View | null;
  readonly then: () => void;
  seconds: number;
};

export const makeMotion = (
  onFrame: (view: View, shown: Shown, now: number) => void,
) => {
  let leaving: Leaving | null = null;

  const gliding = makeGliding(onFrame, {
    // On the way back, the frame is followed wherever the table takes it.
    before: (seconds) => {
      if (leaving === null) {
        return;
      }
      leaving.seconds += seconds;
      const to = leaving.to();
      if (to !== null) {
        gliding.aim(to);
      }
    },
    after: (isBusy) => {
      if (leaving !== null && !(isBusy && leaving.seconds <= longestLeave)) {
        arrive(leaving);
      }
    },
  });

  /** The photo is back on the table, which is said exactly once. */
  const arrive = ({ then }: Leaving) => {
    gliding.stop();
    then();
  };

  /** What is asked of the plane counts only until it is on its way back. */
  const unlessLeaving =
    <Asked extends ReadonlyArray<unknown>>(run: (...asked: Asked) => void) =>
    (...asked: Asked) => {
      if (leaving === null) {
        run(...asked);
      }
    };

  return {
    view: gliding.view,
    target: gliding.target,
    request: gliding.request,
    /** Puts the plane somewhere at once. */
    jump: unlessLeaving(gliding.jump),
    /** Lets the plane travel somewhere; `then` is called when it has arrived. */
    travel: unlessLeaving(gliding.travel),
    /** Gives the plane the speed the finger had when it let go. */
    push: unlessLeaving(gliding.push),
    /** Says how much of each layer is to be seen. */
    show: gliding.show,
    /**
     * Lets the plane travel back to a frame of the table, wherever that is
     * by then. From here on nothing else moves it, and `then` is called
     * once, when it has arrived or after a moment at the latest.
     */
    depart: (to: () => View | null, then: () => void) => {
      if (leaving !== null) {
        return;
      }
      if (gliding.isStopped()) {
        leaving = { to, then, seconds: 0 };
        then();
        return;
      }
      // The way so far ends here, and with it what was to follow it.
      gliding.travel(gliding.target(), calm);
      leaving = { to, then, seconds: 0 };
    },
    isLeaving: () => leaving !== null,
    flush: gliding.flush,
    stop: gliding.stop,
  };
};

export type Motion = ReturnType<typeof makeMotion>;
