import { describe, expect, it } from 'bun:test';
import { budgetAfter, mostBudget } from './budget.ts';

const onTime = 1 / 60;
const lateFrame = 1 / 30;

describe('budgetAfter', () => {
  it('halves after a frame that came late, down to a little', () => {
    expect(budgetAfter(mostBudget, lateFrame)).toBe(mostBudget / 2);
    let budget = mostBudget;
    for (let frame = 0; frame < 10; frame += 1) {
      budget = budgetAfter(budget, lateFrame);
    }
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(1);
  });

  it('grows back slowly while the frames come on time', () => {
    const low = budgetAfter(budgetAfter(mostBudget, lateFrame), lateFrame);
    const next = budgetAfter(low, onTime);
    expect(next).toBeGreaterThan(low);
    expect(next).toBeLessThan(low * 1.2);
    let budget = low;
    for (let frame = 0; frame < 60; frame += 1) {
      budget = budgetAfter(budget, onTime);
    }
    expect(budget).toBe(mostBudget);
  });
});
