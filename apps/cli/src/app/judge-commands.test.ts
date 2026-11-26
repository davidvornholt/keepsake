import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  failureOf,
  judge,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, verdictAnswer } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('the model that judged a shoot', () => {
  const other = 'azure/other-model';

  it('is used for every later step', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon', '--model', other);
    expect((await runOk('show', 'lisbon')).judgedBy).toEqual({
      model: other,
      moments: 3,
    });
    expect(await runOk('cull', 'lisbon')).toMatchObject({ model: other });
    expect(await runOk('pick', 'lisbon')).toMatchObject({ picked: 3 });
    expect(new Set(fakeModels.asked.map(({ model }) => model))).toEqual(
      new Set(['other-model']),
    );
  });

  it('gives way to one that is asked for', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon', '--model', other);
    const { judgedBy } = await runOk('show', 'lisbon', '--model', judge);
    expect(judgedBy).toEqual({ model: judge, moments: 0 });
    await runOk('cull', 'lisbon', '--model', judge);
    expect((await runOk('show', 'lisbon')).judgedBy.model).toBe(judge);
  });

  it('stays when another one couldn’t judge enough of the shoot', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    const limit = () =>
      Response.json({ error: { message: 'limit' } }, { status: 400 });
    fakeModels.answers.judgement = limit;
    const failure = await failureOf('cull', 'lisbon', '--model', other);
    expect(failure._tag).toBe('ModelFailed');
    expect((await runOk('show', 'lisbon')).judgedBy.model).toBe(judge);
    let answered = 0;
    fakeModels.answers.judgement = () => {
      answered += 1;
      return answered === 1 ? verdictAnswer : limit();
    };
    const { failed } = await runOk('cull', 'lisbon', '--model', other);
    expect(failed).toHaveLength(2);
    expect((await runOk('show', 'lisbon')).judgedBy.model).toBe(judge);
    expect(await runOk('pick', 'lisbon')).toMatchObject({ picked: 3 });
    fakeModels.answers.judgement = verdictAnswer;
    await runOk('cull', 'lisbon', '--model', other);
    expect((await runOk('show', 'lisbon')).judgedBy.model).toBe(other);
  });

  it('is not changed by a benchmark', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    await writeFile(
      shootFile('ratings.json'),
      JSON.stringify([
        { moment: 'B', photos: ['B'], best: null, stars: 0, further: [] },
      ]),
    );
    await runOk('bench', 'lisbon', '--model', other);
    expect((await runOk('show', 'lisbon')).judgedBy.model).toBe(judge);
  });
});
