import { useMemo, useState } from 'react';
import type { CarryingOut } from '../../contract.ts';
import { type Index, pileAround } from '../data/derive.ts';
import { orderOf } from '../sheet/content.ts';
import { everything, type Within } from './route.ts';
import { useNews } from './use-news.ts';

// Which photo is shown large, if any, and the photos gone through from it.

/** The photo that is shown large, and for a moment after the owner left it. */
const useHeld = (open: string | null) => {
  const [held, setHeld] = useState(open);
  const [isOpen, setIsOpen] = useState(open !== null);
  const [visit, setVisit] = useState(0);
  if (open !== null && held !== open) {
    setHeld(open);
  }
  if (isOpen !== (open !== null)) {
    setIsOpen(open !== null);
    if (open !== null) {
      setVisit(visit + 1);
    }
  }
  return {
    photo: open ?? held,
    /**
     * Counts the times a photo was opened. One that is opened again while it
     * still travels back to the table is another visit, and starts afresh.
     */
    visit,
    isLeaving: open === null && held !== null,
    letGo: () => setHeld(null),
  };
};

export const useShown = (
  route: Within,
  index: Index,
  {
    carrying,
    onSeen,
  }: {
    readonly carrying: CarryingOut;
    readonly onSeen: (photo: string) => Promise<void>;
  },
) => {
  const { filters } = route;
  const answers = useNews(index, carrying, {
    isOn: route.screen === 'news',
    onSeen,
  });
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
    // A photo from behind another one stands where the one in front does.
    const front =
      large === undefined ? null : pileAround(index, large).front.id;
    return front === null || shown.some(({ id }) => id === front)
      ? shown
      : orderOf(index, everything);
  }, [index, filters, large, pile]);
  const isAcross = route.screen === 'news' && route.across === true;
  return { held, large, order, pile, answers, isAcross };
};
