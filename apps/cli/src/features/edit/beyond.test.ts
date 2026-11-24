import { describe, expect, it } from 'bun:test';
import { wholePicture } from '../../shared/boxes.ts';
import { edgesBeyond, frameBox, isCompleted, isMostlyPhoto } from './beyond.ts';

describe('frameBox', () => {
  it('lets a frame reach beyond the photo', () => {
    const box = { left: -0.15, top: 0, right: 0.9, bottom: 1.1 };
    expect(frameBox(box)).toEqual(box);
  });

  it('stops a quarter beyond each edge', () => {
    expect(frameBox({ left: -2, top: -0.3, right: 1.5, bottom: 9 })).toEqual({
      left: -0.25,
      top: -0.25,
      right: 1.25,
      bottom: 1.25,
    });
  });

  it('leaves out steps too small to invent anything for', () => {
    expect(
      frameBox({ left: -0.03, top: -0.01, right: 1.02, bottom: 1.2 }),
    ).toEqual({ left: 0, top: 0, right: 1, bottom: 1.2 });
  });

  it('reads a box whose sides are the wrong way round', () => {
    expect(frameBox({ left: 0.8, top: 1.1, right: 0.2, bottom: 0.1 })).toEqual({
      left: 0.2,
      top: 0.1,
      right: 0.8,
      bottom: 1.1,
    });
  });
});

describe('isMostlyPhoto', () => {
  it('is true for any frame inside the photo', () => {
    expect(
      isMostlyPhoto({ left: 0.4, top: 0.4, right: 0.5, bottom: 0.5 }),
    ).toBe(true);
  });

  it('is false when too much would have to be invented', () => {
    expect(isMostlyPhoto({ ...wholePicture, left: -0.2 })).toBe(true);
    expect(
      isMostlyPhoto({ left: -0.25, top: -0.25, right: 1, bottom: 1 }),
    ).toBe(false);
  });
});

describe('edgesBeyond', () => {
  it('is nothing for a frame inside the photo', () => {
    expect(edgesBeyond(wholePicture)).toBeNull();
  });

  it('names the edges', () => {
    expect(edgesBeyond({ ...wholePicture, top: -0.1 })).toBe('top edge');
    expect(edgesBeyond({ left: -0.1, top: 0, right: 1.1, bottom: 1.2 })).toBe(
      'left, right and bottom edges',
    );
  });
});

describe('isCompleted', () => {
  // The photo ends at 0.9 of the crop's width.
  const crop = { left: 0.1, top: 0, right: 1.1, bottom: 1 };

  it('is what the edge of the photo cuts off', () => {
    const box = { left: 0.8, top: 0.4, right: 0.899, bottom: 0.6 };
    expect(isCompleted(box, crop)).toBe(true);
  });

  it('is nothing that the photo shows whole', () => {
    const box = { left: 0.6, top: 0.4, right: 0.8, bottom: 0.6 };
    expect(isCompleted(box, crop)).toBe(false);
  });

  it('is nothing at an edge the crop stays inside', () => {
    const box = { left: 0, top: 0, right: 0.2, bottom: 1 };
    expect(isCompleted(box, crop)).toBe(false);
    expect(isCompleted(wholePicture, wholePicture)).toBe(false);
  });
});
