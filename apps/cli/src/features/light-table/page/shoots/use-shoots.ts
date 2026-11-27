import { useEffect, useEffectEvent, useState } from 'react';
import type { ShootList } from '../../contract.ts';
import { readShoots } from '../data/api.ts';
import { isBusy } from './words.ts';

// The albums there are, asked for again whenever the owner comes back to the
// page, since keepsake works on them in the meantime, and every little while
// as long as something goes on at one of them.

/** How often the shelf asks while something goes on, in milliseconds. */
const askEvery = 2000;

export type ShootSummary = ShootList['shoots'][number];

type State = {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly shoots: ReadonlyArray<ShootSummary>;
  readonly problem: string | null;
};

const first: State = { status: 'loading', shoots: [], problem: null };

export const useShoots = () => {
  const [state, setState] = useState(first);

  const load = useEffectEvent(async () => {
    try {
      const { shoots } = await readShoots();
      setState({ status: 'ready', shoots, problem: null });
    } catch (error) {
      // What is on the table stays there when asking again fails.
      setState((now) =>
        now.status === 'ready'
          ? now
          : {
              status: 'failed',
              shoots: [],
              problem: error instanceof Error ? error.message : null,
            },
      );
    }
  });

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') {
        load().catch(() => undefined);
      }
    };
    again();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, []);

  const isLive = state.shoots.some(isBusy);
  useEffect(() => {
    if (!isLive) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        load().catch(() => undefined);
      }
    }, askEvery);
    return () => clearInterval(timer);
  }, [isLive]);

  return {
    ...state,
    retry: () => {
      setState(first);
      load().catch(() => undefined);
    },
  };
};
