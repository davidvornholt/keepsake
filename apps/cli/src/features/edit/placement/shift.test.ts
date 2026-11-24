import { describe, expect, it } from 'bun:test';
import { isBlock, picture } from '../pixels/test-pictures.ts';
import { shiftOf } from './shift.ts';

const size = { width: 900, height: 600 };
const frame = { left: 300, top: 200, width: 120, height: 80 };
const dark = 10;
const bright = 90;

const original = picture(size, (x, y) => (isBlock(x, y) ? bright : dark));

describe('shiftOf', () => {
  it.each([
    { x: 0, y: 0 },
    { x: 13, y: -6 },
    { x: -22, y: 17 },
  ])('finds by how much an edit moved something: %p', (shift) => {
    const edit = picture(size, (x, y) =>
      isBlock(x - shift.x, y - shift.y) ? 240 : 60,
    );
    expect(shiftOf(original, edit, frame)).toEqual(shift);
  });

  it('finds it at the edge of the picture', () => {
    const edit = picture(size, (x, y) => (isBlock(x - 5, y - 3) ? 240 : 60));
    const corner = { left: 0, top: 0, width: 120, height: 80 };
    expect(shiftOf(original, edit, corner)).toEqual({ x: 5, y: 3 });
  });

  it('moves nothing when the edit shows something else', () => {
    const edit = picture(size, () => 60);
    expect(shiftOf(original, edit, frame)).toEqual({ x: 0, y: 0 });
  });
});
