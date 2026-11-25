import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  pickLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, cropping', () => {
  it('crops to the framing the model chooses', async () => {
    await pickLisbon();
    fakeModels.answers.crops = {
      subject: { left: 0.4, top: 0.4, right: 0.5, bottom: 0.5 },
      facing: 'neither',
      belongings: [],
      crops: [
        {
          box: { left: 0.3, top: 0.3, right: 0.6, bottom: 0.6 },
          aspect: '4:5',
          reason: 'Tight.',
        },
      ],
    };
    fakeModels.answers.choice = { best: 2, reason: 'Closer is better.' };
    await editLisbon('B');
    expect(fakeModels.edits[0]?.size).toBe('2576x3216');
    expect(await shootJson('edits', 'B', 'crop.json')).toMatchObject({
      aspect: '4:5',
      reason: 'Closer is better.',
    });
  });

  it('keeps in a crop what belongs to the photo, however tight it is', async () => {
    await pickLisbon();
    const tight = (shape: string, reason: string) => ({
      box: { left: 0.4, top: 0.6, right: 0.5, bottom: 0.7 },
      aspect: shape,
      reason,
    });
    fakeModels.answers.crops = {
      subject: { left: 0.4, top: 0.6, right: 0.5, bottom: 0.7 },
      facing: 'neither',
      belongings: [
        {
          what: 'The tower behind the flower',
          box: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.5 },
        },
      ],
      // The first one can't show the tower, so nobody is asked about it.
      crops: [tight('9:16', 'Tall.'), tight('3:2', 'Tight.')],
    };
    fakeModels.answers.choice = { best: 2, reason: 'Closer is better.' };
    await editLisbon('B');
    expect(asked('choice')[0]?.images).toBe(2);
    const { aspect, box } = await shootJson('edits', 'B', 'crop.json');
    expect(aspect).toBe('3:2');
    expect(box.left).toBeLessThan(0.2);
    expect(box.top).toBeLessThan(0.2);
    expect(box.right).toBeGreaterThan(0.8);
    expect(box.bottom).toBeGreaterThan(0.7);
  });

  it('gives an animal more room where it looks', async () => {
    await pickLisbon();
    fakeModels.answers.crops = {
      subject: { left: 0.5, top: 0.4, right: 0.6, bottom: 0.6 },
      facing: 'left',
      belongings: [],
      crops: [
        {
          box: { left: 0.4, top: 0.2, right: 0.9, bottom: 0.7 },
          aspect: '3:2',
          reason: 'Closer.',
        },
      ],
    };
    fakeModels.answers.choice = { best: 2, reason: 'Closer is better.' };
    await editLisbon('B');
    const { box } = await shootJson('edits', 'B', 'crop.json');
    expect(0.5 - box.left).toBeGreaterThan(box.right - 0.6);
    expect(box.right - box.left).toBeCloseTo(0.5);
  });
});
