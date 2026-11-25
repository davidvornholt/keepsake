import { Effect, FileSystem, Option, Schema } from 'effect';
import { Moment, Photo, Publication, Shoot } from '../../shared/domain.ts';
import { InvalidInput, StoreFailed } from '../../shared/errors/errors.ts';
import { checkTimeZone } from '../../shared/local-time.ts';
import { isBusy } from '../../shared/lock.ts';
import { nameFor } from '../../shared/shoot-names.ts';
import {
  exists,
  openShoot,
  readJson,
  type ShootFiles,
  shootFiles,
  shootNames,
  writeJson,
} from '../../shared/store.ts';
import { notePreparation } from './preparation.ts';
import type { NewShoot } from './schemas.ts';

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({ message: `Could not use a shoot: ${error.message}` });

/** The first name that no shoot has yet. */
const freeName = (wanted: string, taken: ReadonlyArray<string>): string => {
  const name = wanted === '' ? 'album' : wanted;
  const numbered = taken.map((_, index) => `${name}-${index + 2}`);
  return (
    [name, ...numbered].find((one) => !taken.includes(one)) ??
    `${name}-${taken.length + 2}`
  );
};

/** Notes a new shoot, which is empty until its photos are found. */
export const makeShoot = Effect.fn('makeShoot')(function* (wanted: NewShoot) {
  const about = wanted.about.trim();
  if (about === '') {
    return yield* new InvalidInput({
      message: 'Say where and when the photos are from.',
    });
  }
  if (wanted.maximum !== null && wanted.maximum < 1) {
    return yield* new InvalidInput({
      message: 'An album has at least one photo.',
    });
  }
  const timeZone =
    wanted.timeZone === null
      ? {}
      : { timeZone: yield* checkTimeZone(wanted.timeZone) };
  const name = freeName(nameFor(about), yield* shootNames);
  const files = yield* shootFiles(name);
  yield* writeJson(Schema.Array(Photo), files.photos, []);
  yield* writeJson(Schema.Array(Moment), files.moments, []);
  yield* notePreparation(files, wanted.maximum);
  // Last, since the shoot is one from then on.
  yield* writeJson(Shoot, files.shoot, {
    name,
    source: wanted.folder,
    about,
    ...timeZone,
  });
  return name;
});

/** Whether anything was made that cost money or is in Immich. */
const isWorthKeeping = Effect.fn('isWorthKeeping')(function* (
  files: ShootFiles,
  photos: ReadonlyArray<string>,
) {
  const published = yield* readJson(Publication, files.publication);
  const edited = yield* Effect.forEach(photos, (photo) =>
    exists(files.edit(photo).directory),
  );
  return Option.isSome(published) || edited.includes(true);
});

/** Forgets a shoot that nothing was made from yet. The photos stay. */
export const forgetShoot = Effect.fn('forgetShoot')(function* (name: string) {
  const fs = yield* FileSystem.FileSystem;
  const { files, photos } = yield* openShoot(name);
  if (yield* isWorthKeeping(files, [...photos.keys()])) {
    return yield* new InvalidInput({
      message: 'It has finished photos, so it stays.',
    });
  }
  if (yield* isBusy(files)) {
    return yield* new InvalidInput({
      message: 'keepsake is working on it. Try again when that is done.',
    });
  }
  yield* fs
    .remove(files.root, { recursive: true })
    .pipe(Effect.mapError(storeFailed));
});
