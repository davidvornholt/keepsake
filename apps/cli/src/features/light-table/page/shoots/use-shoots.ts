import { useEffect, useEffectEvent, useState } from 'react';
import type { ShootList } from '../../contract.ts';
import { readShoots } from '../data/api.ts';

// The shoots there are, asked for again whenever the owner comes back to the
// page, since agents work on them in the meantime.

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

  return {
    ...state,
    retry: () => {
      setState(first);
      load().catch(() => undefined);
    },
  };
};
