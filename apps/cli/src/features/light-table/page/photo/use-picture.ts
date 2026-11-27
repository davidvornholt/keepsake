import { useEffect, useReducer, useState } from 'react';
import { type PhotoView, type Picture, pictureWidths } from '../../contract.ts';
import {
  bestReady,
  isReady,
  prepare,
  urlOf,
  widthFor,
} from '../data/pictures.ts';
import type { Look } from './setting.ts';

const [smallest] = pictureWidths;

/**
 * The best copy of a picture that can be shown this instant, for so many
 * pixels of the screen. A sharper one follows as soon as it has arrived.
 */
export const usePicture = (
  picture: Picture | null,
  pixels: number,
): string | null => {
  const [, arrived] = useReducer((times: number) => times + 1, 0);
  const width = picture === null ? smallest : widthFor(picture, pixels);
  const wanted = picture === null ? null : urlOf(picture, width);
  const first = picture === null ? null : urlOf(picture, smallest);

  useEffect(() => {
    let isWanted = true;
    const note = () => {
      if (isWanted) {
        arrived();
      }
    };
    for (const url of [first, wanted]) {
      if (url !== null && !isReady(url)) {
        prepare(url).then(note, note);
      }
    }
    return () => {
      isWanted = false;
    };
  }, [first, wanted]);

  const best = picture === null ? null : bestReady(picture, width);
  // What was shown stays until its successor has arrived, as when keepsake
  // has just edited the photo again.
  const [last, setLast] = useState(best);
  if (best !== null && best !== last) {
    setLast(best);
  }
  return picture === null ? null : (best ?? last);
};

const calmAfter = 450;

/**
 * Whether what the key names has stayed the same for a moment, which is when
 * something heavy can be done without a movement showing it.
 */
export const useCalm = (key: string): boolean => {
  const [calmAt, setCalmAt] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setCalmAt(key), calmAfter);
    return () => clearTimeout(timer);
  }, [key]);
  return calmAt === key;
};

/**
 * The file of a picture itself, for a screen with more pixels than the
 * largest copy has. Taking in so large a file can hold frames up, so it is
 * asked for and first shown only while all is calm, and stays from then on.
 */
export const useFile = (
  picture: Picture | null,
  isCalm: boolean,
): string | null => {
  const [, arrived] = useReducer((times: number) => times + 1, 0);
  const url = picture === null ? null : urlOf(picture, null);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (url === null || !isCalm || isReady(url)) {
      return;
    }
    let isWanted = true;
    const note = () => {
      if (isWanted) {
        arrived();
      }
    };
    prepare(url).then(note, note);
    return () => {
      isWanted = false;
    };
  }, [url, isCalm]);

  const isShown = url !== null && (shown === url || (isCalm && isReady(url)));
  if (isShown && shown !== url) {
    setShown(url);
  }
  return isShown ? url : null;
};

/** Has pictures ready before they are asked for, such as the next photo. */
export const usePrepared = (
  pictures: ReadonlyArray<Picture>,
  pixels: number,
): void => {
  const urls = pictures
    .map((picture) => urlOf(picture, widthFor(picture, pixels)))
    .join('\n');
  useEffect(() => {
    for (const url of urls.split('\n')) {
      if (url !== '') {
        prepare(url).catch(() => undefined);
      }
    }
  }, [urls]);
};

/**
 * The camera's picture: nothing large while the finished photo is shown, its
 * largest copy as soon as it is asked for, and its own file once the photo
 * lies still, where the screen has more pixels than the copy.
 */
export const useCamera = (photo: PhotoView, look: Look, pixels: number) => {
  const isWanted = look !== 'edit' || photo.edit === null;
  const [seen, setSeen] = useState<string | null>(null);
  // Once seen it stays, so that going back and forth costs nothing.
  if (isWanted && seen !== photo.id) {
    setSeen(photo.id);
  }
  const isShown = isWanted || seen === photo.id;
  const isCalm = useCalm(`${photo.id} ${look} ${pixels}`);
  const needsFile = isShown && pixels > photo.picture.width;
  // Ready before it is asked for, so that it is there at once.
  usePrepared(isCalm ? [photo.picture] : [], pixels);
  return {
    src: usePicture(photo.picture, isShown ? pixels : 1),
    file: useFile(needsFile ? photo.full : null, isCalm),
  };
};
