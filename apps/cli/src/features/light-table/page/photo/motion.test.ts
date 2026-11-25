import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { quick } from '../motion/spring.ts';
import { makeMotion } from './motion.ts';
import type { View } from './plane.ts';

// The photo's way back to the table, which nothing may interrupt or lose:
// whatever is asked of the plane meanwhile, the table hears exactly once
// that the photo is back.

const frame = 1000 / 60;
const longest = 600;

/** A clock and frames that only move on when the test says so. */
const makeClock = () => {
  let now = 0;
  let next = 1;
  let waiting = new Map<number, (now: number) => void>();
  const real = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
    now: performance.now,
  };
  return {
    start: () => {
      now = 0;
      waiting = new Map();
      globalThis.requestAnimationFrame = (run) => {
        next += 1;
        waiting.set(next, run);
        return next;
      };
      globalThis.cancelAnimationFrame = (id) => {
        waiting.delete(id);
      };
      performance.now = () => now;
    },
    stop: () => {
      globalThis.requestAnimationFrame = real.request;
      globalThis.cancelAnimationFrame = real.cancel;
      performance.now = real.now;
    },
    /** Shows frames until none is asked for. Says how many it took. */
    run: (most = longest): number => {
      let shown = 0;
      while (waiting.size > 0 && shown < most) {
        const runs = [...waiting.values()];
        waiting.clear();
        now += frame;
        for (const each of runs) {
          each(now);
        }
        shown += 1;
      }
      return shown;
    },
    isWaiting: () => waiting.size > 0,
  };
};

const clock = makeClock();
const onTable: View = { x: 120, y: 340, s: 0.2 };
const open: View = { x: 0, y: 0, s: 1 };

const opened = () => {
  const seen: Array<View> = [];
  const motion = makeMotion((view) => {
    seen.push(view);
  });
  motion.jump(open);
  clock.run();
  return { motion, seen };
};

beforeEach(clock.start);
afterEach(clock.stop);

describe('going back to the table', () => {
  it('arrives at the frame and says so once', () => {
    const { motion, seen } = opened();
    let arrived = 0;
    motion.depart(
      () => onTable,
      () => {
        arrived += 1;
      },
    );
    expect(motion.isLeaving()).toBe(true);
    const frames = clock.run();
    expect(arrived).toBe(1);
    expect(frames * frame).toBeLessThan(800);
    expect(seen.at(-1)?.x).toBeCloseTo(onTable.x, 0);
    expect(seen.at(-1)?.s).toBeCloseTo(onTable.s, 1);
    expect(clock.isWaiting()).toBe(false);
  });

  it('isn’t turned around by anything asked of it on the way', () => {
    const { motion } = opened();
    let arrived = 0;
    let elsewhere = 0;
    motion.depart(
      () => onTable,
      () => {
        arrived += 1;
      },
    );
    clock.run(3);
    // A wheel, a finger, a key or a change of the window's size ask for
    // these while the photo is on its way.
    motion.travel(open, quick, () => {
      elsewhere += 1;
    });
    motion.jump(open);
    motion.push(4000, 4000);
    motion.show({ edit: 0 });
    expect(motion.target()).toEqual(onTable);
    clock.run();
    expect(arrived).toBe(1);
    expect(elsewhere).toBe(0);
  });

  it('is asked for once, however often Esc is pressed', () => {
    const { motion } = opened();
    const said: Array<string> = [];
    motion.depart(
      () => onTable,
      () => said.push('first'),
    );
    clock.run(2);
    motion.depart(
      () => open,
      () => said.push('second'),
    );
    clock.run();
    expect(said).toEqual(['first']);
  });

  it('follows the frame while the table moves, and arrives all the same', () => {
    const { motion } = opened();
    let arrived = 0;
    let { y } = onTable;
    motion.depart(
      () => {
        // The table scrolls on and on.
        y += 40;
        return { ...onTable, y };
      },
      () => {
        arrived += 1;
      },
    );
    const frames = clock.run();
    expect(arrived).toBe(1);
    // After a moment at the latest, however far the frame has gone.
    expect(frames * frame).toBeLessThan(800);
    expect(clock.isWaiting()).toBe(false);
  });
});

describe('going back when there is nothing to go back to', () => {
  it('arrives when the frame is no longer on the table', () => {
    const { motion } = opened();
    let arrived = 0;
    motion.depart(
      () => null,
      () => {
        arrived += 1;
      },
    );
    clock.run();
    expect(arrived).toBe(1);
  });

  it('says so at once when nothing moves any more', () => {
    const { motion } = opened();
    let arrived = 0;
    motion.stop();
    motion.depart(
      () => onTable,
      () => {
        arrived += 1;
      },
    );
    expect(arrived).toBe(1);
  });

  it('draws nothing after it has arrived', () => {
    const { motion, seen } = opened();
    motion.depart(
      () => onTable,
      () => undefined,
    );
    clock.run();
    const drawn = seen.length;
    motion.request();
    motion.show({ all: 0 });
    clock.run();
    expect(seen).toHaveLength(drawn);
  });
});
