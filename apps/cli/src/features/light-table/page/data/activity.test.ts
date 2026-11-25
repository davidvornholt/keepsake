import { describe, expect, it } from 'bun:test';
import { progressOf, shareOf, stepName } from './activity.ts';

const activity = { step: 'edit', done: 3, total: 12, photos: [] };

describe('what an agent is doing', () => {
  it('names the steps it knows, and calls the others working', () => {
    expect(stepName(activity)).toBe('Editing');
    expect(stepName({ ...activity, step: 'something-new' })).toBe('Working');
  });

  it('counts how far it has got', () => {
    expect(progressOf(activity)).toBe('3 of 12');
    expect(shareOf(activity)).toBe(0.25);
  });

  it('says nothing when there is nothing to count, and never more than all', () => {
    expect(progressOf({ ...activity, total: 0 })).toBe('');
    expect(shareOf({ ...activity, total: 0 })).toBe(0);
    expect(progressOf({ ...activity, done: 14 })).toBe('12 of 12');
    expect(shareOf({ ...activity, done: 14 })).toBe(1);
  });
});
