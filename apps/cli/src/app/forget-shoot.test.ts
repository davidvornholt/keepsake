import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer } from 'effect';
import { forgetShoot } from '../features/light-table/new-shoot.ts';
import {
  failureOf,
  fake,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { send, statusOf, whileServing } from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const forget = () =>
  whileServing((address) =>
    statusOf(send('DELETE', `${address}/api/shoots/lisbon`)),
  );

/**
 * Forgets the shoot, and runs `meanwhile` when it is about to move or remove
 * the shoot's files, after it found that it may.
 */
const forgetting = async <A>(meanwhile: () => Promise<A>) => {
  const removing = Promise.withResolvers<void>();
  let found: Promise<A> | undefined;
  const first = <B, E, R>(effect: Effect.Effect<B, E, R>) =>
    Effect.andThen(
      Effect.promise(() => {
        found ??= meanwhile().finally(() => removing.resolve());
        return removing.promise;
      }),
      effect,
    );
  const slowly = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) => ({
      ...fs,
      rename: (from: string, to: string) => first(fs.rename(from, to)),
      remove: (
        path: string,
        options?: Parameters<FileSystem.FileSystem['remove']>[1],
      ) => first(fs.remove(path, options)),
    })),
  );
  await Effect.runPromise(
    forgetShoot('lisbon').pipe(
      Effect.provide(slowly),
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
  return found;
};

describe('forgetting a shoot', () => {
  it('waits for no command, and leaves the shoot to the one that runs', async () => {
    await scanLisbon();
    const status = await whileHeld(forget);
    expect(status).toBe(400);
    expect(existsSync(shootFile('shoot.json'))).toBe(true);
  });

  it('lets no command start while it removes the shoot', async () => {
    await scanLisbon();
    const meanwhile = await forgetting(() => failureOf('cull', 'lisbon'));
    expect((await meanwhile)?._tag).toBe('ShootBusy');
    expect((await failureOf('cull', 'lisbon'))._tag).toBe('StepMissing');
    expect(existsSync(shootFile())).toBe(false);
  });

  it('keeps a shoot that a paid model culled, though nothing was edited', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    expect(await forget()).toBe(400);
    expect(existsSync(shootFile('shoot.json'))).toBe(true);
  });

  it('forgets one that only a subscription culled', async () => {
    fakeTools.isSubscribed = true;
    await scanLisbon();
    expect(await forget()).toBe(204);
    expect(existsSync(shootFile())).toBe(false);
  });
});
