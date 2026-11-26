import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Moment, Photo, Publication, Shoot } from '../../shared/domain.ts';
import { InvalidInput, StoreFailed } from '../../shared/errors/errors.ts';
import { checkTimeZone } from '../../shared/local-time.ts';
import { exclusively } from '../../shared/lock.ts';
import { nameFor } from '../../shared/shoot-names.ts';
import { SpendingRecord } from '../../shared/spending.ts';
import {
  exists,
  openShoot,
  readJson,
  type ShootFiles,
  shootFiles,
  shootNames,
  writeJson,
} from '../../shared/store.ts';
import { isSubscription } from '../../shared/subscriptions/subscriptions.ts';
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

/** Whether a model was paid for, by what was spent or what it answered. */
const isPaidFor = Effect.fn('isPaidFor')(function* (files: ShootFiles) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spent = Option.getOrElse(
    yield* readJson(SpendingRecord, files.spending),
    (): SpendingRecord => ({}),
  );
  const verdicts = path.join(files.root, 'verdicts');
  const judges = (yield* exists(verdicts))
    ? yield* fs.readDirectory(verdicts).pipe(Effect.mapError(storeFailed))
    : [];
  const providers = [
    ...Object.entries(spent).flatMap(([model, { calls }]) =>
      calls > 0 ? [model.slice(0, model.indexOf('/'))] : [],
    ),
    ...judges.map((judge) => judge.slice(0, judge.indexOf('--'))),
  ];
  return providers.some((provider) => !isSubscription(provider));
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
  return (
    Option.isSome(published) ||
    edited.includes(true) ||
    (yield* isPaidFor(files))
  );
});

/** Forgets a shoot that nothing was made from yet. The photos stay. */
export const forgetShoot = Effect.fn('forgetShoot')(function* (name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = yield* shootFiles(name);
  yield* Effect.gen(function* () {
    const { photos } = yield* openShoot(name);
    if (yield* isWorthKeeping(files, [...photos.keys()])) {
      return yield* new InvalidInput({
        message: 'Some of it is in Immich or cost money, so it stays.',
      });
    }
    // Moved aside at once, so nothing finds half of it while it is removed.
    const aside = path.join(
      path.dirname(files.root),
      `.forgotten-${crypto.randomUUID()}`,
    );
    yield* fs.rename(files.root, aside).pipe(Effect.mapError(storeFailed));
    yield* fs
      .remove(aside, { recursive: true })
      .pipe(Effect.mapError(storeFailed));
  }).pipe(
    exclusively(files),
    Effect.catchTag('ShootBusy', () =>
      Effect.fail(
        new InvalidInput({
          message: 'keepsake is working on it. Try again when that is done.',
        }),
      ),
    ),
  );
});
