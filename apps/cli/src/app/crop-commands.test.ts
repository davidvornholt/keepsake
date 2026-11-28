import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  judge,
  pickLisbon,
  run,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

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
    const { box } = await shootJson('edits', 'B', 'crop.json');
    expect(fakeModels.edits[0]?.size).toBe('3520x2352');
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

describe('keepsake edit, a panorama', () => {
  it.each([
    {
      shape: 'wide',
      camera: '12000 2000',
      input: '3840x640!',
      edited: '3840x1280',
      edges: 'top and bottom edges',
      grey: '3840x1280+0-320',
      kept: '3840x640+0+320',
    },
    {
      shape: 'tall',
      camera: '2000 12000',
      input: '640x3840!',
      edited: '1280x3840',
      edges: 'left and right edges',
      grey: '1280x3840-320+0',
      kept: '640x3840+320+0',
    },
  ])(
    'edits all of a $shape one with grey beside it, which it cuts away again',
    async ({ camera, input, edited, edges, grey, kept }) => {
      fakeTools.cameraSize = camera;
      await pickLisbon();
      await editLisbon('B');
      expect((await shootJson('edits', 'B', 'crop.json')).box).toEqual({
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
      });
      const runs = fakeTools.runs.map(({ args }) => args);
      expect(runs.some((args) => args.includes(input))).toBe(true);
      const [edit] = fakeModels.edits;
      expect(edit?.size).toBe(edited);
      expect(edit?.prompt).toContain(`The plain grey area at the ${edges}`);
      expect(
        runs.some((args) => args.at(-1) === 'jpg:-' && args.includes(grey)),
      ).toBe(true);
      expect(runs.filter((args) => args.includes(kept))).toHaveLength(
        fakeModels.edits.length * 2,
      );
      expect(asked('assessment')[0]?.texts.join()).not.toContain('grey area');
    },
  );

  it('keeps every column of one that doesn’t divide evenly, also from the camera', async () => {
    fakeTools.cameraSize = '12345 2048';
    await pickLisbon();
    fakeModels.answers.assessment = {
      assessments: [assessment(1, { withoutErrors: false })],
    };
    await editLisbon('B');
    const frames = fakeTools.runs
      .filter(({ args }) => args.includes('-extent'))
      .map(({ args }) => args[args.indexOf('-extent') + 1]);
    expect(frames[0]).toBe('12345x2048+0+0');
    expect(frames.at(-1)).toBe('12345x2048+0+0');
  });

  it('pays once for versions it couldn’t cut back the first time', async () => {
    fakeTools.cameraSize = '12000 2000';
    await pickLisbon();
    const kept = '3840x640+0+320';
    let cuts = 0;
    fakeTools.pause = ({ args }) => {
      cuts += args.includes(kept) ? 1 : 0;
      if (cuts === 2) {
        fakeTools.broken.add(kept);
      }
    };
    fakeTools.late = () => {
      fakeTools.broken.delete(kept);
    };
    await run('edit', 'lisbon', 'B', '--review-model', judge);
    expect(cuts).toBe(2);
    fakeTools.pause = undefined;
    await editLisbon('B');
    expect(fakeModels.edits).toHaveLength(1);
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
    });
  });
});
