import { createHash } from 'node:crypto';
import { Clock, Effect, Option, Schedule, Semaphore } from 'effect';
import { readAlbum } from '../../shared/album.ts';
import { withAlbumIfFree } from '../../shared/lock.ts';
import { type OpenShoot, openShoot, shootNames } from '../../shared/store.ts';
import type { Changed, ShootView } from './contract.ts';
import {
  forgetPictures,
  type Gallery,
  type Kind,
  openGallery,
  saveLooks,
  warmUp,
} from './pictures.ts';
import { changedSince, shootInShort, shootView } from './view.ts';

/** How long an answer about what changed is taken as current. */
const currentFor = 900;
/** How long what Immich said about the album is taken as current. */
const albumCurrentFor = 300_000;

/** How many covers are looked at together. They are few, and don't wait for anything else. */
const coversAtOnce = 4;

/** How often the server looks for new shoots. */
const prepareEvery = '30 seconds';

/** Sorts behind every date. */
const newest = '9';

/** A shoot's view as compressed JSON. */
type View = {
  readonly revision: string;
  /** Changes with the revision and with what is live in it. */
  readonly etag: string;
  readonly json: Uint8Array<ArrayBuffer>;
  /** All of it but what is live, which is read every time. */
  readonly made: ShootView;
  readonly live: string;
};

const etagLength = 16;

/**
 * Makes the copies the page shows first, once for every photo, without anyone
 * waiting.
 */
const makeWarming = () => {
  const warm = new Set<string>();
  return Effect.fn('warmOnce')(function* (gallery: Gallery) {
    const { name } = gallery.open.shoot;
    const fresh = [...gallery.open.photos.keys()].filter(
      (photo) => !warm.has(`${name}/${photo}`),
    );
    if (fresh.length > 0) {
      for (const photo of fresh) {
        warm.add(`${name}/${photo}`);
      }
      yield* warmUp(gallery, [
        ...fresh.map((photo) => [photo, 'final'] as readonly [string, Kind]),
        ...fresh.map((photo) => [photo, 'preview'] as readonly [string, Kind]),
      ]).pipe(Effect.forkDetach);
    }
  });
};

/**
 * The view of a shoot. What a command, the page's program or an agent is doing
 * changes without a file the revision knows of, such as when an agent that
 * waits stops, so it is read every time.
 */
const makeView = (
  canStartAgent: boolean,
  views: Map<string, View>,
  warmOnce: ReturnType<typeof makeWarming>,
) => {
  const madeOf = Effect.fn('madeOf')(function* (
    gallery: Gallery,
    revision: string,
  ) {
    const known = views.get(gallery.open.shoot.name);
    if (known?.revision === revision) {
      return known.made;
    }
    const made = yield* shootView(gallery, canStartAgent);
    yield* saveLooks(gallery);
    yield* warmOnce(gallery);
    return made;
  });

  return Effect.fn('view')(function* (gallery: Gallery) {
    const { name } = gallery.open.shoot;
    const { revision, ...now } = yield* changedSince(
      gallery.open,
      canStartAgent,
    );
    const live = JSON.stringify(now);
    const known = views.get(name);
    if (known?.revision === revision && known.live === live) {
      return known;
    }
    const made = yield* madeOf(gallery, revision);
    const hash = createHash('sha256').update(live).digest('hex');
    const packed: View = {
      revision: made.revision,
      etag: `${made.revision}-${hash.slice(0, etagLength)}`,
      json: Bun.gzipSync(JSON.stringify({ ...made, ...now })),
      made,
      live,
    };
    views.set(name, packed);
    return packed;
  });
};

/**
 * Reads the album again, if that was long ago, without anyone waiting, and
 * not while a command or the owner changes it.
 */
const makeRefreshing = () => {
  const albums = new Map<string, number>();
  return Effect.fn('refreshAlbum')(function* (open: OpenShoot) {
    const { name } = open.shoot;
    const now = yield* Clock.currentTimeMillis;
    if (now - (albums.get(name) ?? 0) > albumCurrentFor) {
      albums.set(name, now);
      yield* readAlbum(open).pipe(
        withAlbumIfFree(open.files),
        // Busy now, so it is read again the next time it is asked for.
        Effect.tap((read) =>
          Effect.sync(() => Option.isNone(read) && albums.delete(name)),
        ),
        Effect.ignore,
        Effect.forkDetach,
      );
    }
  });
};

/** Every shoot that can be read. */
const readable = Effect.gen(function* () {
  const found = yield* Effect.forEach(yield* shootNames, (name) =>
    Effect.option(openShoot(name)),
  );
  return found.flatMap(Option.toArray).map(({ shoot }) => shoot);
});

/** The shoots as the server has them, so it needn't read them every time. */
export const makeShoots = Effect.fn('makeShoots')(function* (
  canStartAgent: boolean,
  workers: Semaphore.Semaphore,
) {
  const galleries = new Map<string, Gallery>();
  const views = new Map<string, View>();
  const changes = new Map<string, { readonly at: number; changed: Changed }>();
  const warmOnce = makeWarming();
  const refreshAlbum = makeRefreshing();
  const forCovers = yield* Semaphore.make(coversAtOnce);

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

  const changed = Effect.fn('changed')(function* (name: string) {
    const now = yield* Clock.currentTimeMillis;
    const known = changes.get(name);
    if (known !== undefined && now - known.at < currentFor) {
      return known.changed;
    }
    const open = yield* openShoot(name);
    yield* refreshAlbum(open);
    const current = yield* changedSince(open, canStartAgent);
    changes.set(name, { at: now, changed: current });
    return current;
  });

  const list = Effect.gen(function* () {
    const names = yield* shootNames;
    const found = yield* Effect.forEach(
      names.toSorted(),
      (name) =>
        Effect.gen(function* () {
          const gallery = yield* galleryOf(name);
          const inShort = yield* shootInShort({
            ...gallery,
            workers: forCovers,
          });
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
        // Those without photos are the newest.
        .toSorted((left, right) =>
          (right.from ?? newest).localeCompare(left.from ?? newest),
        ),
    };
  });

  const viewOf = makeView(canStartAgent, views, warmOnce);
  const view = (name: string) => Effect.flatMap(galleryOf(name), viewOf);

  return {
    galleryOf,
    changed,
    list,
    view,
    all: readable,
    /** Forgets a shoot that isn't there any more, and its smaller pictures. */
    forget: Effect.fn('forget')(function* (name: string) {
      const gallery = galleries.get(name);
      galleries.delete(name);
      views.delete(name);
      changes.delete(name);
      yield* forgetPictures(name, gallery);
    }),
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
