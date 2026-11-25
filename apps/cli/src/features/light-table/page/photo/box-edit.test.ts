import { describe, expect, it } from 'bun:test';
import { handles, isSameBox, moved, nudged, resized } from './box-edit.ts';

const box = { left: 0.2, top: 0.3, right: 0.5, bottom: 0.7 };
const least = { x: 0.05, y: 0.08 };
const step = { x: 0.01, y: 0.02 };

const widthOf = (one: typeof box) => one.right - one.left;
const heightOf = (one: typeof box) => one.bottom - one.top;

describe('moved', () => {
  it('takes the whole box along, as large as it was', () => {
    const there = moved(box, { x: 0.1, y: -0.2 });
    expect(there.left).toBeCloseTo(0.3);
    expect(there.top).toBeCloseTo(0.1);
    expect(widthOf(there)).toBeCloseTo(widthOf(box));
    expect(heightOf(there)).toBeCloseTo(heightOf(box));
  });

  it('stops at the edge of the photo without getting smaller', () => {
    for (const by of [
      { x: 2, y: 2 },
      { x: -2, y: -2 },
      { x: 2, y: -2 },
    ]) {
      const there = moved(box, by);
      expect(there.left).toBeGreaterThanOrEqual(0);
      expect(there.top).toBeGreaterThanOrEqual(0);
      expect(there.right).toBeLessThanOrEqual(1);
      expect(there.bottom).toBeLessThanOrEqual(1);
      expect(widthOf(there)).toBeCloseTo(widthOf(box));
      expect(heightOf(there)).toBeCloseTo(heightOf(box));
    }
  });
});

describe('resized', () => {
  it('pulls one side and leaves the others', () => {
    expect(resized(box, 'e', { x: 0.1, y: 0.4 }, least)).toEqual({
      ...box,
      right: 0.6,
    });
    expect(resized(box, 'n', { x: 0.4, y: -0.1 }, least).top).toBeCloseTo(0.2);
    expect(resized(box, 'n', { x: 0.4, y: -0.1 }, least).left).toBe(box.left);
  });

  it('pulls a corner, the one opposite staying where it is', () => {
    const pulled = resized(box, 'nw', { x: -0.1, y: 0.1 }, least);
    expect(pulled.left).toBeCloseTo(0.1);
    expect(pulled.top).toBeCloseTo(0.4);
    expect(pulled.right).toBe(box.right);
    expect(pulled.bottom).toBe(box.bottom);
  });

  it('never leaves the photo', () => {
    for (const handle of handles) {
      for (const far of [-3, 3]) {
        const pulled = resized(box, handle, { x: far, y: far }, least);
        expect(pulled.left).toBeGreaterThanOrEqual(0);
        expect(pulled.top).toBeGreaterThanOrEqual(0);
        expect(pulled.right).toBeLessThanOrEqual(1);
        expect(pulled.bottom).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never gets smaller than can be grabbed, nor turns inside out', () => {
    for (const handle of handles) {
      for (const far of [-3, 3]) {
        const pulled = resized(box, handle, { x: far, y: far }, least);
        expect(widthOf(pulled)).toBeGreaterThanOrEqual(least.x - 1e-9);
        expect(heightOf(pulled)).toBeGreaterThanOrEqual(least.y - 1e-9);
      }
    }
  });

  it('has a handle for every side and corner', () => {
    expect(new Set(handles).size).toBe(8);
  });
});

describe('nudged', () => {
  const how = { isResizing: false, step, least };

  it('moves a box a step with an arrow key', () => {
    expect(nudged(box, 'ArrowLeft', how)?.left).toBeCloseTo(0.19);
    expect(nudged(box, 'ArrowDown', how)?.bottom).toBeCloseTo(0.72);
    expect(widthOf(nudged(box, 'ArrowRight', how) ?? box)).toBeCloseTo(
      widthOf(box),
    );
  });

  it('pulls the right or the lower side with shift held', () => {
    const resizing = { ...how, isResizing: true };
    expect(nudged(box, 'ArrowRight', resizing)).toEqual({
      ...box,
      right: 0.51,
    });
    expect(nudged(box, 'ArrowUp', resizing)?.bottom).toBeCloseTo(0.68);
    expect(nudged(box, 'ArrowUp', resizing)?.top).toBe(box.top);
  });

  it('does nothing for another key', () => {
    expect(nudged(box, 'Enter', how)).toBeNull();
    expect(nudged(box, 'a', how)).toBeNull();
  });
});

describe('isSameBox', () => {
  it('tells a box that was changed from one that wasn’t', () => {
    expect(isSameBox(box, { ...box })).toBe(true);
    expect(isSameBox(box, moved(box, { x: 0, y: 0 }))).toBe(true);
    expect(isSameBox(box, moved(box, { x: 0.01, y: 0 }))).toBe(false);
  });
});
