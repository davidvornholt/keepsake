import { useSyncExternalStore } from 'react';
import { hrefOf, type Route, routeOf } from './route.ts';

// The address bar as the page's memory of where it is: Back closes a photo,
// and every place can be linked to.

type Entry = {
  readonly depth: number;
  /** How many photos were opened one from another, up to this step. */
  readonly run: number;
};

const listeners = new Set<() => void>();

const read = (): Route => routeOf(location.pathname, location.search);

let current = read();

const update = () => {
  current = read();
  for (const listener of listeners) {
    listener();
  }
};

const numberIn = (name: 'depth' | 'run'): number => {
  const state: unknown = history.state;
  if (typeof state !== 'object' || state === null || !(name in state)) {
    return 0;
  }
  const value: unknown = Reflect.get(state, name);
  return typeof value === 'number' ? value : 0;
};

/** How many steps of this visit lie behind the one shown. */
const depthOf = (): number => numberIn('depth');

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    globalThis.addEventListener('popstate', update);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      globalThis.removeEventListener('popstate', update);
    }
  };
};

export const useRoute = (): Route =>
  useSyncExternalStore(subscribe, () => current);

/** Goes somewhere. A step that is pushed can be gone back from. */
export const go = (route: Route, how: 'push' | 'replace' = 'push'): void => {
  const href = hrefOf(route);
  if (href === `${location.pathname}${location.search}`) {
    return;
  }
  const isPhoto = route.screen === 'photo';
  if (how === 'push') {
    const entry: Entry = {
      depth: depthOf() + 1,
      run: isPhoto ? numberIn('run') + 1 : 0,
    };
    history.pushState(entry, '', href);
  } else {
    const entry: Entry = {
      depth: depthOf(),
      run: isPhoto ? Math.max(1, numberIn('run')) : 0,
    };
    history.replaceState(entry, '', href);
  }
  update();
};

/**
 * Closes a photo: back to the table it was opened from, however many photos
 * were opened from it since, or to a place when it was opened by its address.
 */
export const closePhoto = (otherwise: Route): void => {
  const run = numberIn('run');
  if (run > 0 && depthOf() >= run) {
    history.go(-run);
  } else {
    go(otherwise, 'replace');
  }
};

/** Goes back to where the owner came from, or to a place when they came from elsewhere. */
export const goBack = (otherwise: Route): void => {
  if (depthOf() > 0) {
    history.back();
  } else {
    go(otherwise, 'replace');
  }
};
