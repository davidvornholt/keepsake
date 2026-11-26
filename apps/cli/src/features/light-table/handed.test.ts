import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, type Path } from 'effect';
import { type ShootFiles, shootFiles } from '../../shared/store.ts';
import { claim, claimOn } from './handed.ts';

let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-handed-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

type Needed = FileSystem.FileSystem | Path.Path;

const withFiles = <A, E>(
  work: (files: ShootFiles) => Effect.Effect<A, E, Needed>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* shootFiles('lisbon');
      yield* Effect.promise(() => mkdir(files.handOvers, { recursive: true }));
      return yield* work(files);
    }).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromDotEnvContents(`HOME=${home}`)),
      ),
    ),
  );

/** Runs `work` with a file system that `change` is made to. */
const patched = <A, E>(
  work: Effect.Effect<A, E, Needed>,
  change: (fs: FileSystem.FileSystem) => Partial<FileSystem.FileSystem>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.provideService(work, FileSystem.FileSystem, {
      ...fs,
      ...change(fs),
    });
  });

const isClaim = (path: string) => path.endsWith('.claim');

const madeEmpty = (path: string) =>
  Effect.andThen(
    Effect.promise(() => writeFile(path, '', { flag: 'wx' })),
    Effect.interrupt,
  );

/** A file system that stops where a claim is put in place. */
const stopAtClaim = (
  fs: FileSystem.FileSystem,
): Partial<FileSystem.FileSystem> => ({
  writeFileString: (path, text, options) =>
    isClaim(path) ? madeEmpty(path) : fs.writeFileString(path, text, options),
  link: (from, to) => (isClaim(to) ? Effect.interrupt : fs.link(from, to)),
});

describe('a claim', () => {
  it('is there whole or not at all when taking it stops', async () => {
    const [stopped, retaken, taken] = await withFiles((files) =>
      Effect.gen(function* () {
        // Stops where the claim would be published: when its file is made,
        // or linked to where it is found.
        const stop = patched(claim(files, 'one', 'page'), stopAtClaim);
        const exit = yield* Effect.exit(stop);
        return [
          exit._tag,
          yield* claim(files, 'one', 'waiter'),
          yield* claimOn(files, 'one'),
        ] as const;
      }),
    );
    expect(stopped).toBe('Failure');
    expect(retaken).toBe(true);
    expect(taken).toMatchObject({ by: 'waiter', isAcknowledged: true });
  });

  it('is taken by one only', async () => {
    const taken = await withFiles((files) =>
      Effect.all([claim(files, 'one', 'page'), claim(files, 'one', 'waiter')], {
        concurrency: 'unbounded',
      }),
    );
    expect(taken.toSorted()).toEqual([false, true]);
  });
});
