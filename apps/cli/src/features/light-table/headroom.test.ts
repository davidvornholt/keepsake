import { describe, expect, it } from 'bun:test';
import { holdForOneEdit } from '../../shared/models.ts';
import { dollarsForOneEdit } from '../../shared/spending.ts';
import { limitFor } from './headroom.ts';

const usual = { perEdit: 0.75, hold: 0.74 };

describe('what the owner agrees to pay', () => {
  it('is half as much again as the estimate', () => {
    expect(limitFor(6.75, usual)).toBe(10.13);
    expect(limitFor(0.75, usual)).toBe(1.13);
  });

  it('always covers the hold of the last edit', () => {
    // A hold far above what an edit usually costs.
    expect(limitFor(0.75, { perEdit: 0.75, hold: 3 })).toBe(3);
    expect(limitFor(1.5, { perEdit: 0.75, hold: 3 })).toBe(3.75);
  });

  it('is nothing for nothing', () => {
    expect(limitFor(0, usual)).toBe(0);
  });

  it('lets an order whose edits cost what the estimate says finish', () => {
    // Nine photos, as in an order that stopped at seven with the estimate.
    const estimate = 9 * dollarsForOneEdit;
    const limit = limitFor(estimate, {
      perEdit: dollarsForOneEdit,
      hold: holdForOneEdit,
    });
    const beforeLast = 8 * dollarsForOneEdit;
    expect(limit - beforeLast).toBeGreaterThanOrEqual(holdForOneEdit);
    expect(holdForOneEdit).toBeGreaterThan(0);
  });
});
