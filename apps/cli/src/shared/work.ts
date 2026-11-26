import { Effect } from 'effect';
import { noted } from './activity.ts';
import { exclusively } from './lock.ts';
import { saveSpending } from './spending.ts';
import { type OpenShoot, openShoot, shootFiles } from './store.ts';

/**
 * Runs a step on a shoot that no other command is working on, and adds what
 * it spent to the shoot's spending, even when it fails half-way.
 */
export const workOn = <A, E, R>(
  name: string,
  step: (open: OpenShoot) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const files = yield* shootFiles(name);
    // Read only once the lock is held, so nothing changes it meanwhile.
    return yield* Effect.gen(function* () {
      const open = yield* openShoot(name);
      return yield* step(open).pipe(
        noted(open),
        Effect.ensuring(Effect.ignore(saveSpending(open.files))),
      );
    }).pipe(exclusively(files));
  });
