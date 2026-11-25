import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { makeShootStore } from '../data/store.ts';

/** A shoot that is kept up to date for as long as it is shown. */
export const useShoot = (name: string) => {
  const store = useMemo(() => makeShootStore(name), [name]);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.get);
  return { store, state };
};
