import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { Effect, Fiber } from 'effect';
import { bytesOf, mostCostOf } from '../shared/prices.ts';
import {
  judge,
  pickLisbon,
  setUp,
  shootFile,
  start,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

const imageModel = 'azure/gpt-image-2.5-sunburst';
/** What the fake vision model's usual answer costs. */
const oneQuestion = 0.15;

/** The most the last request to the image model could cost. */
const mostOfLastEdit = () =>
  mostCostOf(imageModel, {
    text:
      bytesOf(fakeModels.edits.at(-1)?.prompt ?? '') +
      bytesOf(imageModel.slice(imageModel.indexOf('/') + 1)),
    pictures: 1,
    versions: 2,
  }) ?? 0;

/** What `spending.json` holds for a model. */
const recordOf = (model: string) => {
  const path = shootFile('spending.json');
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))[model]
    : undefined;
};

const spentOn = (model: string): number => recordOf(model)?.dollars ?? 0;

/** What fetch fails with when a connection breaks off or can't be made. */
const connectionError = (code: string) =>
  Object.assign(new TypeError(`${code}: the connection failed`), { code });

/** Waits until `done` holds, or two seconds at the most. */
const until = (done: () => boolean, tries = 100): Promise<void> =>
  done() || tries === 0
    ? Promise.resolve()
    : Bun.sleep(20).then(() => until(done, tries - 1));

/**
 * Edits a photo, and stops it once its request was sent and `meanwhile` is
 * through, which may wait while keepsake waits to ask again.
 */
const editUntil = async (
  sent: Promise<unknown>,
  meanwhile: () => Promise<void> = () => Promise.resolve(),
) => {
  const editing = start('edit', 'lisbon', 'B', '--review-model', judge);
  await sent;
  await meanwhile();
  await Effect.runPromise(Fiber.interrupt(editing));
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, when an image request gets no answer', () => {
  it('counts it as spent when its connection breaks off', async () => {
    await pickLisbon();
    const sent = Promise.withResolvers<void>();
    fakeModels.editAnswer = () => {
      sent.resolve();
      throw connectionError('ECONNRESET');
    };
    await editUntil(sent.promise, () => until(() => spentOn(imageModel) > 0));
    expect(spentOn(imageModel)).toBeCloseTo(mostOfLastEdit());
    expect(recordOf(imageModel).calls).toBe(1);
  });

  it('counts it as spent when keepsake is stopped while it waits', async () => {
    await pickLisbon();
    const sent = Promise.withResolvers<void>();
    fakeModels.editAnswer = () => {
      sent.resolve();
      return new Promise<Response>(() => undefined);
    };
    await editUntil(sent.promise);
    expect(spentOn(imageModel)).toBeCloseTo(mostOfLastEdit());
  });

  it('counts nothing when it couldn’t reach the model', async () => {
    await pickLisbon();
    const sent = Promise.withResolvers<void>();
    fakeModels.editAnswer = () => {
      sent.resolve();
      throw connectionError('ECONNREFUSED');
    };
    await editUntil(sent.promise, () => Bun.sleep(100));
    expect(spentOn(imageModel)).toBe(0);
  });
});

describe('keepsake edit, when a question gets no answer', () => {
  it('counts it as spent when its connection breaks off', async () => {
    await pickLisbon();
    const before = recordOf(judge);
    const sent = Promise.withResolvers<void>();
    fakeModels.answers.crops = () => {
      sent.resolve();
      throw connectionError('ECONNRESET');
    };
    await editUntil(sent.promise, () =>
      until(() => recordOf(judge).calls > before.calls),
    );
    expect(recordOf(judge).calls).toBe(before.calls + 1);
    expect(spentOn(judge) - before.dollars).toBeGreaterThan(oneQuestion);
  });

  it('counts it as spent when keepsake is stopped while it waits', async () => {
    await pickLisbon();
    const before = recordOf(judge);
    const sent = Promise.withResolvers<void>();
    fakeModels.answers.crops = () => {
      sent.resolve();
      return new Promise<never>(() => undefined);
    };
    await editUntil(sent.promise);
    expect(recordOf(judge).calls).toBe(before.calls + 1);
    expect(spentOn(judge) - before.dollars).toBeGreaterThan(oneQuestion);
  });
});
