// How the page writes dates, times and what the camera recorded.

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const dayLength = 10;
const clockStart = 11;
const clockEnd = 16;
const shortLength = 3;

type DayParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

const partsOf = (date: string): DayParts => {
  const [year = '0', month = '1', day = '1'] = date
    .slice(0, dayLength)
    .split('-');
  return { year: Number(year), month: Number(month), day: Number(day) };
};

/** The day a photo was taken, by the clocks there: 2026-03-30. */
export const dayOf = (takenAt: string): string => takenAt.slice(0, dayLength);

/** 18:04, by the clocks there. */
export const clockOf = (takenAt: string): string =>
  takenAt.slice(clockStart, clockEnd);

const monthOf = ({ month }: DayParts): string => months[month - 1] ?? '';

/** 30 March */
export const dayAndMonth = (date: string): string => {
  const parts = partsOf(date);
  return `${parts.day} ${monthOf(parts)}`;
};

/** 30 Mar */
export const dayAndShortMonth = (date: string): string => {
  const parts = partsOf(date);
  return `${parts.day} ${monthOf(parts).slice(0, shortLength)}`;
};

/** Monday */
export const weekdayOf = (date: string): string => {
  const { year, month, day } = partsOf(date);
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
};

/** 30 March to 6 April 2026, or 30 March 2026 for a single day. */
export const span = (from: string, to: string): string => {
  const first = partsOf(from);
  const last = partsOf(to);
  const end = `${dayAndMonth(to)} ${last.year}`;
  if (dayOf(from) === dayOf(to)) {
    return end;
  }
  const start =
    first.year === last.year
      ? dayAndMonth(from)
      : `${dayAndMonth(from)} ${first.year}`;
  return `${start} to ${end}`;
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** A moment of the owner's own day, by the clock of this device: 14:07. */
export const localClock = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/** A day of the owner's own calendar: 12 November. */
export const localDay = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : `${at.getDate()} ${months[at.getMonth()] ?? ''}`;
};

const tenth = 10;

const rounded = (value: number): number => Math.round(value * tenth) / tenth;

/** 1/1000 s, 0.5 s or 2 s. */
export const exposureOf = (seconds: number): string => {
  const part = 1 / seconds;
  return seconds < 1 && part >= tenth
    ? `1/${Math.round(part)} s`
    : `${rounded(seconds)} s`;
};

export const apertureOf = (aperture: number): string =>
  `f/${rounded(aperture)}`;

export const focalLengthOf = (millimetres: number): string =>
  `${Math.round(millimetres)} mm`;

const centsIn = 2;

/** $134.90 */
export const dollarsOf = (dollars: number): string =>
  `$${dollars.toFixed(centsIn)}`;

/** 1 photo, 2 photos */
export const count = (many: number, one: string, several = `${one}s`): string =>
  `${many} ${many === 1 ? one : several}`;

/** The name the camera gave the file, without the folders before it. */
export const fileName = (id: string): string => id.split('/').at(-1) ?? id;
