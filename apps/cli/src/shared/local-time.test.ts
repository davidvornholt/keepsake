import { describe, expect, it } from 'bun:test';
import { takenThere } from './local-time.ts';

const taken = { takenAt: '2026-03-30T07:38:05.120', utcOffset: '+02:00' };

describe('takenThere', () => {
  it('gives the time of the place', () => {
    expect(takenThere({ timeZone: 'Asia/Shanghai' }, taken)).toBe(
      '2026-03-30T13:38:05+08:00',
    );
  });

  it('gives another day when it was one there', () => {
    const late = { ...taken, takenAt: '2026-03-30T23:10:00.000' };
    expect(takenThere({ timeZone: 'Asia/Shanghai' }, late)).toBe(
      '2026-03-31T05:10:00+08:00',
    );
  });

  it('gives the camera’s time when nothing else is known', () => {
    expect(takenThere({ timeZone: undefined }, taken)).toBe(
      '2026-03-30T07:38:05+02:00',
    );
    expect(
      takenThere({ timeZone: 'Asia/Shanghai' }, { ...taken, utcOffset: null }),
    ).toBe('2026-03-30T07:38:05');
  });
});
