import { describe, expect, it } from 'bun:test';
import { openingZoom, pleasantFrame, textOf, zoomOf } from './sizes.ts';

const laptop = { width: 1280, height: 800, pinned: 44 };
const phone = { width: 412, height: 915, pinned: 44 };
const limits = { least: 40, most: 480 };
const landscape = 1.5;

describe('pleasantFrame', () => {
  it('shows a few rows on a laptop', () => {
    const frame = pleasantFrame(laptop);
    const rows = (laptop.height - laptop.pinned) / frame;
    expect(rows).toBeGreaterThan(2.5);
    expect(rows).toBeLessThan(4.5);
  });

  it('shows one to three photos in a row on a phone', () => {
    const across = phone.width / (pleasantFrame(phone) * landscape);
    expect(across).toBeGreaterThanOrEqual(1);
    expect(across).toBeLessThanOrEqual(3);
  });
});

describe('openingZoom', () => {
  it('opens everything with the whole shoot, and the album larger', () => {
    expect(openingZoom('all', null, laptop, limits)).toBe('fit');
    expect(openingZoom('album', null, laptop, limits)).toBe(
      pleasantFrame(laptop),
    );
    expect(openingZoom('left', null, laptop, limits)).toBe(
      pleasantFrame(laptop),
    );
  });

  it('opens a view at the size it was given', () => {
    expect(openingZoom('all', 120, laptop, limits)).toBe(120);
    expect(openingZoom('album', 'fit', laptop, limits)).toBe('fit');
  });

  it('stays within what the table can show', () => {
    expect(openingZoom('album', 2000, laptop, limits)).toBe(limits.most);
    expect(openingZoom('album', 10, laptop, limits)).toBe('fit');
    expect(openingZoom('album', null, laptop, { least: 300, most: 480 })).toBe(
      'fit',
    );
  });
});

describe('a kept size', () => {
  it('is read as it was written', () => {
    expect(zoomOf(textOf('fit'))).toBe('fit');
    expect(zoomOf(textOf(212.4))).toBe(212);
  });

  it('is nothing when it is no size', () => {
    expect(zoomOf(null)).toBeNull();
    expect(zoomOf('')).toBeNull();
    expect(zoomOf('large')).toBeNull();
    expect(zoomOf('-4')).toBeNull();
  });
});
