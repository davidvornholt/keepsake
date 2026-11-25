import { expect, it } from 'bun:test';
import {
  apertureOf,
  clockOf,
  count,
  dayAndMonth,
  dayAndShortMonth,
  dayOf,
  dollarsOf,
  exposureOf,
  fileName,
  focalLengthOf,
  span,
  weekdayOf,
} from './format.ts';

it('writes days the way they are said', () => {
  expect(dayOf('2026-03-30T18:04:05+08:00')).toBe('2026-03-30');
  expect(clockOf('2026-03-30T18:04:05+08:00')).toBe('18:04');
  expect(dayAndMonth('2026-03-30')).toBe('30 March');
  expect(dayAndShortMonth('2026-04-06')).toBe('6 Apr');
  expect(weekdayOf('2026-03-30')).toBe('Monday');
});

it('writes from when to when a shoot went', () => {
  expect(span('2026-03-30T11:32:42+08:00', '2026-04-06T18:19:24+08:00')).toBe(
    '30 March to 6 April 2026',
  );
  expect(span('2026-04-06T08:00:00+08:00', '2026-04-06T18:19:24+08:00')).toBe(
    '6 April 2026',
  );
  expect(span('2025-12-30T08:00:00+01:00', '2026-01-02T18:00:00+01:00')).toBe(
    '30 December 2025 to 2 January 2026',
  );
});

it('writes what the camera recorded', () => {
  expect(exposureOf(0.001)).toBe('1/1000 s');
  expect(exposureOf(1 / 60)).toBe('1/60 s');
  expect(exposureOf(0.5)).toBe('0.5 s');
  expect(exposureOf(2)).toBe('2 s');
  expect(apertureOf(7.1)).toBe('f/7.1');
  expect(focalLengthOf(69.6)).toBe('70 mm');
});

it('writes money, counts and file names', () => {
  expect(dollarsOf(134.9)).toBe('$134.90');
  expect(count(1, 'photo')).toBe('1 photo');
  expect(count(3, 'photo')).toBe('3 photos');
  expect(count(2, 'box', 'boxes')).toBe('2 boxes');
  expect(fileName('day-1/_DSC0001')).toBe('_DSC0001');
});
