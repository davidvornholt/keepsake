import { describe, expect, it } from 'bun:test';
import {
  distanceFrom,
  fading,
  frameAround,
  shiftable,
  withRoom,
} from './frames.ts';

const picture = { width: 200, height: 100 };
const frame = { left: 50, top: 40, width: 20, height: 10 };

describe('frameAround', () => {
  it('has every pixel of a box and at least one', () => {
    expect(
      frameAround(
        { left: 0.251, top: 0.4, right: 0.349, bottom: 0.5 },
        picture,
      ),
    ).toEqual(frame);
    expect(
      frameAround({ left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }, picture),
    ).toMatchObject({ width: 1, height: 1 });
  });
});

describe('withRoom', () => {
  it('ends at the edges of the picture', () => {
    expect(withRoom(frame, 45, picture)).toEqual({
      left: 5,
      top: 0,
      width: 110,
      height: 95,
    });
  });
});

describe('shiftable', () => {
  it('leaves out what a shift moves out of the picture', () => {
    expect(
      shiftable({ left: 0, top: 0, ...picture }, { x: -8, y: 5 }, picture),
    ).toEqual({ left: 8, top: 0, width: 192, height: 95 });
  });
});

describe('distanceFrom', () => {
  it('is 0 inside and grows outside', () => {
    expect(distanceFrom(frame, 50, 40)).toBe(0);
    expect(distanceFrom(frame, 69, 49)).toBe(0);
    expect(distanceFrom(frame, 72, 53)).toBe(5);
  });
});

describe('fading', () => {
  it('goes from 1 to 0', () => {
    expect(fading(10, 10, 20)).toBe(1);
    expect(fading(20, 10, 20)).toBe(0.5);
    expect(fading(30, 10, 20)).toBe(0);
  });
});
