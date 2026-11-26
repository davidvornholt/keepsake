import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  asked,
  editLisbon,
  pickLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, with everyone else', () => {
  it('puts them and the forest back into every version', async () => {
    await pickLisbon();
    const box = { left: 0.1, top: 0.1, right: 0.2, bottom: 0.9 };
    fakeModels.answers.everyone = {
      everyone: [
        { part: 0, box },
        // Too large, too small, empty, or in a part that isn't there.
        { part: 0, box: { left: 0, top: 0, right: 0.5, bottom: 0.9 } },
        { part: 0, box: { ...box, bottom: 0.1001 } },
        { part: 0, box: { ...box, right: 0.1 } },
        { part: 99, box },
      ],
    };
    const forest = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
    ];
    fakeModels.answers.textures = {
      outlines: [
        forest,
        forest.slice(1),
        forest.map(({ x, y }) => ({ x: x / 10, y: y / 10 })),
      ],
    };
    await editLisbon('B');
    expect(await shootJson('edits', 'B', 'bystanders.json')).toEqual([box]);
    expect(await shootJson('edits', 'B', 'textures.json')).toEqual([forest]);
    expect(existsSync(shootFile('edits', 'B', 'version-2-kept.png'))).toBe(
      true,
    );
  });
});

describe('keepsake edit, with animals', () => {
  it('puts back those too small for the image model to draw', async () => {
    await pickLisbon();
    const box = { left: 0.1, top: 0.1, right: 0.3, bottom: 0.6 };
    fakeModels.answers.animals = {
      animals: [
        { part: 0, box },
        // A speck, or in a part that isn't there.
        { part: 0, box: { ...box, right: 0.12, bottom: 0.12 } },
        { part: 99, box },
      ],
    };
    await editLisbon('B');
    expect(await shootJson('edits', 'B', 'animals.json')).toEqual([box]);
    expect(existsSync(shootFile('edits', 'B', 'version-2-kept.png'))).toBe(
      true,
    );
  });
});

describe('keepsake edit, looking closely', () => {
  const fault = (overrides: object = {}) => ({
    part: 1,
    box: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 },
    what: 'A face is melted.',
    kind: 'people',
    serious: true,
    rightInOriginal: true,
    inOriginal: false,
    ...overrides,
  });
  /** Answers with each of these in turn, and with the last one from then on. */
  const inTurn = (...answers: ReadonlyArray<ReadonlyArray<object>>) => {
    fakeModels.answers.faults = () => ({
      faults: answers[asked('faults').length - 1] ?? answers.at(-1),
    });
  };
  const finishedFrom = () =>
    fakeTools.runs
      .filter(({ command }) => command === 'magick')
      .map(({ args }) => args[0]);

  it('puts back what few notice too', async () => {
    await pickLisbon();
    inTurn([fault({ serious: false })], [fault({ serious: false })]);
    expect((await editLisbon('B')).edited).toBe(1);
    expect(asked('faults')).toHaveLength(3);
    expect(finishedFrom().at(-1)).toEndWith('B/version-1-mended.png');
  });

  it('leaves alone what the original has wrong too', async () => {
    await pickLisbon();
    inTurn([
      fault({ serious: false, rightInOriginal: false, inOriginal: true }),
    ]);
    expect((await editLisbon('B')).edited).toBe(1);
    expect(asked('faults')).toHaveLength(1);
  });

  it('puts back from the original what is wrong', async () => {
    await pickLisbon();
    inTurn(
      [
        fault(),
        fault({ kind: 'texture', what: 'The grass is woven.' }),
        fault({ part: 99 }),
      ],
      [],
    );
    expect((await editLisbon('B')).edited).toBe(1);
    const mended = shootFile('edits', 'B', 'version-1-mended.png');
    expect(existsSync(mended)).toBe(true);
    expect(finishedFrom().at(-1)).toBe(mended);
    expect(fakeModels.edits).toHaveLength(1);
    const { found, left } = await shootJson(
      'edits',
      'B',
      'version-1-faults.json',
    );
    expect(found).toHaveLength(2);
    expect(left).toEqual([]);
  });

  it('mends what stands out once the rest is mended', async () => {
    await pickLisbon();
    const grass = fault({ kind: 'texture', serious: false });
    inTurn([fault(), grass], [{ ...grass, serious: true }], []);
    expect((await editLisbon('B')).edited).toBe(1);
    expect(asked('faults')).toHaveLength(3);
    expect(finishedFrom().at(-1)).toBe(
      shootFile('edits', 'B', 'version-1-mended.png'),
    );
  });

  it('takes another version when one can’t be mended', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = {
      assessments: [assessment(1, { beauty: 6 }), assessment(2, { beauty: 9 })],
    };
    inTurn([fault()], [fault()], [fault()], []);
    expect((await editLisbon('B')).edited).toBe(1);
    expect(existsSync(shootFile('edits', 'B', 'version-2-mended.png'))).toBe(
      true,
    );
    expect(finishedFrom().at(-1)).toBe(
      shootFile('edits', 'B', 'version-1.png'),
    );
  });

  it('tries once more with what was wrong', async () => {
    await pickLisbon();
    const unmended = [[fault()], [fault()], [fault()]];
    inTurn(...unmended, ...unmended, []);
    expect((await editLisbon('B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[1]?.prompt).toContain('A face is melted.');
  });

  it('keeps the camera’s own picture when that is better', async () => {
    await pickLisbon();
    inTurn([fault()]);
    const result = await editLisbon('B');
    expect(result.keptFromCamera).toEqual([
      { photo: 'B', reason: 'A face is melted. A face is melted.' },
    ]);
  });

  it('takes a version whose fault the camera’s picture has as well', async () => {
    await pickLisbon();
    inTurn([
      fault({
        rightInOriginal: false,
        inOriginal: true,
        what: 'The face is dark.',
      }),
    ]);
    const result = await editLisbon('B');
    expect(result.edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    const { review } = await shootJson('edits', 'B', 'edit.json');
    expect(review).toBe('The face is dark.');
  });

  it('keeps the camera’s own picture when what is left of a removal shows', async () => {
    await pickLisbon();
    const legs = 'Two legs of the chair float above the grass.';
    inTurn([fault({ rightInOriginal: false, what: legs, kind: 'other' })]);
    const result = await editLisbon('B');
    expect(result.edited).toBe(0);
    expect(result.keptFromCamera).toEqual([
      { photo: 'B', reason: `${legs} ${legs}` },
    ]);
  });
});
