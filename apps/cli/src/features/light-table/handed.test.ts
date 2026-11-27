import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Fiber, FileSystem, type Path } from 'effect';
import { type ShootFiles, shootFiles } from '../../shared/store.ts';
import { readHandOvers } from './handed.ts';

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

const handedAt = '2026-04-01T11:00:00.000Z';

/** What was spent on the shoot so far, in a file as keepsake keeps it. */
const spent = (files: ShootFiles, dollars: number) =>
  writeFile(
    files.spending,
    JSON.stringify({
      model: { calls: 1, inputTokens: 1, outputTokens: 1, dollars },
    }),
  );

/** A shoot as keepsake left it before hand-overs had a file each. */
const oldShoot = async (files: ShootFiles) => {
  await mkdir(files.marks, { recursive: true });
  await writeFile(
    join(files.marks, 'one.json'),
    JSON.stringify({
      id: 'one',
      photo: 'B',
      note: 'Remove the chair',
      boxes: [],
      madeAt: '2026-04-01T10:00:00.000Z',
      handedOverAt: handedAt,
      answer: null,
      seenAt: null,
    }),
  );
  await writeFile(
    join(files.root, 'hand-overs.json'),
    JSON.stringify([{ at: handedAt, dollars: 1, album: false }]),
  );
};

/**
 * Reads the hand-overs, and stops once it looked whether a hand-over's file
 * is there, until it is let go on.
 */
const pausedReader = (files: ShootFiles) => {
  const looked = Promise.withResolvers<void>();
  const goOn = Promise.withResolvers<void>();
  const read = patched(readHandOvers(files), (fs) => ({
    exists: (path) =>
      path.startsWith(files.handOvers)
        ? fs.exists(path).pipe(
            Effect.tap(() =>
              Effect.promise(() => {
                looked.resolve();
                return goOn.promise;
              }),
            ),
          )
        : fs.exists(path),
  }));
  return { read, looked: looked.promise, goOn: () => goOn.resolve() };
};

describe('hand-overs from before they had a file each', () => {
  it('keep what the first one to read them made of them', async () => {
    const [first, second, after] = await withFiles((files) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await oldShoot(files);
          await spent(files, 1);
        });
        const early = pausedReader(files);
        const late = pausedReader(files);
        const reading = yield* Effect.forkChild(early.read);
        yield* Effect.promise(() => early.looked);
        // Something was spent while it read.
        yield* Effect.promise(() => spent(files, 3));
        const readingLate = yield* Effect.forkChild(late.read);
        yield* Effect.promise(() => late.looked);
        early.goOn();
        const one = yield* Fiber.join(reading);
        late.goOn();
        const other = yield* Fiber.join(readingLate);
        return [one, other, yield* readHandOvers(files)] as const;
      }),
    );
    expect(first).toMatchObject([{ marks: ['one'], spentBefore: 1 }]);
    expect(second).toEqual(first);
    expect(after).toEqual(first);
  });
});
