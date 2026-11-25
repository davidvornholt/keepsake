import { useSyncExternalStore } from 'react';

type Size = { readonly width: number; readonly height: number };

let size: Size = {
  width: globalThis.innerWidth,
  height: globalThis.innerHeight,
};

const subscribe = (listener: () => void) => {
  const onResize = () => {
    size = { width: globalThis.innerWidth, height: globalThis.innerHeight };
    listener();
  };
  globalThis.addEventListener('resize', onResize);
  return () => globalThis.removeEventListener('resize', onResize);
};

/** The size of the window, kept up to date. */
export const useWindowSize = (): Size =>
  useSyncExternalStore(subscribe, () => size);
