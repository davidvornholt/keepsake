import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
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

  it('stays whole after a write that stopped part of the way', async () => {
    let writes = 0;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const record = yield* usageRecorder({
          folder: Effect.sync(() => home),
          lines: (_events, { id }) => [{ type: 'assistant', id }],
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFileString: (path, text, options) => {
              writes += 1;
              return writes === 1
                ? Effect.andThen(
                    fs.writeFileString(path, text.slice(0, -10), options),
                    Effect.never,
                  )
                : fs.writeFileString(path, text, options);
            },
          }),
        );
        yield* record([]);
        yield* record([]);
      }).pipe(Effect.provide(BunServices.layer)),
    );
    const folder = join(home, 'keepsake');
    const [file = ''] = await readdir(folder);
    const read = (await readFile(join(folder, file), 'utf8'))
      .split('\n')
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    expect(read).toEqual([{ type: 'assistant', id: expect.any(String) }]);
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
