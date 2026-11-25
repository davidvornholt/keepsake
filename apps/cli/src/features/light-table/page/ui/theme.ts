// The colours of the theme, for what is drawn on a canvas instead of styled.

const values = new Map<string, string>();

/** A colour of the theme as the style sheet has it: `--color-table`. */
export const colorOf = (name: string): string => {
  const known = values.get(name);
  if (known !== undefined) {
    return known;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (value !== '') {
    values.set(name, value);
  }
  return value;
};

const brightest = 255;

/** How light a grey of the theme is on the screen, from 0 to 1. */
export const readGrey = (name: string): number => {
  const drawing = new OffscreenCanvas(1, 1).getContext('2d');
  if (drawing === null) {
    return 0;
  }
  drawing.fillStyle = colorOf(name);
  drawing.fillRect(0, 0, 1, 1);
  return (drawing.getImageData(0, 0, 1, 1).data[0] ?? 0) / brightest;
};

export const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const hasFinePointer = (): boolean =>
  globalThis.matchMedia('(pointer: fine)').matches;
