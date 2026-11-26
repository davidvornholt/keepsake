import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  credentialsPath,
  endpoint,
  pickLisbon,
  runOk,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(async () => {
  await setUp(spyOn);
  await Bun.write(
    credentialsPath(),
    JSON.stringify({
      azure: { endpoint, apiKey: fakeModels.key },
      openai: { endpoint: null, apiKey: fakeModels.key },
    }),
  );
});
afterEach(tearDown);

const azure = new URL(endpoint).host;
const openai = 'api.openai.com';

describe('the model that looks after the edits', () => {
  // A model whose price keepsake knows, so the budget can count it.
  const edit = () =>
    runOk('edit', 'lisbon', 'B', '--review-model', 'openai/gpt-6-astra');

  it('is asked about everything but the crop', async () => {
    await pickLisbon();
    fakeModels.asked = [];
    await edit();
    const models = fakeModels.asked.map(({ name, host }) => [name, host]);
    expect(models).toEqual([
      ['crops', azure],
      ['removals', openai],
      ['description', openai],
      ['people', openai],
      ['everyone', openai],
      ['animals', openai],
      ['signs', openai],
      ['textures', openai],
      ['assessment', openai],
      ['faults', openai],
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
