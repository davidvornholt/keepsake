import { describe, expect, it } from 'bun:test';
import { chunks } from './chunks.ts';
import { closeUpOf } from './close-up.ts';
import { chosen } from './cull.ts';

describe('chunks', () => {
  it('are as few and as even as possible', () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    const result = chunks(items, 10);
    expect(result.map(({ length }) => length)).toEqual([8, 7, 8]);
    expect(result.flat()).toEqual(items);
    expect(chunks(items.slice(0, 10), 10)).toHaveLength(1);
  });
});

describe('chosen', () => {
  it('ignores numbers that mean nothing and repeats', () => {
    expect(chosen(['a', 'b', 'c'], [3, 0, 3, 9, 1])).toEqual(['c', 'a']);
  });
});

describe('closeUpOf', () => {
  it('has room around what has to be sharp', () => {
    const box = closeUpOf({ left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 });
    expect(box.left).toBeCloseTo(0.34);
    expect(box.right).toBeCloseTo(0.66);
  });

  it('stays inside the photo and isn’t tiny', () => {
    const box = closeUpOf({ left: 0.99, top: -1, right: 1, bottom: 0.01 });
    expect(box.right).toBe(1);
    expect(box.top).toBe(0);
    expect(box.right - box.left).toBeCloseTo(0.15);
    expect(box.bottom - box.top).toBeCloseTo(0.15);
  });
});
