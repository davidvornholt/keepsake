import { Effect } from 'effect';
import { noted } from './activity.ts';
import { exclusively } from './lock.ts';
import { Spending } from './spending.ts';
import { type OpenShoot, openShoot } from './store.ts';

/**
 * Runs a step on a shoot that no other command is working on, and adds what
 * it spends to the shoot's spending as it is spent.
 */
export const workOn = <A, E, R>(
  name: string,
  step: (open: OpenShoot) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const open = yield* openShoot(name);
    const spending = yield* Spending;
    return yield* step(open).pipe(
      noted(open),
      spending.savingTo(open.files.spending),
      exclusively(open.files),
    );
  });
