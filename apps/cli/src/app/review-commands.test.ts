import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  pickLisbon,
  runOk,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('the model that looks after the edits', () => {
  const edit = () =>
    runOk('edit', 'lisbon', 'B', '--review-model', 'azure/reviewer');

  it('is asked about everything but the crop', async () => {
    await pickLisbon();
    fakeModels.asked = [];
    await edit();
    const models = fakeModels.asked.map(({ name, model }) => [name, model]);
    expect(models).toEqual([
      ['crops', 'gpt-6-astra'],
      ['removals', 'reviewer'],
      ['description', 'reviewer'],
      ['people', 'reviewer'],
      ['everyone', 'reviewer'],
      ['signs', 'reviewer'],
      ['textures', 'reviewer'],
      ['assessment', 'reviewer'],
      ['faults', 'reviewer'],
    ]);
    expect(fakeModels.edits[0]?.prompt).toContain('A heron takes off.');
  });

  it('describes a photo only once', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () =>
      Response.json({ error: { message: 'busy' } }, { status: 404 });
    expect((await edit()).failed).toHaveLength(1);
    fakeModels.editAnswer = undefined;
    expect((await edit()).edited).toBe(1);
    expect(asked('description')).toHaveLength(1);
  });
});
