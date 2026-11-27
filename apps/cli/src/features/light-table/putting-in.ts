import { DateTime, Effect, Option, Schema } from 'effect';
import { PickList, type PublishedPhoto, Removed } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { withAlbum } from '../../shared/lock.ts';
import { readPublication } from '../../shared/publication.ts';
import {
  isOutOf,
  readAllRemoved,
  type Standings,
} from '../../shared/standing.ts';
import {
  exists,
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from '../../shared/store.ts';
import { pickOf } from '../../shared/verdicts.ts';
import { Publishing } from './publishing.ts';

// What the page does to a photo it puts in, or keeps out, and how it lets a
// photo be as it was when the photo it was to take the place of stays.

const Removals = Schema.Array(Removed);

/** The verdict on the moment of a photo, which a photo needs to be chosen. */
export const verdictOf = (known: Standings, photo: string) =>
  [...known.verdicts.values()].find(({ photos }) => photos.includes(photo));

export const isFinished = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const files = open.files.edit(photo);
    return (yield* exists(files.record)) && (yield* exists(files.final));
  });

const removalsOf = (files: ShootFiles) =>
  Effect.map(
    readJson(Removals, files.removed),
    Option.getOrElse((): ReadonlyArray<Removed> => []),
  );

/** Lets a photo out of the album count again for it, where it was taken out. */
const bringBack = (open: OpenShoot, photo: string) =>
  Effect.gen(function* () {
    const album = (yield* readPublication(open))?.albumId;
    const all = yield* readAllRemoved(open, album);
    const isOut = (one: Removed) => one.photo === photo && isOutOf(album)(one);
    if (all.some(isOut)) {
      yield* writeJson(
        Removals,
        open.files.removed,
        all.filter((one) => !isOut(one)),
      );
    }
  }).pipe(withAlbum(open.files));

/** Makes a photo one of the chosen, if it isn't. */
const pickPhoto = Effect.fn('pickPhoto')(function* (
  open: OpenShoot,
  known: Standings,
  photo: string,
) {
  const list = Option.getOrNull(yield* readJson(PickList, open.files.picks));
  const verdict = verdictOf(known, photo);
  if (list === null || verdict === undefined) {
    return yield* new InvalidInput({
      message: 'Nothing is chosen yet, so it can’t be chosen.',
    });
  }
  if (!list.picks.some((one) => one.photo === photo)) {
    yield* writeJson(PickList, open.files.picks, {
      ...list,
      picks: [...list.picks, pickOf(verdict, photo)],
    });
  }
});

/**
 * Chooses a photo, once it is published when it is finished and there is
 * an album in Immich, so that it comes back into the album as it was or goes
 * into it for the first time. Without an album it waits for the owner to
 * order one, and none is made for it. Nothing changes when Immich refuses it.
 */
export const putIn = Effect.fn('putIn')(function* (
  open: OpenShoot,
  known: Standings,
  photo: string,
) {
  const hasAlbum = (yield* readPublication(open)) !== null;
  if (hasAlbum && (yield* isFinished(open, photo))) {
    yield* (yield* Publishing).publish(open, photo);
  }
  yield* bringBack(open, photo);
  yield* pickPhoto(open, known, photo);
});

/** Notes that a photo out of the album stays out, for the reason given. */
export const keepOut = (open: OpenShoot, photo: string, because: string) =>
  Effect.gen(function* () {
    const all = yield* removalsOf(open.files);
    const at = DateTime.formatIso(yield* DateTime.now);
    yield* writeJson(Removals, open.files.removed, [
      ...all.filter((one) => one.photo !== photo),
      { photo, at, because },
    ]);
  }).pipe(withAlbum(open.files));

/** What stood for a photo before it was put in. */
type Before = {
  readonly removed: ReadonlyArray<Removed>;
  readonly picked: boolean;
  readonly published: PublishedPhoto | undefined;
};

export const beforeOf = Effect.fn('beforeOf')(function* (
  open: OpenShoot,
  photo: string,
) {
  const list = Option.getOrNull(yield* readJson(PickList, open.files.picks));
  const publication = yield* readPublication(open);
  return {
    removed: (yield* removalsOf(open.files)).filter(
      (one) => one.photo === photo,
    ),
    picked: list?.picks.some((one) => one.photo === photo) ?? false,
    published: publication?.photos.find((one) => one.photo === photo),
  } satisfies Before;
});

/** Lets a photo that was put in stand where it stood before. */
export const undoPutIn = Effect.fn('undoPutIn')(function* (
  open: OpenShoot,
  photo: string,
  before: Before,
) {
  const { files } = open;
  yield* (yield* Publishing).unpublish(open, photo, before.published);
  yield* Effect.gen(function* () {
    const all = yield* removalsOf(files);
    yield* writeJson(Removals, files.removed, [
      ...all.filter((one) => one.photo !== photo),
      ...before.removed,
    ]);
    const list = Option.getOrNull(yield* readJson(PickList, files.picks));
    if (list !== null && !before.picked) {
      yield* writeJson(PickList, files.picks, {
        ...list,
        picks: list.picks.filter((one) => one.photo !== photo),
      });
    }
  }).pipe(withAlbum(files));
});
