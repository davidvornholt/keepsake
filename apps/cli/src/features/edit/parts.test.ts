import { describe, expect, it } from 'bun:test';
import { inPhoto, partsOf } from './parts.ts';

describe('partsOf', () => {
  it('covers a photo with parts that reach into each other', () => {
    const parts = partsOf({ width: 3520, height: 2352 });
    expect(parts).toHaveLength(6);
    expect(parts[0]).toMatchObject({ left: 0, top: 0 });
    expect(parts[0]?.right).toBeGreaterThan(parts[1]?.left ?? 1);
    expect(parts[0]?.bottom).toBeGreaterThan(parts[3]?.top ?? 1);
    expect(parts[5]).toMatchObject({ right: 1, bottom: 1 });
  });

  it('leaves a small photo whole', () => {
    expect(partsOf({ width: 1000, height: 800 })).toEqual([
      { left: 0, top: 0, right: 1, bottom: 1 },
    ]);
  });
});

describe('inPhoto', () => {
  it('finds where a box in a part is in the photo', () => {
    expect(
      inPhoto(
        { left: 0.5, top: 0.5, right: 1, bottom: 1 },
        { left: 0, top: 0.5, right: 0.5, bottom: 1 },
      ),
    ).toEqual({ left: 0.5, top: 0.75, right: 0.75, bottom: 1 });
  });
});
