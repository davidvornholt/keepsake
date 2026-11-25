import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  photosFolder,
  runOk,
  scanLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const picked = async (): Promise<ReadonlyArray<string>> => {
  const { picks } = await shootJson('picks.json');
  return picks.map(({ photo }: { readonly photo: string }) => photo);
};

describe('keepsake pick', () => {
  it('keeps the best photo of a motif', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    fakeModels.answers.motifs = {
      motifs: [{ motif: 'a heron', photos: [3, 1, 3] }],
    };
    fakeModels.answers.motif = {
      keep: [2],
      repeats: [{ photo: 1, insteadOf: 2 }],
    };
    const result = await runOk('pick', 'lisbon');
    expect(result).toMatchObject({ candidates: 3, repeats: 1, picked: 2 });
    expect(await picked()).toEqual(['B', 'C']);
    const { leftOut } = await shootJson('picks.json');
    expect(leftOut).toEqual([{ photo: 'A1', insteadOf: 'C' }]);
    const [question] = asked('motif');
    expect(question?.images).toBe(2);
    expect(question?.texts.at(-1)).toContain('a heron');
  });

  it('keeps everything when no photo is said to stay', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    fakeModels.answers.motifs = {
      motifs: [{ motif: 'a heron', photos: [1, 2, 3] }],
    };
    expect(await runOk('pick', 'lisbon')).toMatchObject({ picked: 3 });
  });

  it('compares no photos of a motif from quite another time', async () => {
    await scanLisbon();
    fakeTools.files = fakeTools.files.map((file) =>
      file.file === 'C.ARW' ? { ...file, second: 3000 } : file,
    );
    await runOk('scan', photosFolder(), '--name', 'lisbon');
    await runOk('cull', 'lisbon');
    fakeModels.answers.motifs = {
      motifs: [{ motif: 'a heron', photos: [2, 3] }],
    };
    expect(await runOk('pick', 'lisbon')).toMatchObject({ picked: 3 });
    expect(asked('motif')).toHaveLength(0);
  });
});
