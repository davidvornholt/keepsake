import { describe, expect, it } from 'bun:test';
import { frameAt, nearestFrame, nearestStaying, neighbour } from './find.ts';
import { type Group, layOut } from './layout.ts';

const group = (key: string, count: number): Group => ({
  key,
  items: Array.from({ length: count }, (_, index) => ({
    id: `${key}${index}`,
    aspect: 1.5,
    isMomentStart: index % 3 === 0,
  })),
});

describe('finding frames', () => {
  const layout = layOut([group('a', 12)], 400, 60);

  it('finds the frame at a point and the one nearest to it', () => {
    const rect = layout.rects.get('a4');
    const x = (rect?.x ?? 0) + 2;
    const y = (rect?.y ?? 0) + 2;
    expect(frameAt(layout, x, y)).toBe('a4');
    expect(frameAt(layout, x, 0)).toBeNull();
    expect(frameAt(layout, 0, y)).toBeNull();
    expect(nearestFrame(layout, 0, 0)).toBe('a0');
    expect(nearestFrame(layout, 1000, 10_000)).toBe('a11');
  });

  it('follows the arrow keys', () => {
    const perRow = layout.rows[0]?.to ?? 0;
    expect(perRow).toBeGreaterThan(1);
    expect(neighbour(layout, 'a0', 'right')).toBe('a1');
    expect(neighbour(layout, 'a0', 'left')).toBe('a0');
    expect(neighbour(layout, 'a0', 'down')).toBe(`a${perRow}`);
    expect(neighbour(layout, `a${perRow}`, 'up')).toBe('a0');
    expect(neighbour(layout, 'a0', 'up')).toBe('a0');
    expect(neighbour(layout, 'a0', 'last')).toBe('a11');
    expect(neighbour(layout, 'a5', 'first')).toBe('a0');
    expect(neighbour(layout, 'nothing', 'right')).toBe('a0');
  });
});

describe('sheets side by side', () => {
  const layout = layOut(
    [group('a', 2), group('b', 2), group('c', 30)],
    1200,
    100,
  );

  it('finds a frame on the sheet to the right', () => {
    const rect = layout.rects.get('b1');
    expect(frameAt(layout, (rect?.x ?? 0) + 2, (rect?.y ?? 0) + 2)).toBe('b1');
  });

  it('goes down from either sheet to the one below, and back up', () => {
    const below = neighbour(layout, 'b1', 'down');
    expect(below?.startsWith('c')).toBe(true);
    expect(neighbour(layout, 'a0', 'down')).toBe('c0');
    expect(neighbour(layout, 'c0', 'up')).toBe('a0');
    expect(neighbour(layout, below ?? '', 'up')).toBe('b1');
    expect(neighbour(layout, 'a1', 'right')).toBe('b0');
  });
});

describe('nearestStaying', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('is the frame itself when it stays', () => {
    expect(nearestStaying(order, 'c', new Set(['a', 'c']))).toBe('c');
  });

  it('is the nearest one in the order otherwise', () => {
    expect(nearestStaying(order, 'c', new Set(['a', 'd']))).toBe('d');
    expect(nearestStaying(order, 'e', new Set(['a']))).toBe('a');
  });

  it('is nothing when nothing stays or the frame is unknown', () => {
    expect(nearestStaying(order, 'c', new Set())).toBeNull();
    expect(nearestStaying(order, 'z', new Set(['a']))).toBeNull();
  });
});
