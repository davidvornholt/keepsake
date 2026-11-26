import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import {
  ConfigProvider,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Ref,
} from 'effect';
import { exclusively } from './lock.ts';
import { type ShootFiles, shootFiles } from './store.ts';

let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-lock-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

type Services = Layer.Success<typeof BunServices.layer>;

const inHome = <A, E>(
  effect: Effect.Effect<A, E, Services>,
  layer?: Layer.Layer<FileSystem.FileSystem, never, Services>,
) =>
  Effect.runPromise(
    effect.pipe(
      (work) => (layer === undefined ? work : Effect.provide(work, layer)),
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromDotEnvContents(`HOME=${home}`)),
      ),
    ),
  );

/**
 * A file system on which whoever reads the lock waits a moment for a second
 * reader, so two commands both see who held it before either goes on.
 */
const readingTogether = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* Effect.orDie(shootFiles('lisbon'));
    const readers = yield* Ref.make(0);
    const both = yield* Deferred.make<void>();
    return {
      ...fs,
      readFileString: (path: string, encoding?: string) =>
        path === files.lock
          ? Effect.gen(function* () {
              if ((yield* Ref.updateAndGet(readers, (n) => n + 1)) === 2) {
                yield* Deferred.succeed(both, undefined);
              }
              yield* Deferred.await(both).pipe(
                Effect.timeout('200 millis'),
                Effect.ignore,
              );
              return yield* fs.readFileString(path, encoding);
            })
          : fs.readFileString(path, encoding),
    };
  }),
);

/** Runs two commands at once, and counts how many worked at the same time. */
const twoCommands = (files: ShootFiles) =>
  Effect.gen(function* () {
    const inside = yield* Ref.make(0);
    const most = yield* Ref.make(0);
    const command = exclusively(files)(
      Effect.gen(function* () {
        const now = yield* Ref.updateAndGet(inside, (n) => n + 1);
        yield* Ref.update(most, (before) => Math.max(before, now));
        yield* Effect.sleep('50 millis');
        yield* Ref.update(inside, (n) => n - 1);
      }),
    ).pipe(Effect.result);
    const results = yield* Effect.all([command, command], {
      concurrency: 'unbounded',
    });
    return {
      most: yield* Ref.get(most),
      outcomes: results
        .map((result) =>
          result._tag === 'Success' ? 'done' : result.failure._tag,
        )
        .toSorted(),
    };
  });

describe('the lock of a shoot', () => {
  it('lets only one of two commands take over from one that was killed', async () => {
    const outcome = await inHome(
      Effect.gen(function* () {
        const files = yield* shootFiles('lisbon');
        yield* Effect.promise(async () => {
          await mkdir(dirname(files.lock), { recursive: true });
          await writeFile(files.lock, '999999999\n');
        });
        return yield* twoCommands(files);
      }),
      readingTogether,
    );
    expect(outcome).toEqual({ most: 1, outcomes: ['ShootBusy', 'done'] });
  });

  it('is let go when its command is killed', async () => {
    const lock = await inHome(
      Effect.map(shootFiles('lisbon'), (files) => files.lock),
    );
    const script = join(home, 'hold.ts');
    await writeFile(
      script,
      [
        `import { BunServices } from '@effect/platform-bun';`,
        `import { ConfigProvider, Effect } from 'effect';`,
        `import { exclusively } from '${join(import.meta.dir, 'lock.ts')}';`,
        `import { shootFiles } from '${join(import.meta.dir, 'store.ts')}';`,
        'await Effect.runPromise(',
        `  Effect.flatMap(shootFiles('lisbon'), (files) =>`,
        `    exclusively(files)(Effect.andThen(Effect.sync(() => console.log('held')), Effect.never)),`,
        '  ).pipe(',
        '    Effect.provide(BunServices.layer),',
        `    Effect.provide(ConfigProvider.layer(ConfigProvider.fromDotEnvContents('HOME=${home}'))),`,
        '  ),',
        ');',
      ].join('\n'),
    );
    const holder = Bun.spawn(['bun', script], {
      cwd: import.meta.dir,
      stdout: 'pipe',
    });
    const reader = holder.stdout.getReader();
    await reader.read();
    const command = () =>
      inHome(
        Effect.flatMap(shootFiles('lisbon'), (files) =>
          exclusively(files)(Effect.succeed('done')).pipe(
            Effect.catchTag('ShootBusy', ({ message }) =>
              Effect.succeed(message),
            ),
          ),
        ),
      );
    const whileHeld = await command();
    holder.kill('SIGKILL');
    await holder.exited;
    expect(whileHeld).toContain(`process ${holder.pid}`);
    expect(await command()).toBe('done');
    expect(await Bun.file(lock).exists()).toBe(false);
  });

  it('is let go when noting who holds it fails', async () => {
    const outcomes = await inHome(
      Effect.gen(function* () {
        const files = yield* shootFiles('lisbon');
        yield* Effect.promise(async () => {
          await mkdir(dirname(files.lock), { recursive: true });
          // Every write to it fails, as on a full disk.
          await symlink('/dev/full', files.lock);
        });
        const command = exclusively(files)(Effect.void).pipe(
          Effect.result,
          Effect.map((result) =>
            result._tag === 'Success' ? 'done' : result.failure._tag,
          ),
        );
        return [yield* command, yield* command];
      }),
    );
    expect(outcomes).toEqual(['StoreFailed', 'StoreFailed']);
  });
});
