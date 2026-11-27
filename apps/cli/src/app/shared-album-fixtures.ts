import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fake, judge, putPhotos, runOk } from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';

// A second shoot of the place `scanLisbon` scans, called `later`, which
// publishes to the same album, and whose camera files have the same names,
// as camera counters start again.

export const laterFile = (...parts: ReadonlyArray<string>) =>
  join(fake.home, 'data', 'keepsake', 'shoots', 'later', ...parts);

const finished = ['A1', 'B', 'C'];

export const laterFinal = (photo: string) =>
  laterFile('edits', photo, `${photo}-keepsake.jpg`);

/**
 * A second shoot of the same place, with the same file names, finished as
 * `finish` has it.
 */
export const editLater = async (
  finish: (photo: string) => Promise<unknown>,
) => {
  const folder = join(fake.home, 'later-photos');
  await putPhotos(folder);
  await runOk('scan', folder, '--name', 'later', '--title', 'Lisbon');
  await Bun.write(laterFile('judge.json'), JSON.stringify({ model: judge }));
  await runOk('cull', 'later');
  await runOk('pick', 'later');
  await runOk('edit', 'later', '--review-model', judge);
  await Promise.all(finished.map(finish));
};

/** The second shoot, published with other photos than the first shoot's. */
export const publishLater = async () => {
  await editLater((photo) => Bun.write(laterFinal(photo), `later ${photo}`));
  return await runOk('publish', 'later');
};

export const laterAlbum = async () =>
  JSON.parse(await readFile(laterFile('album.json'), 'utf8'));

export const inImmich = () =>
  (fakeTools.albums[0]?.assets ?? []).map(({ id }) => id);
