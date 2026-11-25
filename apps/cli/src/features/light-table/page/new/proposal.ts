// What the page proposes for a new album, so that the owner only has to
// agree: what it is about, how many photos it may have, and what the
// camera's clock says in another part of the world.

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

/** A date at the start of a folder's name, as cameras and people write it. */
const leadingDate =
  /^(?<date>\d{4}[-_. ]?\d{2}(?:[-_. ]?\d{2})?)[-_. ]+(?<rest>.+)$/u;
/** Names that say nothing about what the photos show. */
const saysNothing =
  /^(?:raw|jpe?g|camera|dcim|\d{3}[a-z_]{5}|photos?|export)$/iu;
const onlyDate = /^[\d_. -]+$/u;
const separators = /[_-]+/gu;
const stampPattern = /^(?<year>\d{4})-(?<month>\d{2})/u;

const tidy = (name: string): string => {
  const rest = leadingDate.exec(name)?.groups?.rest ?? name;
  const words = rest.replace(separators, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const tellsSomething = (name: string): boolean =>
  !(saysNothing.test(name) || onlyDate.test(name));

type Month = { readonly year: number; readonly month: number };

const monthOf = (stamp: string): Month | null => {
  const groups = stampPattern.exec(stamp)?.groups;
  return groups === undefined
    ? null
    : { year: Number(groups.year), month: Number(groups.month) };
};

/** "March 2026", "March and April 2026", "December 2025 to January 2026". */
export const monthsOf = (from: string, to: string): string => {
  const first = monthOf(from);
  const last = monthOf(to);
  if (first === null || last === null) {
    return '';
  }
  const end = `${months[last.month - 1] ?? ''} ${last.year}`;
  if (first.year !== last.year) {
    return `${months[first.month - 1] ?? ''} ${first.year} to ${end}`;
  }
  if (first.month === last.month) {
    return end;
  }
  const isNext = last.month - first.month === 1;
  return `${months[first.month - 1] ?? ''} ${isNext ? 'and' : 'to'} ${end}`;
};

/**
 * What an album of a folder is about, from the name of the folder, or of
 * the one it lies in when its own says nothing, and from when its photos
 * were taken: "Gardens, March 2026".
 */
export const aboutOf = (
  folder: { readonly name: string; readonly within: ReadonlyArray<string> },
  from: string,
  to: string,
): string => {
  const name = [folder.name, ...folder.within.toReversed()].find(
    tellsSomething,
  );
  return [name === undefined ? '' : tidy(name), monthsOf(from, to)]
    .filter((part) => part !== '')
    .join(', ');
};

/** About one photo in this many is good enough for an album. */
const oneIn = 5;
const fewest = 10;
const most = 60;
const step = 5;

/** How many photos an album of so many has at most, as a first proposal. */
export const maximumFor = (photos: number): number =>
  Math.min(
    Math.max(photos, 1),
    Math.max(fewest, Math.min(most, Math.ceil(photos / oneIn / step) * step)),
  );

/** The time zones this device knows, by their names: "Europe/Lisbon". */
export const timeZones = (): ReadonlyArray<string> => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
};

/**
 * What the clocks said somewhere else when the clock of this device said
 * so: "12:12 on 31 March". Null for a place it doesn't know.
 */
export const clockThere = (stamp: string, timeZone: string): string | null => {
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime()) || timeZone.trim() === '') {
    return null;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const part = (type: string) =>
      parts.find((one) => one.type === type)?.value ?? '';
    return `${part('hour')}:${part('minute')} on ${part('day')} ${part('month')}`;
  } catch {
    return null;
  }
};
