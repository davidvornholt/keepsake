import { thumbHashToDataURL } from 'thumbhash';
import { type Picture, pictureWidths } from '../../contract.ts';
import { longestWait, waitAfter } from './retries.ts';

// Which copy of a picture to ask for, and pictures that are ready to show.

type Width = (typeof pictureWidths)[number];

/** The address of a picture about this wide, or of the file itself. */
export const urlOf = ({ src }: Picture, width: Width | null): string =>
  width === null ? src : `${src}?width=${width}`;

/** How much a copy may be stretched before a larger one is asked for. */
const stretch = 1.15;

/**
 * The smallest copy that fills this many pixels of the screen, or null when
 * only the file itself is large enough.
 */
export const widthFor = (picture: Picture, pixels: number): Width | null => {
  const needed = Math.min(pixels, picture.width) / stretch;
  return pictureWidths.find((width) => width >= needed) ?? null;
};

/** The copies of a picture up to the one asked for, smallest first. */
export const widthsUpTo = (width: Width | null): ReadonlyArray<Width> =>
  pictureWidths.filter((one) => width === null || one <= width);

export const hashBytes = (placeholder: string): Uint8Array =>
  Uint8Array.from(atob(placeholder), (letter) => letter.codePointAt(0) ?? 0);

const blurs = new Map<string, string>();

/** A blurred picture to show until the real one is there. */
export const blurOf = ({ placeholder }: Picture): string => {
  if (placeholder === '') {
    return '';
  }
  const known = blurs.get(placeholder);
  if (known !== undefined) {
    return known;
  }
  let blur = '';
  try {
    blur = thumbHashToDataURL(hashBytes(placeholder));
  } catch {
    // A placeholder that can't be read is left out.
  }
  blurs.set(placeholder, blur);
  return blur;
};

const ready = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement | null>>();
/** How many pictures are kept ready; the ones used longest ago go first. */
const kept = 160;

const remember = (url: string, image: HTMLImageElement) => {
  ready.delete(url);
  ready.set(url, image);
  for (const oldest of ready.keys()) {
    if (ready.size <= kept) {
      break;
    }
    ready.delete(oldest);
  }
};

/** Whether a picture can be shown at once. */
export const isReady = (url: string): boolean => ready.has(url);

const load = async (url: string): Promise<HTMLImageElement | null> => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
};

/** Asks for a picture a few times, such as while keepsake is started again. */
const loadPatiently = async (
  url: string,
  waited: number | null = null,
): Promise<HTMLImageElement | null> => {
  const image = await load(url);
  if (image !== null || waited === longestWait) {
    return image;
  }
  const wait = waitAfter(waited);
  await new Promise((done) => setTimeout(done, wait));
  return loadPatiently(url, wait);
};

/** Loads and decodes a picture, so that showing it takes no time. */
export const prepare = (url: string): Promise<HTMLImageElement | null> => {
  const image = ready.get(url);
  if (image !== undefined) {
    remember(url, image);
    return Promise.resolve(image);
  }
  const running = loading.get(url);
  if (running !== undefined) {
    return running;
  }
  const decoding = loadPatiently(url)
    .then((fresh) => {
      if (fresh !== null) {
        remember(url, fresh);
      }
      return fresh;
    })
    .finally(() => loading.delete(url));
  loading.set(url, decoding);
  return decoding;
};

/** The largest copy of a picture that is ready, up to the width asked for. */
export const bestReady = (
  picture: Picture,
  width: Width | null,
): string | null => {
  const own = urlOf(picture, width);
  if (isReady(own)) {
    return own;
  }
  return (
    widthsUpTo(width)
      .map((one) => urlOf(picture, one))
      .findLast(isReady) ?? null
  );
};
