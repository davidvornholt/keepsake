import { describe, expect, it } from 'bun:test';
import { grown, inner, isInside, personMask } from './outline.ts';

const square = [
  { x: 0.2, y: 0.4 },
  { x: 0.6, y: 0.4 },
  { x: 0.6, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

describe('isInside', () => {
  it('tells inside from outside', () => {
    expect(isInside(square, { x: 0.4, y: 0.6 })).toBe(true);
    expect(isInside(square, { x: 0.7, y: 0.6 })).toBe(false);
    expect(isInside(square, { x: 0.4, y: 0.3 })).toBe(false);
  });

  it('follows a notch', () => {
    const notched = [...square, { x: 0.5, y: 0.6 }];
    expect(isInside(notched, { x: 0.25, y: 0.6 })).toBe(false);
    expect(isInside(notched, { x: 0.55, y: 0.6 })).toBe(true);
  });
});

const picture = { width: 100, height: 100 };
const frame = { left: 0, top: 0, width: 100, height: 100 };
const size = { width: 20, height: 20 };
const at = (mask: Float32Array, x: number, y: number) =>
  mask[y * size.width + x] ?? -1;

describe('personMask', () => {
  const person = {
    face: { left: 0.3, top: 0.1, right: 0.5, bottom: 0.5 },
    outline: square,
  };
  const mask = personMask(person, { picture, frame, size });

  it('has the outline and the face, which may be missing from it', () => {
    expect(at(mask, 8, 12)).toBe(1);
    expect(at(mask, 8, 4)).toBe(1);
    expect(at(mask, 15, 12)).toBe(0);
    // A corner of the face's box isn't part of the face.
    expect(at(mask, 6, 2)).toBe(0);
  });

  it('sees only the frame', () => {
    const right = { left: 60, top: 0, width: 40, height: 100 };
    expect(
      Math.max(...personMask(person, { picture, frame: right, size })),
    ).toBe(0);
  });
});

describe('grown and inner', () => {
  const person = {
    face: { left: 0.3, top: 0.4, right: 0.5, bottom: 0.6 },
    outline: square,
  };
  const mask = personMask(person, { picture, frame, size });

  it('reach further out and less far', () => {
    const shape = { grow: 1, edge: 0 };
    // The mask's right edge is at column 12.
    expect(at(grown(mask, size, shape), 13, 12)).toBe(1);
    expect(at(grown(mask, size, shape), 14, 12)).toBe(0);
    expect(at(inner(mask, size, shape), 9, 12)).toBe(1);
    expect(at(inner(mask, size, shape), 10, 12)).toBe(0);
  });

  it('have a soft edge', () => {
    const soft = at(grown(mask, size, { grow: 1, edge: 1 }), 14, 12);
    expect(soft).toBeGreaterThan(0);
    expect(soft).toBeLessThan(0.5);
  });
});
