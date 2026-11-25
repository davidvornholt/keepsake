import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, type FileSystem, type Path } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { during, noted, readActivity, tellStep } from './activity.ts';
import type { OpenShoot } from './store.ts';
import { shootFiles } from './store.ts';

let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-activity-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

type Needed =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

const withShoot = <A, E>(
  work: (open: OpenShoot) => Effect.Effect<A, E, Needed>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* shootFiles('lisbon');
      return yield* work({
        files,
        shoot: { name: 'lisbon', source: '/photos', about: null },
        photos: new Map(),
        moments: [],
      });
    }).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromDotEnvContents(`HOME=${home}`)),
      ),
    ),
  );

describe('what a command is doing', () => {
  it('is known while it runs', async () => {
    const told = await withShoot((open) =>
      Effect.gen(function* () {
        const working = yield* tellStep('edit', 1, 3).pipe(
          Effect.andThen(during('B')(readActivity(open.files))),
          noted(open),
        );
        return [working, yield* readActivity(open.files)];
      }),
    );
    expect(told).toEqual([
      {
        process: process.pid,
        step: 'edit',
        done: 1,
        total: 3,
        photos: ['B'],
      },
      null,
    ]);
  });

  it('is nothing when it was killed', async () => {
    const gone = Bun.spawn(['true']);
    await gone.exited;
    const told = await withShoot(({ files }) =>
      Effect.gen(function* () {
        const left = { process: gone.pid, step: 'edit', done: 1, total: 3 };
        yield* Effect.promise(() =>
          Bun.write(files.activity, JSON.stringify({ ...left, photos: [] })),
        );
        return yield* readActivity(files);
      }),
    );
    expect(told).toBeNull();
  });
});
