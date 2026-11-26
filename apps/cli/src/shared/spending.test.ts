import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { Spending } from './spending.ts';

const model = 'azure/gpt-6-astra';
const used = { inputTokens: 10_000, outputTokens: 1000 };
const readOnly = 0o500;
const writable = 0o700;

let directory = '';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'keepsake-spending-'));
});
afterEach(async () => {
  await chmod(directory, writable);
  await rm(directory, { recursive: true, force: true });
});

const spent = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

describe('what a command spends', () => {
  it('is written as soon as a request is counted', async () => {
    const path = join(directory, 'spending.json');
    const onDisk = await Effect.gen(function* () {
      const spending = yield* Spending;
      return yield* spending
        .add(model, used)
        .pipe(
          Effect.andThen(Effect.promise(() => spent(path))),
          spending.savingTo(path),
        );
    }).pipe(
      Effect.provide(Spending.layer),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    expect(onDisk[model]).toMatchObject({ calls: 1, dollars: 0.15 });
  });

  it('says when it can’t be written, and writes it with the next', async () => {
    const path = join(directory, 'spending.json');
    await chmod(directory, readOnly);
    const failure = await Effect.gen(function* () {
      const spending = yield* Spending;
      return yield* Effect.gen(function* () {
        const failed = yield* Effect.flip(spending.add(model, used));
        yield* Effect.promise(() => chmod(directory, writable));
        yield* spending.add(model, used);
        return failed;
      }).pipe(spending.savingTo(path));
    }).pipe(
      Effect.provide(Spending.layer),
      Effect.provide(BunServices.layer),
      Effect.runPromise,
    );
    expect(failure._tag).toBe('StoreFailed');
    expect(failure.message).toContain(path);
    expect((await spent(path))[model]).toMatchObject({ calls: 2 });
  });

  it('fails the step that ends with some of it unwritten', async () => {
    const path = join(directory, 'spending.json');
    await chmod(directory, readOnly);
    const result = await Effect.gen(function* () {
      const spending = yield* Spending;
      return yield* spending
        .add(model, used)
        .pipe(Effect.ignore, spending.savingTo(path));
    }).pipe(
      Effect.provide(Spending.layer),
      Effect.provide(BunServices.layer),
      Effect.result,
      Effect.runPromise,
    );
    expect(result).toMatchObject({ failure: { _tag: 'StoreFailed' } });
  });
});
