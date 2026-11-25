import { createContext, use } from 'react';
import type { Index } from '../data/derive.ts';
import type { ShootStore } from '../data/store.ts';
import type { ShootState } from '../data/store-state.ts';
import type { Filters } from './route.ts';

// What every part of a shoot's page needs: the shoot, the way to change it,
// and the way to another photo.

export type InShoot = {
  readonly index: Index;
  readonly state: ShootState;
  readonly store: ShootStore;
  readonly filters: Filters;
  /** The address of a photo, with the table as it is. */
  readonly hrefOfPhoto: (photo: string) => string;
  /** Shows a photo large. Turning the page replaces the one shown. */
  readonly openPhoto: (photo: string, how?: 'push' | 'replace') => void;
};

export const ShootContext = createContext<InShoot | null>(null);

export const useShootContext = (): InShoot => {
  const context = use(ShootContext);
  if (context === null) {
    throw new Error('No shoot is shown here.');
  }
  return context;
};
