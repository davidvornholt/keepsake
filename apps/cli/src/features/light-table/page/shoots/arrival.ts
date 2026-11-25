import { useSyncExternalStore } from 'react';
import type { PhotoView } from '../../contract.ts';

// A shoot that is opened from the start: the photos that stood for it stay
// where they are until its table is laid out, and then go to where they lie
// on it.

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** One photo on its way, as it was on the start. */
export type Flying = {
  /** The picture it shows, as the shoot names it. */
  readonly src: string;
  /** The copy of it that is on the screen already. */
  readonly url: string;
  readonly rect: Rect;
};

export type Arrival = {
  readonly shoot: string;
  /** The sheet the photos lay on. */
  readonly paper: Rect;
  readonly flying: ReadonlyArray<Flying>;
  /** Where each goes, by its picture, once the table knows. */
  readonly targets: ReadonlyMap<string, Rect> | null;
};

let arrival: Arrival | null = null;
const listeners = new Set<() => void>();

const set = (next: Arrival | null) => {
  arrival = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useArrival = (): Arrival | null =>
  useSyncExternalStore(subscribe, () => arrival);

/** Whether the photos of this shoot are on the screen and wait for its table. */
export const isArriving = (shoot: string): boolean =>
  arrival !== null && arrival.shoot === shoot;

export const startArrival = (
  shoot: string,
  paper: Rect,
  flying: ReadonlyArray<Flying>,
): void => set({ shoot, paper, flying, targets: null });

/** Says where the photos lie on the table, which sends them on their way. */
export const landArrival = (
  shoot: string,
  targets: ReadonlyMap<string, Rect>,
): void => {
  if (arrival !== null && arrival.shoot === shoot && arrival.targets === null) {
    set({ ...arrival, targets });
  }
};

export const endArrival = (): void => {
  if (arrival !== null) {
    set(null);
  }
};

/** Which photo each picture is of, whether it is the camera's or the finished one. */
export const photoByPicture = (
  photos: ReadonlyArray<PhotoView>,
): ReadonlyMap<string, string> => {
  const known = new Map<string, string>();
  for (const { id, picture, edit } of photos) {
    known.set(picture.src, id);
    if (edit !== null) {
      known.set(edit.picture.src, id);
    }
  }
  return known;
};

/** Where each picture on its way goes, given where its photo lies. */
export const targetsOf = (
  flying: ReadonlyArray<Flying>,
  photos: ReadonlyArray<PhotoView>,
  rectOf: (photo: string) => Rect | null,
): ReadonlyMap<string, Rect> => {
  const byPicture = photoByPicture(photos);
  const targets = new Map<string, Rect>();
  for (const { src } of flying) {
    const photo = byPicture.get(src);
    const rect = photo === undefined ? null : rectOf(photo);
    if (rect !== null) {
      targets.set(src, rect);
    }
  }
  return targets;
};
