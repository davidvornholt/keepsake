import { describe, expect, it } from 'bun:test';
import {
  percentOf,
  preparedAtLeast,
  preparedShare,
  preparing,
  progressOf,
  secondsLeft,
  shareOf,
  stepName,
  timeLeft,
} from './activity.ts';

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

describe('getting an album ready', () => {
  const at = (step: string, done: number, total: number) =>
    preparedShare({ step, done, total, photos: [] });

  it('counts the steps as parts of one whole', () => {
    expect(preparing.reduce((sum, { part }) => sum + part, 0)).toBeCloseTo(1);
    expect(preparedShare(null)).toBe(0);
    expect(at('scan', 0, 80)).toBe(0);
    expect(at('scan', 80, 80)).toBeCloseTo(0.08);
    expect(at('cull', 30, 60)).toBeCloseTo(0.44);
    expect(at('explain', 5, 5)).toBeCloseTo(1);
  });

  it('never goes back from one step to the next', () => {
    const order = [
      at('scan', 80, 80),
      at('cull', 0, 60),
      at('cull', 60, 60),
      at('pick', 0, 0),
      at('explain', 0, 20),
      at('explain', 20, 20),
    ];
    expect(order).toEqual(order.toSorted((one, other) => one - other));
  });

  it('counts nothing for a step that isn’t part of it', () => {
    expect(at('edit', 3, 12)).toBe(0);
  });

  it('says how far it is in whole percent', () => {
    expect(percentOf(0.414)).toBe('41%');
    expect(percentOf(1.2)).toBe('100%');
    expect(percentOf(-1)).toBe('0%');
  });
});

describe('how long something still takes', () => {
  it('follows from how fast it went so far', () => {
    // A quarter in ten seconds: three quarters take thirty more.
    expect(secondsLeft(0.5, { share: 0.25, seconds: 10 })).toBeCloseTo(20);
    expect(secondsLeft(0.25, { share: 0, seconds: 10 })).toBeCloseTo(30);
  });

  it('can’t be told from too little, nor once it is done', () => {
    expect(secondsLeft(0.02, { share: 0, seconds: 10 })).toBeNull();
    expect(secondsLeft(0.5, { share: 0.25, seconds: 0 })).toBeNull();
    expect(secondsLeft(1, { share: 0.25, seconds: 10 })).toBeNull();
  });

  it('is said roughly, since nobody knows it better', () => {
    expect(timeLeft(22)).toBe('about 20 s left');
    expect(timeLeft(1)).toBe('about 5 s left');
    expect(timeLeft(59)).toBe('about 1 min left');
    expect(timeLeft(200)).toBe('about 3 min left');
  });
});

describe('how far an album has got at least', () => {
  it('goes by what there is of it when nothing says how far it is', () => {
    expect(preparedAtLeast({ photos: 0, chosen: 0 })).toEqual({
      at: 0,
      share: 0,
    });
    expect(preparedAtLeast({ photos: 43, chosen: 0 }).at).toBe(1);
    expect(preparedAtLeast({ photos: 43, chosen: 0 }).share).toBeCloseTo(0.08);
    expect(preparedAtLeast({ photos: 43, chosen: 10 }).at).toBe(3);
    expect(preparedAtLeast({ photos: 43, chosen: 10 }).share).toBeCloseTo(0.9);
  });
});
