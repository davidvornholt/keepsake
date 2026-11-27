// biome-ignore-all lint/style/useNamingConvention: the API's names for tokens
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { Effect, Fiber } from 'effect';
import { bytesOf, mostCostOf } from '../shared/prices.ts';
import {
  asked,
  editLisbon,
  failureOf,
  judge,
  pickLisbon,
  setUp,
  shootFile,
  start,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';

const imageModel = 'azure/gpt-image-2.5-sunburst';
/** What the fake image model's answer costs. */
const oneRequest = 0.432;
/** What the fake vision model's usual answer costs. */
const oneQuestion = 0.15;
/** What a vision model is sent as the most it may answer. */
const outputLimit = 6000;
/**
 * Three versions make an image request cost more at its most than the
 * review of them, so a budget can cover the review but not another attempt.
 */
const threeVersions = ['--versions', '3'] as const;
const reviewButNoSecondAttempt = '1.35';

/** The most the last request to the image model could cost. */
const mostOfLastEdit = () =>
  mostCostOf(imageModel, {
    text:
      bytesOf(fakeModels.edits.at(-1)?.prompt ?? '') +
      bytesOf(imageModel.slice(imageModel.indexOf('/') + 1)),
    pictures: 1,
    versions: 2,
  });

const free = { prompt_tokens: 0, completion_tokens: 0 };

/** What `spending.json` holds for a model. */
const recordOf = (model: string) => {
  const path = shootFile('spending.json');
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))[model]
    : undefined;
};

const spentOn = (model: string) => recordOf(model)?.dollars ?? 0;

/** Every version fails its review, so another attempt is wanted. */
const everyVersionFails = () => {
  fakeModels.answers.assessment = {
    assessments: [1, 2, 3].map((version) =>
      assessment(version, { sameMoment: false }),
    ),
  };
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, with a budget', () => {
  it('sends no paid request that the budget doesn’t cover', async () => {
    await pickLisbon();
    const questions = fakeModels.asked.length;
    const result = await editLisbon('--budget', '0.01');
    expect(result).toMatchObject({ edited: 0, dollarsSpent: 0 });
    expect(result.overBudget).toHaveLength(3);
    expect(fakeModels.edits).toHaveLength(0);
    expect(fakeModels.asked).toHaveLength(questions);
  });

  it('asks for no second attempt that the budget doesn’t cover', async () => {
    await pickLisbon();
    fakeModels.chatUsage = free;
    everyVersionFails();
    const result = await editLisbon(
      'B',
      ...threeVersions,
      '--budget',
      reviewButNoSecondAttempt,
    );
    expect(asked('assessment')).toHaveLength(1);
    expect(result.overBudget).toEqual(['B']);
    expect(fakeModels.edits).toHaveLength(1);
    expect(result.dollarsSpent).toBeCloseTo(oneRequest);
    expect(existsSync(shootFile('edits', 'B', 'B-keepsake.jpg'))).toBe(false);
  });

  it('refuses a model whose price it doesn’t know', async () => {
    await pickLisbon();
    const questions = fakeModels.asked.length;
    const failure = await failureOf(
      'edit',
      'lisbon',
      'B',
      '--review-model',
      'azure/gpt-unknown',
    );
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain('azure/gpt-unknown');
    expect(fakeModels.asked).toHaveLength(questions);
    expect(fakeModels.edits).toHaveLength(0);
  });

  it('counts an answer that doesn’t say what it used at the most', async () => {
    await pickLisbon();
    fakeModels.chatUsage = undefined;
    fakeModels.editAnswer = () =>
      Response.json({
        data: [{ b64_json: btoa('a png') }, { b64_json: btoa('a png') }],
      });
    const result = await editLisbon('B');
    expect(result.models[imageModel].dollars).toBeCloseTo(
      mostOfLastEdit() ?? 0,
    );
    expect(result.models[judge].dollars).toBeGreaterThan(0);
  });

  it('holds what a request sends, however long its prompt', async () => {
    await pickLisbon();
    const wish = 'Make the sky a little bluer. '.repeat(7000);
    const result = await editLisbon('B', '--wish', wish, '--budget', '2');
    expect(result.overBudget).toEqual(['B']);
    expect(fakeModels.edits).toHaveLength(0);
  });

  it('tells a vision model how much it may answer', async () => {
    await pickLisbon();
    await editLisbon('B');
    expect(fakeModels.asked.map((question) => question.outputLimit)).toEqual(
      fakeModels.asked.map(() => outputLimit),
    );
  });
});

