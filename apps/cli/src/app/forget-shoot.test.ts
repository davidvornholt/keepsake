import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer } from 'effect';
import { forgetShoot } from '../features/light-table/new-shoot.ts';
import {
  failureOf,
  fake,
  putPhotos,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import {
  eventually,
  send,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

/** Long enough for a request to get to where it waits. */
const pause = 50;

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

  it('removes its smaller pictures once those being made are there, and only its own', async () => {
    await scanLisbon();
    const porto = join(fake.home, 'porto');
    await putPhotos(porto);
    await runOk('scan', porto, '--name', 'porto');
    const cache = (shoot: string) =>
      join(fake.home, 'cache', 'keepsake', shoot);
    const making = Promise.withResolvers<void>();
    const made = Promise.withResolvers<void>();
    const holdUp = () => {
      making.resolve();
      return made.promise;
    };
    fakeTools.pause = ({ command, args }) =>
      command === 'magick' &&
      args.some((arg) => arg.startsWith(cache('lisbon')))
        ? holdUp()
        : undefined;
    const status = await whileServing(async (address) => {
      await fetch(`${address}/api/shoots/porto`);
      await eventually(async () => existsSync(cache('porto')), Boolean);
      await fetch(`${address}/api/shoots/lisbon`);
      await making.promise;
      const forgot = statusOf(send('DELETE', `${address}/api/shoots/lisbon`));
      await Bun.sleep(pause);
      made.resolve();
      return forgot;
    });
    expect(status).toBe(204);
    expect(existsSync(cache('lisbon'))).toBe(false);
    expect(existsSync(cache('porto'))).toBe(true);
  });

  it('forgets one that only a subscription culled', async () => {
    await scanLisbon();
    const model = 'claude/claude-opus-5-5';
    await Bun.write(
      shootFile('verdicts', 'claude--claude-opus-5-5', 'A1.json'),
      '{}',
    );
    await Bun.write(
      shootFile('spending.json'),
      JSON.stringify({
        [model]: { calls: 3, inputTokens: 9, outputTokens: 3, dollars: 0 },
      }),
    );
    expect(await forget()).toBe(204);
    expect(existsSync(shootFile())).toBe(false);
  });

  it('leaves nothing of one whose removal stopped half-way', async () => {
    const left = (name: string) =>
      join(fake.home, 'data', 'keepsake', 'shoots', name);
    await Bun.write(join(left('.forgotten-1'), 'shoot.json'), '{}');
    await whileServing(async () => undefined);
    expect(existsSync(left('.forgotten-1'))).toBe(false);
    await Bun.write(join(left('.forgotten-2'), 'shoot.json'), '{}');
    await scanLisbon();
    await forget();
    expect(existsSync(left('.forgotten-2'))).toBe(false);
    expect(existsSync(left('lisbon'))).toBe(false);
  });
});
