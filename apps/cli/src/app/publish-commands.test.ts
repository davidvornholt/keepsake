import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  failureOf,
  pickLisbon,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake publish', () => {
  it('uploads each finished photo on top of the camera’s, once', async () => {
    await pickLisbon();
    await runOk('edit', 'lisbon');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({
      album: { name: 'Lisbon, May 2026' },
      published: 3,
      alreadyThere: 0,
      outdated: [],
    });
    expect(fakeTools.uploads).toHaveLength(6);
    const stacks = fakeTools.runs.filter(
      ({ command, args }) => command === 'photos' && args[0] === 'stacks',
    );
    expect(stacks[0]?.args).toEqual(['stacks', 'create', 'asset-1', 'asset-2']);
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 0, alreadyThere: 3 });
    expect(fakeTools.uploads).toHaveLength(6);
  });

  it('uploads a photo that was edited again, and names the old one', async () => {
    await pickLisbon();
    await runOk('edit', 'lisbon');
    await runOk('publish', 'lisbon');
    await writeFile(shootFile('edits', 'B', 'B-keepsake.jpg'), 'another');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 1, outdated: ['asset-3'] });
  });

  it('uploads a photo that wasn’t picked when it is named', async () => {
    await pickLisbon();
    await runOk('edit', 'lisbon', 'A2');
    const result = await runOk('publish', 'lisbon', 'A2');
    expect(result).toMatchObject({ published: 1, outdated: [] });
    expect(fakeTools.uploads[0]).toEndWith('A2-keepsake.jpg');
  });

  it('needs finished photos', async () => {
    await pickLisbon();
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain('keepsake edit lisbon');
    const named = await failureOf('publish', 'lisbon', 'B');
    expect(named.message).toContain('keepsake edit lisbon B');
  });
});

describe('keepsake run', () => {
  it('does everything and goes on where it stopped', async () => {
    await scanLisbon();
    const folder = (await shootJson('shoot.json')).source;
    const result = await runOk('run', folder, '--name', 'lisbon', '--publish');
    expect(result.culled.moments).toBe(3);
    expect(result.picked.picked).toBe(3);
    expect(result.edited.edited).toBe(3);
    expect(result.published.published).toBe(3);
    const questions = fakeModels.asked.length;
    await runOk('run', folder, '--name', 'lisbon', '--publish');
    expect(fakeModels.asked).toHaveLength(questions);
  });

  it('uploads nothing unless asked to', async () => {
    await scanLisbon();
    const folder = (await shootJson('shoot.json')).source;
    const result = await runOk('run', folder, '--name', 'lisbon');
    expect(result.published).toBeNull();
    expect(fakeTools.uploads).toEqual([]);
  });
});
