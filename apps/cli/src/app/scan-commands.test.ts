import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  failureOf,
  fake,
  photosFolder,
  putPhotos,
  run,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { eventually } from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('a scan that stopped half-way', () => {
  it('keeps its shoot to its folder, so another folder gets no previews of it', async () => {
    fakeTools.files = [
      { file: 'A.ARW', second: 0 },
      { file: 'B.ARW', second: 300 },
    ];
    await putPhotos();
    // B's preview, not the look for photos, stops the first scan once A has
    // its own.
    fakeTools.pause = ({ args }) =>
      !args.includes('-json') && args.some((arg) => arg.endsWith('B.ARW'))
        ? eventually(
            async () => existsSync(shootFile('previews', 'A.jpg')),
            Boolean,
          ).then(() => Promise.reject(new Error('stopped')))
        : undefined;
    await expect(
      run('scan', photosFolder(), '--name', 'lisbon', '--title', 'Lisbon'),
    ).rejects.toThrow('stopped');
    expect(existsSync(shootFile('previews', 'A.jpg'))).toBe(true);
    fakeTools.pause = undefined;
    const elsewhere = join(fake.home, 'elsewhere');
    await mkdir(elsewhere);
    const second = await run(
      'scan',
      elsewhere,
      '--name',
      'lisbon',
      '--title',
      'Lisbon',
    );
    expect(second).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'InvalidInput' },
    });
  });

  it('makes previews again that an earlier version left without the folder', async () => {
    fakeTools.files = [{ file: 'A.ARW', second: 0 }];
    await putPhotos();
    // A scan of another folder stopped there, before it noted which.
    await Bun.write(shootFile('previews', 'A.jpg'), 'a photo of elsewhere');
    await Bun.write(shootFile('photos.json'), '[]');
    await runOk(
      'scan',
      photosFolder(),
      '--name',
      'lisbon',
      '--title',
      'Lisbon',
    );
    expect(await Bun.file(shootFile('previews', 'A.jpg')).text()).toBe(
      'a picture',
    );
  });
});

describe('a scan with --title', () => {
  it('is needed for a new shoot', async () => {
    fakeTools.files = [{ file: 'A.ARW', second: 0 }];
    await putPhotos();
    const failure = await failureOf('scan', photosFolder(), '--name', 'lisbon');
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain('--title');
    expect(existsSync(shootFile('shoot.json'))).toBe(false);
  });

  it('names the album, until a later scan names it otherwise', async () => {
    const scanned = await scanLisbon();
    expect(scanned).toMatchObject({
      title: 'Lisbon',
      about: 'Lisbon, May 2026',
    });
    await runOk('scan', photosFolder(), '--name', 'lisbon');
    expect(await shootJson('shoot.json')).toMatchObject({ title: 'Lisbon' });
    await runOk('scan', photosFolder(), '--name', 'lisbon', '--title', 'Belém');
    expect(await shootJson('shoot.json')).toMatchObject({
      title: 'Belém',
      about: 'Lisbon, May 2026',
    });
    const empty = await failureOf(
      'scan',
      photosFolder(),
      '--name',
      'lisbon',
      '--title',
      ' ',
    );
    expect(empty._tag).toBe('InvalidInput');
  });
});
