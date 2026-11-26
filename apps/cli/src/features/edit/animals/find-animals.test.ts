import { describe, expect, it } from 'bun:test';
import { isTooSmall } from './find-animals.ts';

const picture = { width: 3840, height: 2160 };
const box = (width: number, height: number) => ({
  left: 0.5,
  top: 0.5,
  right: 0.5 + width / picture.width,
  bottom: 0.5 + height / picture.height,
});

describe('an animal too small for the image model', () => {
  it('is a heron sitting far away in a palm', () => {
    expect(isTooSmall(box(18, 32), picture)).toBe(true);
  });

  it('is not a bird that fills a good part of the photo', () => {
    expect(isTooSmall(box(400, 300), picture)).toBe(false);
    expect(isTooSmall(box(60, 128), picture)).toBe(false);
  });

  it('is not a speck', () => {
    expect(isTooSmall(box(4, 6), picture)).toBe(false);
  });
});
