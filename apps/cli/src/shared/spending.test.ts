import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { Deferred, Effect, Fiber } from 'effect';
import { mostCostOf } from './prices.ts';
import { Spending } from './spending.ts';

const model = 'azure/gpt-6-astra';
const used = { inputTokens: 10_000, outputTokens: 1000 };
const nothingSent = { text: 0, pictures: 0, versions: 1 };
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

const run = <A, E>(program: Effect.Effect<A, E, Spending>) =>
  program.pipe(
    Effect.provide(Spending.layer),
    Effect.provide(BunServices.layer),
    Effect.runPromise,
  );

/** A request that used `used`. */
const request = (spending: Spending['Service']) =>
  spending.paying(model, nothingSent, (paid) => paid.settle(used));

describe('what a command spends', () => {
  it('is written as soon as a request is counted', async () => {
    const path = join(directory, 'spending.json');
    const onDisk = await run(
      Effect.gen(function* () {
        const spending = yield* Spending;
        return yield* request(spending).pipe(
          Effect.andThen(Effect.promise(() => spent(path))),
          spending.savingTo(path),
        );
      }),
    );
    expect(onDisk[model]).toMatchObject({ calls: 1, dollars: 0.15 });
  });

  it('says when it can’t be written, and writes it with the next', async () => {
    const path = join(directory, 'spending.json');
    await chmod(directory, readOnly);
    const failure = await run(
      Effect.gen(function* () {
        const spending = yield* Spending;
        return yield* Effect.gen(function* () {
          const failed = yield* Effect.flip(request(spending));
          yield* Effect.promise(() => chmod(directory, writable));
          yield* request(spending);
          return failed;
        }).pipe(spending.savingTo(path));
      }),
    );
    expect(failure._tag).toBe('StoreFailed');
    expect(failure.message).toContain(path);
    expect((await spent(path))[model]).toMatchObject({ calls: 2 });
  });

  it('fails the step that ends with some of it unwritten', async () => {
    const path = join(directory, 'spending.json');
    await chmod(directory, readOnly);
    const result = await run(
      Effect.gen(function* () {
        const spending = yield* Spending;
        return yield* request(spending).pipe(
          Effect.ignore,
          spending.savingTo(path),
        );
      }).pipe(Effect.result),
    );
    expect(result).toMatchObject({ failure: { _tag: 'StoreFailed' } });
  });
});

describe('a budget', () => {
  const most = mostCostOf(model, nothingSent) ?? 0;

  it('frees what a request held in the same step that counts it', async () => {
    const path = join(directory, 'spending.json');
    // Room for two requests at their most, and for a third once one of them
    // has cost what `used` costs, but not for three at their most.
    const budget = 3 * most - 0.1;
    const third = await run(
      Effect.gen(function* () {
        const spending = yield* Spending;
        return yield* Effect.gen(function* () {
          const later = yield* Deferred.make<void>();
          const go = yield* Deferred.make<void>();
          const running = yield* spending
            .paying(model, nothingSent, () => Deferred.await(later))
            .pipe(Effect.forkChild);
          const settling = yield* spending
            .paying(model, nothingSent, (paid) =>
              Effect.andThen(Deferred.await(go), paid.settle(used)),
            )
            .pipe(Effect.forkChild);
          const bothHeld = budget - 2 * most;
          while ((yield* spending.left) > bothHeld) {
            yield* Effect.yieldNow;
          }
          const leftBefore = yield* spending.left;
          // Asks as soon as what is left changes, which may be while the
          // settled request is still being written.
          const asking = yield* Effect.gen(function* () {
            while ((yield* spending.left) === leftBefore) {
              yield* Effect.yieldNow;
            }
            return yield* Effect.result(request(spending));
          }).pipe(Effect.forkChild);
          yield* Deferred.succeed(go, undefined);
          yield* Fiber.join(settling);
          const asked = yield* Fiber.join(asking);
          yield* Deferred.succeed(later, undefined);
          yield* Fiber.join(running);
          return asked;
        }).pipe(spending.within(budget), spending.savingTo(path));
      }),
    );
    expect(third._tag).toBe('Success');
  });

  it('counts an answer that began and was cut off at its most', async () => {
    const path = join(directory, 'spending.json');
    await run(
      Effect.gen(function* () {
        const spending = yield* Spending;
        const fiber = yield* spending
          .paying(model, nothingSent, (paid) =>
            Effect.andThen(paid.answered, Effect.never),
          )
          .pipe(spending.savingTo(path), Effect.forkChild);
        yield* Effect.sleep('10 millis');
        yield* Fiber.interrupt(fiber);
      }),
    );
    expect((await spent(path))[model].dollars).toBeCloseTo(most);
  });
});
