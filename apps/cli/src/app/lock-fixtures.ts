import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { exclusively } from '../shared/lock.ts';
import { shootFiles } from '../shared/store.ts';
import { fake } from './command-fixtures.ts';

/** The lock of the test's shoot, which is beside its folder. */
export const lockFile = () =>
  join(fake.home, 'data', 'keepsake', 'locks', 'lisbon');

/** Runs `meanwhile` while another command holds the lock of a shoot. */
export const whileHeld = async <A>(
  meanwhile: () => Promise<A>,
  shoot = 'lisbon',
): Promise<A> => {
  const held = Promise.withResolvers<void>();
  const done = Promise.withResolvers<void>();
  const holding = Effect.runPromise(
    Effect.flatMap(shootFiles(shoot), (files) =>
      exclusively(files)(
        Effect.andThen(
          Effect.sync(() => held.resolve()),
          Effect.promise(() => done.promise),
        ),
      ),
    ).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromDotEnvContents(
            `HOME=${fake.home}\nXDG_DATA_HOME=${join(fake.home, 'data')}`,
          ),
        ),
      ),
    ),
  );
  await Promise.race([held.promise, holding]);
  try {
    return await meanwhile();
  } finally {
    done.resolve();
    await holding;
  }
};
