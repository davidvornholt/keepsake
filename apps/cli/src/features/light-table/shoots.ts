import { Clock, Effect, Schedule, Semaphore } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { isBusy } from '../../shared/lock.ts';
import { type OpenShoot, openShoot, shootNames } from '../../shared/store.ts';
import type { Changed } from './contract.ts';
import {
  type Gallery,
  type Kind,
  openGallery,
  saveLooks,
  warmUp,
} from './pictures.ts';
import { changedSince, shootInShort, shootView } from './view.ts';

/** How many pictures are made smaller at once. */
const atOnce = 6;
/** How long an answer about what changed is taken as current. */
const currentFor = 900;
/** How long what Immich said about the album is taken as current. */
const albumCurrentFor = 300_000;

/** How often the server looks for new shoots. */
const prepareEvery = '30 seconds';

/** A shoot's view as compressed JSON. */
type View = {
  readonly revision: string;
  readonly json: Uint8Array<ArrayBuffer>;
};

/** The shoots as the server has them, so it needn't read them every time. */
export const makeShoots = Effect.fn('makeShoots')(function* () {
  const workers = yield* Semaphore.make(atOnce);
  const galleries = new Map<string, Gallery>();
  const views = new Map<string, View>();
  const changes = new Map<string, { readonly at: number; changed: Changed }>();
  const albums = new Map<string, number>();
  const warm = new Set<string>();

  const galleryOf = Effect.fn('galleryOf')(function* (name: string) {
    const open = yield* openShoot(name);
    const known = galleries.get(name);
    const gallery: Gallery =
      known === undefined
        ? yield* openGallery(open, workers)
        : { ...known, open };
    galleries.set(name, gallery);
    return gallery;
  });

  /**
   * Reads the album again, if that was long ago, without anyone waiting.
   * Commands that change the album read it themselves.
   */
  const refreshAlbum = Effect.fn('refreshAlbum')(function* (open: OpenShoot) {
    const { name } = open.shoot;
    const now = yield* Clock.currentTimeMillis;
    const isOld = now - (albums.get(name) ?? 0) > albumCurrentFor;
    if (isOld && !(yield* isBusy(open.files))) {
      albums.set(name, now);
      yield* readAlbum(open).pipe(Effect.ignore, Effect.forkDetach);
    }
  });

  const changed = Effect.fn('changed')(function* (name: string) {
    const now = yield* Clock.currentTimeMillis;
    const known = changes.get(name);
    if (known !== undefined && now - known.at < currentFor) {
      return known.changed;
    }
    const open = yield* openShoot(name);
    yield* refreshAlbum(open);
    const current = yield* changedSince(open);
    changes.set(name, { at: now, changed: current });
    return current;
  });

  /** Makes the copies the page shows first, once, without anyone waiting. */
  const warmOnce = Effect.fn('warmOnce')(function* (gallery: Gallery) {
    const { name } = gallery.open.shoot;
    if (!warm.has(name)) {
      warm.add(name);
      const all = [...gallery.open.photos.keys()];
      yield* warmUp(gallery, [
        ...all.map((photo) => [photo, 'final'] as readonly [string, Kind]),
        ...all.map((photo) => [photo, 'preview'] as readonly [string, Kind]),
      ]).pipe(Effect.forkDetach);
    }
  });

  const list = Effect.gen(function* () {
    const names = yield* shootNames;
    const found = yield* Effect.forEach(
      names.toSorted(),
      (name) =>
        Effect.gen(function* () {
          const gallery = yield* galleryOf(name);
          const inShort = yield* shootInShort(gallery);
          yield* saveLooks(gallery);
          return [inShort];
        }).pipe(
          // One shoot that can't be read doesn't hide the others.
          Effect.catch(() => Effect.succeed([])),
        ),
      { concurrency: 'unbounded' },
    );
    return {
      shoots: found
        .flat()
        .toSorted((left, right) => right.from.localeCompare(left.from)),
    };
  });

  const view = Effect.fn('view')(function* (name: string) {
    const gallery = yield* galleryOf(name);
    const { revision } = yield* changedSince(gallery.open);
    const known = views.get(name);
    if (known?.revision === revision) {
      return known;
    }
    const made = yield* shootView(gallery);
    yield* saveLooks(gallery);
    yield* warmOnce(gallery);
    const packed: View = {
      revision: made.revision,
      json: Bun.gzipSync(JSON.stringify(made)),
    };
    views.set(name, packed);
    return packed;
  });

  return {
    galleryOf,
    changed,
    list,
    view,
    /** Gets every shoot ready, also new ones, so nobody waits for it later. */
    prepare: Effect.gen(function* () {
      const names = yield* shootNames;
      yield* Effect.forEach(
        names.filter((name) => !views.has(name)),
        (name) => Effect.ignore(view(name)),
        { discard: true },
      );
    }).pipe(Effect.ignore, Effect.repeat(Schedule.spaced(prepareEvery))),
  };
});
export type Shoots = Effect.Success<ReturnType<typeof makeShoots>>;
