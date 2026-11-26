import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import {
  editLisbon,
  judge,
  photosFolder,
  runOk,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

/** A photo, and another in a folder of the same name. */
const scanNested = async () => {
  fakeTools.files = [
    { file: 'A.ARW', second: 0 },
    { file: 'A/B.ARW', second: 300 },
  ];
  await runOk('scan', photosFolder(), '--name', 'lisbon', '--about', 'Lisbon');
  await Bun.write(shootFile('judge.json'), JSON.stringify({ model: judge }));
  await runOk('cull', 'lisbon');
};

/** Every file below a folder, with what is in it. */
const contentsOf = (folder: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .map((name) => join(folder, name))
      .filter((file) => statSync(file).isFile())
      .map((file) => [relative(folder, file), readFileSync(file, 'base64')]),
  );

const folderOf = async (photo: string) => {
  const shown = await runOk('show', 'lisbon', photo);
  return join(shown.files.final, '..');
};

describe('keepsake edit, with a photo in a folder named like another', () => {
  it('keeps the edits of each apart', async () => {
    await scanNested();
    expect((await editLisbon('A', 'A/B')).edited).toBe(2);
    const folder = await folderOf('A/B');
    expect(existsSync(join(folder, 'B-keepsake.jpg'))).toBe(true);
    const before = contentsOf(folder);
    expect(Object.keys(before)).toContain('edit.json');
    await editLisbon('A', '--again');
    expect(contentsOf(folder)).toEqual(before);
    expect(folder.startsWith(`${await folderOf('A')}/`)).toBe(false);
  });

  it('finds the edits that were kept inside another photo’s', async () => {
    await scanNested();
    await editLisbon('A', 'A/B');
    const folder = await folderOf('A/B');
    const before = contentsOf(folder);
    // Where keepsake kept them before.
    renameSync(folder, shootFile('edits', 'A', 'B'));
    rmSync(shootFile('flat-edits'));
    expect(contentsOf(await folderOf('A/B'))).toEqual(before);
    expect(existsSync(shootFile('edits', 'A', 'B'))).toBe(false);
    expect((await editLisbon('A/B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
  });
});
