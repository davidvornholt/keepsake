import { describe, expect, it } from 'bun:test';
import { stepFrom } from './steps.ts';

// Seven places in rows of three, as albums lie on a shelf.
const across = 3;
const places = Array.from({ length: 7 }, (_, at) => ({
  x: (at % across) * 400,
  // The rows aren't equally tall, as titles of two lines make them.
  y: Math.floor(at / across) * 380 + (at % across === 1 ? 3 : 0),
}));

describe('stepFrom', () => {
  it('goes sideways to the next album, into the next row too', () => {
    expect(stepFrom(places, 0, 'ArrowRight')).toBe(1);
    expect(stepFrom(places, 2, 'ArrowRight')).toBe(3);
    expect(stepFrom(places, 3, 'ArrowLeft')).toBe(2);
    expect(stepFrom(places, 0, 'ArrowLeft')).toBe(0);
    expect(stepFrom(places, 6, 'ArrowRight')).toBe(6);
  });

  it('goes up and down to the album that lies nearest in the next row', () => {
    expect(stepFrom(places, 1, 'ArrowDown')).toBe(4);
    expect(stepFrom(places, 4, 'ArrowUp')).toBe(1);
    expect(stepFrom(places, 3, 'ArrowDown')).toBe(6);
    // The last row is shorter: the nearest album there is.
    expect(stepFrom(places, 5, 'ArrowDown')).toBe(6);
    expect(stepFrom(places, 6, 'ArrowUp')).toBe(3);
  });

  it('stays where there is no row to go to', () => {
    expect(stepFrom(places, 1, 'ArrowUp')).toBe(1);
    expect(stepFrom(places, 6, 'ArrowDown')).toBe(6);
  });

  it('goes to the first and the last, and to the first from nowhere', () => {
    expect(stepFrom(places, 4, 'Home')).toBe(0);
    expect(stepFrom(places, 1, 'End')).toBe(6);
    expect(stepFrom(places, -1, 'ArrowDown')).toBe(0);
  });
});
