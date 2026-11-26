import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { makeControl } from './control.ts';
import { makeMotion } from './motion.ts';
import { restOf, type Setting } from './setting.ts';

// What a finger does to a photo that is looked at.

const realFrame = globalThis.requestAnimationFrame;

// Frames never come, so the photo stays where a gesture leaves it.
beforeEach(() => {
  globalThis.requestAnimationFrame = () => 0;
});
afterEach(() => {
  globalThis.requestAnimationFrame = realFrame;
});

const screen = { x: 0, y: 0, w: 600, h: 400 };

const opened = (isWriting: boolean) => {
  const setting: Setting = {
    plane: { camera: { x: 0, y: 0, w: 300, h: 200 }, edit: null, beyond: [] },
    room: screen,
    wide: screen,
    look: 'edit',
    full: 1,
    isDrawing: false,
    isWriting,
    wipe: 0.5,
  };
  const did: Array<string> = [];
  const motion = makeMotion(() => undefined);
  motion.jump(restOf(setting));
  const { gestures } = makeControl(motion, setting, {
    onSwipe: () => {
      did.push('turned');
      return true;
    },
    onDismiss: () => did.push('closed'),
    onPull: () => undefined,
    onBox: () => undefined,
    onDraft: () => undefined,
    onWipe: () => undefined,
  });
  return {
    did,
    swipe: () => {
      gestures.onDrag({ x: 300, y: 200 }, { x: 500, y: 200 }, true);
      gestures.onDrag({ x: 100, y: 200 }, { x: 500, y: 200 }, true);
      gestures.onRelease({ x: -2000, y: 0 }, true);
    },
    pull: () => {
      gestures.onDrag({ x: 300, y: 200 }, { x: 300, y: 50 }, true);
      gestures.onDrag({ x: 300, y: 350 }, { x: 300, y: 50 }, true);
      gestures.onRelease({ x: 0, y: 2000 }, true);
    },
  };
};

describe('a finger on the photo', () => {
  it('turns the page and closes the photo', () => {
    const photo = opened(false);
    photo.swipe();
    photo.pull();
    expect(photo.did).toEqual(['turned', 'closed']);
  });

  it('does neither while something is written about the photo', () => {
    const photo = opened(true);
    photo.swipe();
    photo.pull();
    expect(photo.did).toEqual([]);
  });
});
