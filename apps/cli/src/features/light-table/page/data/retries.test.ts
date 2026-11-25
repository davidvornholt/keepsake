import { expect, it } from 'bun:test';
import { longestWait, makeRetries, waitAfter } from './retries.ts';

it('what fails again and again is asked for less and less often', () => {
  const waits = [waitAfter(null)];
  while (waits.length < 8) {
    waits.push(waitAfter(waits.at(-1) ?? null));
  }
  expect(waits).toEqual(waits.toSorted((left, right) => left - right));
  expect(waits.at(-1)).toBe(longestWait);
});

it('what failed is held back until it arrives or is due', async () => {
  let due = 0;
  const { promise, resolve } = Promise.withResolvers<void>();
  const retries = makeRetries(() => {
    due += 1;
    resolve();
  });
  expect(retries.isHeld('a')).toBe(false);
  retries.failed('a');
  expect(retries.isHeld('a')).toBe(true);
  expect(retries.isHeld('b')).toBe(false);
  retries.failed('b');
  retries.arrived('b');
  expect(retries.isHeld('b')).toBe(false);
  await promise;
  expect(due).toBeGreaterThan(0);
  expect(retries.isHeld('a')).toBe(false);
});
