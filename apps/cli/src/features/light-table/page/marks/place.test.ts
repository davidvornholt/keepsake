import { describe, expect, it } from 'bun:test';
import { markBetween, markOnFrame, markOnPhoto } from './place.ts';

const frame = { x: 40, y: 300, w: 450, h: 300 };
const photo = { x: 120, y: 60, w: 1200, h: 800 };

describe('markBetween', () => {
  it('lies as the table draws it while the photo is on its frame', () => {
    expect(markBetween(frame, frame, 0)).toEqual(markOnFrame(frame));
  });

  it('lies as the photo draws it once the photo rests', () => {
    expect(markBetween(frame, photo, 1)).toEqual(markOnPhoto(photo));
  });

  it('goes on its way without a jump', () => {
    const half = markBetween(frame, photo, 0.5);
    const from = markOnFrame(frame);
    const to = markOnPhoto(photo);
    expect(half.size).toBeCloseTo((from.size + to.size) / 2);
    expect(half.x).toBeCloseTo((from.x + to.x) / 2);
    expect(half.y).toBeCloseTo((from.y + to.y) / 2);
  });
});
