import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { usageRecorder } from './usage-records.ts';

let home = '';
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-usage-'));
});
afterEach(() => rm(home, { recursive: true, force: true }));

const usage = {
  folder: Effect.sync(() => home),
  lines: () => [{ type: 'assistant' }],
};

/** Records one call, on a file system that may be changed. */
const recordOnce = (
  change: (
    fs: FileSystem.FileSystem,
  ) => Partial<FileSystem.FileSystem> = () => ({}),
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const record = yield* usageRecorder(usage).pipe(
        Effect.provideService(FileSystem.FileSystem, { ...fs, ...change(fs) }),
      );
      yield* record([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

/** Who may read, write and enter it, such as `700`. */
const permissions = async (path: string) =>
  (await stat(path)).mode.toString(8).slice(-3);

describe('a usage record', () => {
  it('is for its owner alone, whatever the umask', async () => {
    const umask = process.umask(0o022);
    try {
      await recordOnce();
    } finally {
      process.umask(umask);
    }
    const folder = join(home, 'keepsake');
    const [file = ''] = await readdir(folder);
    expect(await permissions(folder)).toBe('700');
    expect(await permissions(join(folder, file))).toBe('600');
  });

  it('doesn’t hold up the answer when the file system is stuck', async () => {
    const started = performance.now();
    await recordOnce(() => ({ writeFileString: () => Effect.never }));
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('is left out when there is no folder for it', async () => {
    const folder = Effect.die(new Error('HOME is not set'));
    await Effect.runPromise(
      Effect.gen(function* () {
        const record = yield* usageRecorder({ ...usage, folder });
        yield* record([]);
      }).pipe(Effect.provide(BunServices.layer)),
    );
    expect(await readdir(home)).toEqual([]);
  });
});
