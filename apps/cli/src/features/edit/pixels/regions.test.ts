import { describe, expect, it } from 'bun:test';
import { withoutSpecks } from './regions.ts';

const size = { width: 6, height: 4 };
const plane = (...rows: ReadonlyArray<string>) =>
  Float32Array.from(rows.join('').split('').map(Number));

describe('withoutSpecks', () => {
  it('keeps the largest region, and others that are large enough', () => {
    const found = plane('220009', '020000', '022000', '000011');
    expect(withoutSpecks(found, size, 0.5)).toEqual(
      plane('220009', '020000', '022000', '000000'),
    );
    expect(withoutSpecks(found, size, 0.1)).toEqual(found);
  });

  it('doesn’t join what only touches at a corner or across the border', () => {
    const found = plane('300000', '030001', '100000', '000000');
    expect(withoutSpecks(found, size, 0.9)).toEqual(
      plane('300000', '030000', '000000', '000000'),
    );
  });

  it('has nothing to keep in an empty plane', () => {
    const empty = plane('000000', '000000', '000000', '000000');
    expect(withoutSpecks(empty, size, 0.5)).toEqual(empty);
  });
});
