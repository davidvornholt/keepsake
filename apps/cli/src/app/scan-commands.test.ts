import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  fake,
  photosFolder,
  putPhotos,
  run,
  setUp,
  shootFile,
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
    // B stops the first scan once A has its preview.
    fakeTools.pause = ({ args }) =>
      args.some((arg) => arg.endsWith('B.ARW'))
        ? eventually(
            async () => existsSync(shootFile('previews', 'A.jpg')),
            Boolean,
          ).then(() => Promise.reject(new Error('stopped')))
        : undefined;
    await expect(
      run('scan', photosFolder(), '--name', 'lisbon'),
    ).rejects.toThrow('stopped');
    expect(existsSync(shootFile('previews', 'A.jpg'))).toBe(true);
    fakeTools.pause = undefined;
    const elsewhere = join(fake.home, 'elsewhere');
    await mkdir(elsewhere);
    const second = await run('scan', elsewhere, '--name', 'lisbon');
    expect(second).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'InvalidInput' },
    });
  });
});
