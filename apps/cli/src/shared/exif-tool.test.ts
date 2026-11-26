import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { findPhotos } from './exif.ts';

/** The real exiftool, on the PATH or in the Nix store, if it is anywhere. */
const realExiftool = (): string | undefined => {
  const onPath = Bun.which('exiftool');
  if (onPath !== null) {
    return onPath;
  }
  const store = '/nix/store';
  const found = (() => {
    try {
      return readdirSync(store).filter(
        (name) => name.includes('-Image-ExifTool-') && !name.endsWith('.drv'),
      );
    } catch {
      return [];
    }
  })();
  return found
    .map((name) => join(store, name, 'bin', 'exiftool'))
    .find((file) => Bun.file(file).size > 0);
};

const exiftool = realExiftool();
let folder = '';
let path = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'keepsake-exiftool-'));
  path = process.env.PATH ?? '';
  process.env.PATH = [dirname(exiftool ?? '/'), path].join(delimiter);
});

afterEach(async () => {
  process.env.PATH = path;
  await rm(folder, { recursive: true, force: true });
});

describe.skipIf(exiftool === undefined)('the real exiftool', () => {
  it('reads photos by any name they can have', async () => {
    const names = [
      join('a$b', 'c$d.jpg'),
      join('a@b', 'c@d.jpg'),
      join('back\\slash', 'e\\f.jpg'),
      join('new\nline', 'g\nh.jpg'),
      'plain.jpg',
    ];
    // Not pictures, which exiftool still says when they were changed.
    await Promise.all(
      names.map((name) => Bun.write(join(folder, name), 'not a picture')),
    );
    const found = await Effect.runPromise(
      findPhotos(folder).pipe(Effect.provide(BunServices.layer)),
    );
    expect(found.map(({ file }) => file).toSorted()).toEqual(names.toSorted());
  });
});
