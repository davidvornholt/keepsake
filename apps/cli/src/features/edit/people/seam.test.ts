import { describe, expect, it } from 'bun:test';
import type { Plane, Planes } from '../pixels/raster.ts';
import { replacedPart } from './seam.ts';

const size = { width: 80, height: 80 };
type Place = (x: number, y: number) => boolean;

const plane = (value: (x: number, y: number) => number): Plane =>
  Float32Array.from({ length: size.width * size.height }, (_, index) =>
    value(index % size.width, Math.floor(index / size.width)),
  );
const grey = (value: (x: number, y: number) => number): Planes => [
  plane(value),
  plane(value),
  plane(value),
];
const within =
  (left: number, top: number, right: number, bottom: number): Place =>
  (x, y) =>
    x >= left && x < right && y >= top && y < bottom;

const isPerson = within(20, 20, 60, 80);
const nowhere: Place = () => false;

const skin = 0.4;
const wall = 0.1;
const person = plane((x, y) => (isPerson(x, y) ? 1 : 0));
const relit = grey((x, y) => (isPerson(x, y) ? skin : wall));
/** The person in the light of the surroundings. */
const darkSkin = 0.3;
const relitSurroundings = grey((x, y) => (isPerson(x, y) ? darkSkin : wall));

const replaced = (
  edit: Planes,
  {
    features = nowhere,
    surroundings = relitSurroundings,
  }: { readonly features?: Place; readonly surroundings?: Planes } = {},
) => {
  const part = replacedPart(
    person,
    plane((x, y) => (features(x, y) ? 1 : 0)),
    { edit, relit, relitSurroundings: surroundings },
    size,
  );
  return (x: number, y: number) => part[y * size.width + x] ?? 0;
};

describe('replacedPart', () => {
  it('replaces the person and leaves the edge to the edit', () => {
    const at = replaced(relit);
    expect(at(40, 50)).toBe(1);
    expect(at(24, 50)).toBe(1);
    expect(at(19, 50)).toBeLessThan(0.2);
    expect(at(10, 50)).toBe(0);
  });

  it('leaves the surroundings to the edit where an outline is wrong', () => {
    const isGap = within(20, 40, 36, 80);
    const at = replaced(
      grey((x, y) => (isPerson(x, y) && !isGap(x, y) ? skin : wall)),
      {
        surroundings: grey((x, y) =>
          isPerson(x, y) && !isGap(x, y) ? darkSkin : wall,
        ),
      },
    );
    expect(at(28, 60)).toBe(0);
    expect(at(45, 60)).toBe(1);
  });

  it('keeps the shape of a person whom the edit shows slimmer', () => {
    const isSlim = within(32, 20, 48, 80);
    const at = replaced(grey((x, y) => (isSlim(x, y) ? skin : wall)));
    expect(at(27, 60)).toBe(1);
    expect(at(53, 60)).toBe(1);
  });

  it('keeps a face even where the edit shows another one', () => {
    const isFace = within(34, 20, 46, 36);
    const edit = grey((x, y) => {
      if (isFace(x, y)) {
        return wall;
      }
      return isPerson(x, y) ? skin : wall;
    });
    expect(replaced(edit, { surroundings: edit })(40, 28)).toBe(0);
    expect(
      replaced(edit, { features: isFace, surroundings: edit })(40, 28),
    ).toBe(1);
  });

  it('keeps what differs but isn’t reached from the edge', () => {
    const isSpot = within(34, 40, 46, 52);
    const edit = grey((x, y) => {
      if (isSpot(x, y)) {
        return wall;
      }
      return isPerson(x, y) ? skin : wall;
    });
    expect(replaced(edit, { surroundings: edit })(40, 46)).toBe(1);
  });
});
