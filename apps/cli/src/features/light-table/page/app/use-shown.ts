import { useMemo, useState } from 'react';
import type { Index } from '../data/derive.ts';
import { orderOf } from '../sheet/content.ts';
import { everything, type Route } from './route.ts';
import { useAnswers } from './use-answers.ts';

// Which photo is shown large, if any, and the photos gone through from it.

type Placed = Exclude<Route, { readonly screen: 'shoots' }>;

/** The photo that is shown large, and for a moment after the owner left it. */
const useHeld = (open: string | null) => {
  const [held, setHeld] = useState(open);
  if (open !== null && held !== open) {
    setHeld(open);
  }
  return {
    photo: open ?? held,
    isLeaving: open === null && held !== null,
    letGo: () => setHeld(null),
  };
};

export const useShown = (route: Placed, index: Index) => {
  const { filters } = route;
  const answers = useAnswers(index, route.screen === 'answers');
  const held = useHeld(
    route.screen === 'photo' ? route.photo : answers.current,
  );
  const large = held.photo === null ? undefined : index.byId.get(held.photo);
  const pile = answers.photos;
  const order = useMemo(() => {
    if (pile !== null) {
      return pile.flatMap((id) => index.byId.get(id) ?? []);
    }
    const shown = orderOf(index, filters);
    return large === undefined || shown.some(({ id }) => id === large.id)
      ? shown
      : orderOf(index, everything);
  }, [index, filters, large, pile]);
  return { held, large, order, pile, answers };
};
