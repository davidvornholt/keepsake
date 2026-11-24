import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  pickLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const beyondLeftEdge = /^\d+x\d+-\d+\+\d+$/u;

describe('a crop beyond the photo', () => {
  const beyond = () => {
    fakeModels.answers.crops = {
      subject: { left: 0, top: 0.4, right: 0.5, bottom: 0.6 },
      belongings: [],
      crops: [
        {
          box: { left: -0.2, top: 0, right: 1, bottom: 1 },
          aspect: '16:9',
          reason: 'The wing is cut off.',
        },
      ],
    };
    fakeModels.answers.choice = { best: 2, reason: 'The wing is whole.' };
  };

  it('has the scene continued where a crop reaches beyond the photo', async () => {
    await pickLisbon();
    beyond();
    await editLisbon('B');
    expect(fakeModels.edits[0]?.prompt).toContain('grey area at the left edge');
    const question = asked('description')[0]?.texts[0];
    expect(question).toContain('grey area at the left edge is not part of it');
    expect(question).toContain('nor that anything is cut off at it');
    expect(asked('assessment')[0]?.texts.join()).toContain(
      'grey area at the left edge',
    );
    const { box } = await shootJson('edits', 'B', 'crop.json');
    expect(box.left).toBeLessThan(-0.15);
    const frames = fakeTools.runs.flatMap(({ args }) =>
      args.filter((arg) => beyondLeftEdge.test(arg)),
    );
    expect(frames.length).toBeGreaterThan(0);
  });

  it('keeps only what there is of the camera’s own picture', async () => {
    await pickLisbon();
    beyond();
    fakeModels.answers.assessment = {
      assessments: [assessment(1, { withoutErrors: false })],
    };
    await editLisbon('B');
    const last = fakeTools.runs.findLast(({ args }) =>
      args.includes('-extent'),
    );
    expect(last?.args).toContain('6956x4672+0+0');
  });
});
