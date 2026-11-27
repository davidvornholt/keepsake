import type { ShootList } from '../../contract.ts';
import { readShoots } from '../data/api.ts';
import { everything, type Route } from './route.ts';
import { go, goBack } from './router.ts';
import { waitsForWord, walkOrder } from './walk-order.ts';

// The walk through what is new in all the albums, started on the start
// page: an album at a time, the one whose news is oldest first, each in the
// album's own view. An album that waits for the owner's word as a whole
// shows that first. After the last one the owner is back on the start page.

type Summary = ShootList['shoots'][number];

const newsOf = (shoot: string): Route => ({
  screen: 'news',
  shoot,
  filters: everything,
  across: true,
});

const walkTo = (shoot: string, shoots: ReadonlyArray<Summary>): Route =>
  waitsForWord(shoots, shoot)
    ? { screen: 'hand-over', shoot, filters: everything, across: true }
    : newsOf(shoot);

/** The albums this walk went through, which it doesn't come back to. */
const passed = new Set<string>();

/** Starts the walk at the album whose news is oldest. */
export const startWalk = (shoots: ReadonlyArray<Summary>): void => {
  passed.clear();
  const [first] = walkOrder(shoots);
  if (first !== undefined) {
    go(walkTo(first, shoots));
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
    go(walkTo(next, shoots), 'replace');
  }
};

/** Goes on from what an album waits for to what is new in it. */
export const walkPastDecision = (shoot: string): void => {
  go(newsOf(shoot), 'replace');
};