describe('keepsake edit, when a question’s answer breaks off', () => {
  it('counts it as spent and doesn’t ask again', async () => {
    await pickLisbon();
    fakeModels.answers.crops = () =>
      new Response('{"id":"answer","choices":[{"in', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const before = recordOf(judge);
    // Covers one question about the crop at its most, not two.
    const result = await editLisbon('B', '--budget', '0.5');
    expect(asked('crops')).toHaveLength(1);
    expect(result.failed[0].reason).toContain('counted as spent');
    expect(recordOf(judge).calls).toBe(before.calls + 1);
    expect(spentOn(judge) - before.dollars).toBeGreaterThan(oneQuestion);
  });
});

describe('keepsake edit, when an answer has the wrong shape', () => {
  it('counts each answer before it asks again', async () => {
    await pickLisbon();
    fakeModels.answers.crops = { crops: 'none' };
    const result = await editLisbon('B');
    expect(asked('crops')).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.models[judge]).toMatchObject({ calls: 2 });
    expect(result.models[judge].dollars).toBeCloseTo(2 * oneQuestion);
  });
});

describe('keepsake edit, when an answer breaks off', () => {
  it('counts it as spent and doesn’t ask again', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () => {
      const beginning = new TextEncoder().encode('{"data":[{"b64_json":"YS');
      const body = new ReadableStream({
        start: (controller) => {
          controller.enqueue(beginning);
          controller.error(new Error('connection reset'));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await editLisbon('B');
    expect(fakeModels.edits).toHaveLength(1);
    expect(result.failed[0].reason).toContain('counted as spent');
    expect(result.models[imageModel].dollars).toBeCloseTo(
      mostOfLastEdit() ?? 0,
    );
    expect(spentOn(imageModel)).toBeCloseTo(mostOfLastEdit() ?? 0);
  });

  it('counts it as spent when keepsake is stopped while it arrives', async () => {
    await pickLisbon();
    const arriving = Promise.withResolvers<void>();
    fakeModels.editAnswer = () => {
      const body = new ReadableStream(
        {
          // Asked for only once the answer is read; the rest never comes.
          pull: (controller) => {
            controller.enqueue(new TextEncoder().encode('{"data":['));
            arriving.resolve();
            return new Promise<void>(() => undefined);
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const editing = start('edit', 'lisbon', 'B', '--review-model', judge);
    await arriving.promise;
    await Effect.runPromise(Fiber.interrupt(editing));
    expect(spentOn(imageModel)).toBeCloseTo(mostOfLastEdit() ?? 0);
  });
});

describe('what an edit spends', () => {
  it('is on disk as soon as a request has been answered', async () => {
    await pickLisbon();
    const onDisk: Array<number> = [];
    fakeModels.answers.assessment = () => {
      onDisk.push(spentOn(imageModel));
      return { assessments: [assessment(1), assessment(2)] };
    };
    await editLisbon('B');
    expect(onDisk[0]).toBeCloseTo(oneRequest);
  });
});

describe('keepsake edit, with a wish and a budget', () => {
  const finalFile = () => shootFile('edits', 'B', 'B-keepsake.jpg');

  it('makes no attempt that the budget doesn’t cover, and goes on with it when there is more', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    fakeModels.chatUsage = free;
    const box = { left: 0.1, top: 0.4, right: 0.3, bottom: 0.6 };
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [{ part: 0, what: 'Remove the chair', isRemoval: true, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 0, notes: 'A leg of it is left' }],
    };
    // The first attempt and its review fit, a second attempt doesn't: the
    // reviewer's questions are held at the most they can cost.
    const result = await editLisbon(
      'B',
      '--wish',
      'No chair',
      ...threeVersions,
      '--budget',
      reviewButNoSecondAttempt,
    );
    expect(fakeModels.edits).toHaveLength(2);
    expect(asked('choices')).toHaveLength(1);
    // It isn't done, so it isn't answered as if it were.
    expect(result).toMatchObject({ overBudget: ['B'], notDone: [] });
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
    // With more money, only the place that is left is tried again.
    const more = await editLisbon('B', '--wish', 'No chair', ...threeVersions);
    expect(fakeModels.edits).toHaveLength(3);
    expect(fakeModels.edits[2]?.prompt).toContain(
      'An earlier attempt failed: A leg of it is left.',
    );
    expect(asked('choices')).toHaveLength(2);
    expect(more.overBudget).toEqual([]);
    expect(more.notDone).toEqual([
      { photo: 'B', what: 'Remove the chair. A leg of it is left.' },
    ]);
  });
});
