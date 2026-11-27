import { describe, expect, it } from 'bun:test';
import {
  aboutOf,
  clockThere,
  maximumFor,
  monthsOf,
  titleOf,
} from './proposal.ts';

const march = '2026-03-31T06:12:00';
const april = '2026-04-02T19:00:00';

describe('monthsOf', () => {
  it('names the month, or the months, the photos are from', () => {
    expect(monthsOf(march, march)).toBe('March 2026');
    expect(monthsOf(march, april)).toBe('March and April 2026');
    expect(monthsOf('2026-03-01T08:00:00', '2026-06-01T08:00:00')).toBe(
      'March to June 2026',
    );
    expect(monthsOf('2025-12-30T08:00:00', '2026-01-02T08:00:00')).toBe(
      'December 2025 to January 2026',
    );
    expect(monthsOf('', april)).toBe('');
  });
});

describe('titleOf', () => {
  it('takes the name of the folder without its date', () => {
    expect(titleOf({ name: '2026-03-31 Gardens', within: ['2026'] })).toBe(
      'Gardens',
    );
    expect(titleOf({ name: '20260331_old-town_walk', within: [] })).toBe(
      'Old town walk',
    );
  });

  it('takes the folder around it when its own name says nothing', () => {
    expect(titleOf({ name: 'raw', within: ['2025', '2025-10-06 Porto'] })).toBe(
      'Porto',
    );
  });

  it('proposes nothing where no name says anything', () => {
    expect(titleOf({ name: '100MSDCF', within: ['DCIM'] })).toBe('');
  });
});

describe('aboutOf', () => {
  it('takes the name of the folder without its date', () => {
    expect(
      aboutOf({ name: '2026-03-31 Gardens', within: ['2026'] }, march, april),
    ).toBe('Gardens, March and April 2026');
    expect(
      aboutOf({ name: '20260331_old-town_walk', within: [] }, march, march),
    ).toBe('Old town walk, March 2026');
  });

  it('takes the folder around it when its own name says nothing', () => {
    expect(
      aboutOf(
        { name: 'raw', within: ['2025', '2025-10-06 Porto'] },
        '2025-10-06T10:00:00',
        '2025-10-06T16:00:00',
      ),
    ).toBe('Porto, October 2025');
  });

  it('says only when it was, where no name says more', () => {
    expect(aboutOf({ name: 'Camera', within: [] }, march, march)).toBe(
      'March 2026',
    );
    expect(aboutOf({ name: '100MSDCF', within: ['DCIM'] }, march, march)).toBe(
      'March 2026',
    );
    expect(aboutOf({ name: '2026', within: [] }, march, march)).toBe(
      'March 2026',
    );
  });
});

describe('maximumFor', () => {
  it('proposes about a fifth, in steps of five', () => {
    expect(maximumFor(80)).toBe(20);
    expect(maximumFor(132)).toBe(30);
  });

  it('proposes neither very few nor very many', () => {
    expect(maximumFor(30)).toBe(10);
    expect(maximumFor(894)).toBe(60);
  });

  it('never proposes more than there are', () => {
    expect(maximumFor(4)).toBe(4);
    expect(maximumFor(1)).toBe(1);
    expect(maximumFor(0)).toBe(1);
  });
});

describe('clockThere', () => {
  it('says what the clocks said in another part of the world', () => {
    expect(clockThere('2026-03-31T04:12:00.000Z', 'Asia/Seoul')).toBe(
      '13:12 on 31 March',
    );
    expect(clockThere('2026-03-31T23:30:00.000Z', 'Asia/Tokyo')).toBe(
      '08:30 on 1 April',
    );
  });

  it('says nothing for a place or a moment it doesn’t know', () => {
    expect(clockThere('2026-03-31T04:12:00.000Z', 'Nowhere/At all')).toBeNull();
    expect(clockThere('2026-03-31T04:12:00.000Z', ' ')).toBeNull();
    expect(clockThere('never', 'Asia/Seoul')).toBeNull();
  });
});
