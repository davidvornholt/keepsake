const notInName = /[^a-z0-9]+/gu;
const outerHyphens = /^-+|-+$/gu;
const combiningMarks = /\p{M}/gu;

/** A folder's name as a shoot's name: lowercase words joined by hyphens. */
export const nameFor = (folder: string): string =>
  folder
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replaceAll(combiningMarks, '')
    .replaceAll(notInName, '-')
    .replaceAll(outerHyphens, '');
