import type { ShootList } from '../../contract.ts';
import { readShoots } from '../data/api.ts';
import { everything, type Route } from './route.ts';
import { go, goBack } from './router.ts';
import { walkOrder } from './walk-order.ts';

// The walk through what is new in all the albums, started on the start
// page: an album at a time, the one whose news is oldest first, each in the
// album's own view. After the last one the owner is back on the start page.

type Summary = ShootList['shoots'][number];

const walkTo = (shoot: string): Route => ({
  screen: 'news',
  shoot,
  filters: everything,
  across: true,
});

/** The albums this walk went through, which it doesn't come back to. */
const passed = new Set<string>();

/** Starts the walk at the album whose news is oldest. */
export const startWalk = (shoots: ReadonlyArray<Summary>): void => {
  passed.clear();
  const [first] = walkOrder(shoots);
  if (first !== undefined) {
    go(walkTo(first));
  }
};

/** Goes on from an album that was walked through, to the next or back to the start. */
export const walkOn = async (from: string): Promise<void> => {
  passed.add(from);
  const shoots = await readShoots().then(
    (list) => list.shoots,
    (): ReadonlyArray<Summary> => [],
  );
  const [next] = walkOrder(shoots, passed);
  if (next === undefined) {
    goBack({ screen: 'shoots' });
  } else {
    go(walkTo(next), 'replace');
  }
};
