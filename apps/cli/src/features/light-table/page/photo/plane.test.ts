import { describe, expect, it } from 'bun:test';
import { sampleEdit, samplePhoto } from '../data/sample.ts';
import {
  around,
  boxOf,
  cover,
  fitted,
  keptIn,
  onScreen,
  planeOf,
  rectOf,
  zoomAbout,
} from './plane.ts';

const screen = { x: 100, y: 50, w: 800, h: 600 };

describe('planeOf', () => {
  it('lays the finished photo where it was cut out of the camera’s', () => {
    const photo = samplePhoto('a', {
      edit: {
        ...sampleEdit('a'),
        crop: { left: 0.25, top: 0.5, right: 0.75, bottom: 1 },
      },
    });
    const plane = planeOf(photo);
    const { width, height } = photo.picture;
    expect(plane.camera).toEqual({ x: 0, y: 0, w: width, h: height });
    expect(plane.edit).toEqual({
      x: width / 4,
      y: height / 2,
      w: width / 2,
      h: height / 2,
    });
    expect(plane.beyond).toEqual([]);
  });

  it('knows the strips that reach beyond the camera’s picture', () => {
    const photo = samplePhoto('a', {
      edit: {
        ...sampleEdit('a'),
        crop: { left: -0.1, top: 0, right: 1, bottom: 1.2 },
      },
    });
    const { beyond, camera } = planeOf(photo);
    expect(beyond).toHaveLength(2);
    expect(beyond[0]?.y).toBe(camera.h);
    expect(beyond[1]?.x).toBeCloseTo(-camera.w / 10);
    expect(beyond[1]?.h).toBe(camera.h);
  });

  it('has no finished photo where there is none', () => {
    expect(planeOf(samplePhoto('a')).edit).toBeNull();
  });
});

describe('views', () => {
  const part = { x: 200, y: 100, w: 400, h: 200 };

  it('fits a part into the middle of the screen', () => {
    const view = fitted(part, screen);
    expect(onScreen(part, view)).toEqual({ x: 100, y: 150, w: 800, h: 400 });
  });

  it('covers a frame of the table exactly', () => {
    const frame = { x: 10, y: 20, w: 40, h: 20 };
    expect(onScreen(part, cover(part, frame))).toEqual(frame);
  });

  it('zooms about a point that stays where it is', () => {
    const view = fitted(part, screen);
    const point = { x: 300, y: 200 };
    const closer = zoomAbout(view, 2, point);
    const before = {
      x: (point.x - view.x) / view.s,
      y: (point.y - view.y) / view.s,
    };
    expect(before.x * closer.s + closer.x).toBeCloseTo(point.x);
    expect(before.y * closer.s + closer.y).toBeCloseTo(point.y);
  });

  it('keeps a part that is larger than the screen over all of it', () => {
    const far = {
      ...zoomAbout(fitted(part, screen), 3, { x: 500, y: 350 }),
      x: 5000,
    };
    const shown = onScreen(part, keptIn(far, part, screen));
    expect(shown.x).toBe(screen.x);
    expect(shown.y).toBeLessThanOrEqual(screen.y);
    expect(shown.y + shown.h).toBeGreaterThanOrEqual(screen.y + screen.h);
  });

  it('puts a part that is smaller than the screen in its middle', () => {
    const shown = onScreen(part, keptIn({ x: 0, y: 0, s: 1 }, part, screen));
    expect(shown.x).toBe(300);
    expect(shown.y).toBe(250);
  });
});

describe('boxes', () => {
  it('turns fractions into a rectangle and back', () => {
    const inside = { x: 10, y: 20, w: 200, h: 100 };
    const box = { left: 0.1, top: 0.2, right: 0.6, bottom: 0.9 };
    const rect = rectOf(box, inside);
    expect(rect).toEqual({ x: 30, y: 40, w: 100, h: 70 });
    const back = boxOf(rect, inside);
    expect(back.left).toBeCloseTo(box.left);
    expect(back.bottom).toBeCloseTo(box.bottom);
  });

  it('finds the rectangle around two', () => {
    expect(
      around({ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 5, w: 10, h: 10 }),
    ).toEqual({ x: -5, y: 0, w: 15, h: 15 });
  });
});
