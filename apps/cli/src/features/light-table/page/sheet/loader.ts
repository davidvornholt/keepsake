import { thumbHashToAverageRGBA, thumbHashToRGBA } from 'thumbhash';
import { type Picture, pictureWidths } from '../../contract.ts';
import { hashBytes, urlOf } from '../data/pictures.ts';
import { makeRetries } from '../data/retries.ts';
import type { Atlas } from './atlas.ts';
import { budgetAfter, mostBudget } from './budget.ts';

// Fills the atlas: first a blur of every picture, which is there within a
// few frames, then the pictures themselves, the ones in sight first. Until
// its blur is made a picture is the one colour it is nearest to.

export type Wanted = { readonly key: string; readonly picture: Picture };

type Progress = 'blurred' | 'loading' | 'sharp' | 'failed';

/** How many pictures are fetched at once; a browser allows six per host. */
const atOnce = 6;
const [smallest] = pictureWidths;
const blankShade = 40;
const white = 255;

const aspectOf = ({ width, height }: Picture): number => width / height;

/** A blur of a picture, or a plain grey when it has none. */
const blurOf = ({ placeholder }: Picture): OffscreenCanvas => {
  try {
    const { w, h, rgba } = thumbHashToRGBA(hashBytes(placeholder));
    const canvas = new OffscreenCanvas(w, h);
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    return canvas;
  } catch {
    const canvas = new OffscreenCanvas(1, 1);
    const drawing = canvas.getContext('2d');
    if (drawing !== null) {
      drawing.fillStyle = `rgb(${blankShade} ${blankShade} ${blankShade})`;
      drawing.fillRect(0, 0, 1, 1);
    }
    return canvas;
  }
};

export type Colour = readonly [number, number, number];

const blank: Colour = [
  blankShade / white,
  blankShade / white,
  blankShade / white,
];

/** The one colour a picture is nearest to, which is known before anything is drawn. */
const colourOf = ({ placeholder }: Picture): Colour => {
  try {
    const { r, g, b } = thumbHashToAverageRGBA(hashBytes(placeholder));
    return [r, g, b];
  } catch {
    return blank;
  }
};

export const makeLoader = (atlas: Atlas, onArrived: () => void) => {
  const colours = new Map<string, Colour>();
  const progress = new Map<string, Progress>();
  /** When each picture first had something to show, in milliseconds. */
  const since = new Map<string, number>();
  /** Pictures that arrived and wait for a frame with time for them. */
  const arrived: Array<Wanted & { readonly bitmap: ImageBitmap }> = [];
  const retries = makeRetries(onArrived);
  let wanted: ReadonlyArray<Wanted> = [];
  let running = 0;
  let budget = mostBudget;

  const fetchOne = async ({ key, picture }: Wanted) => {
    progress.set(key, 'loading');
    running += 1;
    try {
      const response = await fetch(urlOf(picture, smallest));
      const bitmap = await createImageBitmap(await response.blob());
      arrived.push({ key, picture, bitmap });
      retries.arrived(key);
    } catch {
      progress.set(key, 'failed');
      retries.failed(key);
    }
    running -= 1;
    onArrived();
    fetchMore();
  };

  const putArrived = () => {
    const next = arrived.shift();
    // A picture the table has forgotten meanwhile has no place any more.
    if (next !== undefined && progress.get(next.key) === 'loading') {
      atlas.put(next.key, aspectOf(next.picture), next.bitmap);
      progress.set(next.key, 'sharp');
    }
    next?.bitmap.close();
  };

  const fetchMore = () => {
    const next =
      running < atOnce
        ? wanted.find(({ key }) => progress.get(key) === 'blurred')
        : undefined;
    if (next !== undefined) {
      // It can't fail: a picture that doesn't arrive is noted as failed.
      fetchOne(next).catch(() => undefined);
      fetchMore();
    }
  };

  return {
    /** The pictures the table shows, the most urgent first. */
    want: (list: ReadonlyArray<Wanted>) => {
      wanted = list;
      for (const [key, state] of progress) {
        if (state === 'failed' && !retries.isHeld(key)) {
          progress.set(key, 'blurred');
        }
      }
      fetchMore();
    },
    /**
     * Puts the pictures that arrived into the atlas and makes the next blurs,
     * for the part of a frame there is for it, which is smaller after a
     * frame that took `seconds` too long. Says whether there is more to do.
     */
    blurSome: (now: number, seconds: number): boolean => {
      budget = budgetAfter(budget, seconds);
      const until = performance.now() + budget;
      const isLate = () => performance.now() >= until;
      while (arrived.length > 0 && !isLate()) {
        putArrived();
      }
      const waiting = wanted.filter(({ key }) => !progress.has(key));
      const made = waiting.findIndex(({ key, picture }) => {
        atlas.put(key, aspectOf(picture), blurOf(picture));
        progress.set(key, 'blurred');
        since.set(key, now);
        return isLate();
      });
      if (waiting.length > 0) {
        fetchMore();
      }
      return arrived.length > 0 || (made >= 0 && made < waiting.length - 1);
    },
    /** The colour that stands for a picture until its blur is made. */
    colourOf: (picture: Picture): Colour => {
      const known = colours.get(picture.src);
      if (known !== undefined) {
        return known;
      }
      const colour = colourOf(picture);
      colours.set(picture.src, colour);
      return colour;
    },
    /** Since when a picture has something to show, if it has. */
    shownSince: (key: string): number | undefined => since.get(key),
    forget: (keys: ReadonlySet<string>) => {
      for (const key of progress.keys()) {
        if (!keys.has(key)) {
          progress.delete(key);
          since.delete(key);
          colours.delete(key);
        }
      }
    },
  };
};

export type Loader = ReturnType<typeof makeLoader>;
