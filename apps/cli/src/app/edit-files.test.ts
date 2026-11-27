import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import {
  editLisbon,
  failureOf,
  judge,
  photosFolder,
  putPhotos,
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
  await putPhotos();
  await runOk(
    'scan',
    photosFolder(),
    '--name',
    'lisbon',
    '--title',
    'Lisbon',
    '--about',
    'Lisbon',
  );
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

const filesOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).files;

const folderOf = async (photo: string) =>
  join((await filesOf(photo)).final, '..');

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

  it('edits a photo once that is named by its path and its name', async () => {
    await scanNested();
    expect((await editLisbon('A/B', 'B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(1);
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

/** What is in the edit folders of photos, one after the other. */
const contentsOfAll = (photos: ReadonlyArray<string>) =>
  photos.reduce<Promise<Array<Record<string, string>>>>(
    async (all, photo) => [...(await all), contentsOf(await folderOf(photo))],
    Promise.resolve([]),
  );

describe('keepsake edit, moving edits out of another photo’s', () => {
  it('moves each, also onto where another one was', async () => {
    fakeTools.files = [
      { file: 'A.ARW', second: 0 },
      { file: 'A/B.ARW', second: 300 },
      { file: 'A~sB.ARW', second: 600 },
    ];
    await putPhotos();
    await runOk(
      'scan',
      photosFolder(),
      '--name',
      'lisbon',
      '--title',
      'Lisbon',
    );
    await Bun.write(shootFile('judge.json'), JSON.stringify({ model: judge }));
    await runOk('cull', 'lisbon');
    const photos = ['A', 'A/B', 'A~sB'];
    expect((await editLisbon(...photos)).edited).toBe(3);
    const before = await contentsOfAll(photos);
    // Where keepsake kept them before: A/B inside A, and A~sB where A/B goes.
    renameSync(shootFile('edits', 'A~sB'), shootFile('edits', 'A', 'B'));
    renameSync(shootFile('edits', 'A~~sB'), shootFile('edits', 'A~sB'));
    rmSync(shootFile('flat-edits'));
    const after = await contentsOfAll(photos);
    expect(after).toEqual(before);
    expect(existsSync(shootFile('edits', 'A', 'B'))).toBe(false);
    expect(existsSync(shootFile('flat-edits'))).toBe(true);
  });
});

/** A/B, and A~sB/C, whose folder is where A/B's edits go. */
const editBesideFolder = async () => {
  fakeTools.files = [
    { file: 'A/B.ARW', second: 0 },
    { file: 'A~sB/C.ARW', second: 300 },
  ];
  await putPhotos();
  await runOk('scan', photosFolder(), '--name', 'lisbon', '--title', 'Lisbon');
  await Bun.write(shootFile('judge.json'), JSON.stringify({ model: judge }));
  await runOk('cull', 'lisbon');
  const photos = ['A/B', 'A~sB/C'];
  await editLisbon(...photos);
  const before = await contentsOfAll(photos);
  rmSync(shootFile('flat-edits'));
  return { photos, before };
};

/** As a command that stopped after it moved both out of the way left them. */
const stoppedWhileMoving = () => {
  mkdirSync(shootFile('unnesting'));
  renameSync(shootFile('edits', 'A~sB'), shootFile('unnesting', 'A~sB'));
  renameSync(
    shootFile('edits', 'A~~sB~sC'),
    shootFile('unnesting', 'A~~sB~sC'),
  );
  // The folders they were kept in before.
  mkdirSync(shootFile('edits', 'A'));
  mkdirSync(shootFile('edits', 'A~sB'));
};

describe('keepsake edit, moving edits out of a folder where others go', () => {
  it('moves them where they were kept before', async () => {
    const { photos, before } = await editBesideFolder();
    renameSync(shootFile('edits', 'A~sB'), shootFile('edits', 'A~sB-'));
    mkdirSync(shootFile('edits', 'A'));
    renameSync(shootFile('edits', 'A~sB-'), shootFile('edits', 'A', 'B'));
    mkdirSync(shootFile('edits', 'A~sB'));
    renameSync(shootFile('edits', 'A~~sB~sC'), shootFile('edits', 'A~sB', 'C'));
    expect(await contentsOfAll(photos)).toEqual(before);
    expect(existsSync(shootFile('unnesting'))).toBe(false);
    expect(existsSync(shootFile('edits', 'A'))).toBe(false);
  });

  it('goes on with them after it stopped while they moved', async () => {
    const { photos, before } = await editBesideFolder();
    stoppedWhileMoving();
    expect(await contentsOfAll(photos)).toEqual(before);
    expect(existsSync(shootFile('unnesting'))).toBe(false);
    expect(existsSync(shootFile('flat-edits'))).toBe(true);
  });

  it('says so when other files are where one goes', async () => {
    await editBesideFolder();
    stoppedWhileMoving();
    await Bun.write(shootFile('edits', 'A~sB', 'notes.txt'), 'mine');
    const failure = await failureOf('show', 'lisbon', 'A/B');
    expect(failure.message).toContain('notes.txt');
    expect(readFileSync(shootFile('edits', 'A~sB', 'notes.txt'), 'utf8')).toBe(
      'mine',
    );
    expect(existsSync(shootFile('unnesting', 'A~sB', 'B.jpg'))).toBe(true);
  });
});

describe('keepsake edit, with a photo called input', () => {
  it('gives the image model only the cropped photo', async () => {
    fakeTools.files = [{ file: 'input.ARW', second: 0 }];
    await putPhotos();
    await runOk(
      'scan',
      photosFolder(),
      '--name',
      'lisbon',
      '--title',
      'Lisbon',
    );
    await Bun.write(shootFile('judge.json'), JSON.stringify({ model: judge }));
    await runOk('cull', 'lisbon');
    expect((await editLisbon('input')).edited).toBe(1);
    const { camera, input } = await filesOf('input');
    expect(input).not.toBe(camera);
    // Cut out of the camera's picture, without its metadata.
    const cropped = fakeTools.runs.filter(
      ({ command, args }) =>
        command === 'magick' &&
        args[0] === camera &&
        args.includes('-extent') &&
        args.includes('-strip'),
    );
    expect(cropped).toHaveLength(1);
    expect(fakeModels.edits[0]?.picture).toEqual(
      new Uint8Array(readFileSync(input)),
    );
  });
});
