import { describe, expect, it } from 'bun:test';
import { clockIn } from './clock.ts';

describe('clockIn', () => {
  it('moves a camera’s clock to another time zone', () => {
    expect(clockIn('Asia/Tokyo', '2026:05:01 20:28:03.753+02:00')).toEqual([
      '-EXIF:DateTimeOriginal=2026:05:02 03:28:03',
      '-EXIF:CreateDate=2026:05:02 03:28:03',
      '-EXIF:ModifyDate=2026:05:02 03:28:03',
      '-EXIF:OffsetTimeOriginal=+09:00',
      '-EXIF:OffsetTimeDigitized=+09:00',
      '-EXIF:OffsetTime=+09:00',
    ]);
  });

  it('knows summer time', () => {
    const offsetOn = (day: string) =>
      clockIn('Europe/Lisbon', `2026:${day} 12:00:00Z`).at(-1);
    expect(offsetOn('01:10')).toBe('-EXIF:OffsetTime=+00:00');
    expect(offsetOn('05:10')).toBe('-EXIF:OffsetTime=+01:00');
  });

  it.each(['2026:05:01 20:28:03', '', '0000:00:00 00:00:00+02:00'])(
    'leaves a clock alone whose time zone isn’t known: %p',
    (taken) => {
      expect(clockIn('Asia/Tokyo', taken)).toEqual([]);
    },
  );
});
