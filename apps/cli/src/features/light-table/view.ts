import { Effect, Option } from 'effect';
import { readActivity } from '../../shared/activity.ts';
import type { Photo, Verdict } from '../../shared/domain.ts';
import { judgeOf } from '../../shared/judge.ts';
import { takenThere } from '../../shared/local-time.ts';
import { readRatings, readToRate } from '../../shared/ratings.ts';
import {
  dollarsForOneEdit,
  SpendingRecord,
  totalDollars,
} from '../../shared/spending.ts';
import { frontOf, type Standings, standings } from '../../shared/standing.ts';
import { exists, type OpenShoot, readJson } from '../../shared/store.ts';
import { agentOf } from './agent.ts';
import { choicesOf } from './choices.ts';
import type {
  Changed,
  PhotoView,
  Picture,
  ShootList,
  ShootView,
  Stack,
} from './contract.ts';
import { editOf } from './edits.ts';
import { orderOf } from './hand-over.ts';
import { readLabels } from './labels.ts';
import { isNews, isOpen, readMarks } from './marks.ts';
import { type Gallery, type Kind, pictureOf } from './pictures.ts';
import { readPreparation } from './preparation.ts';
import { revisionOf } from './revision.ts';
import { spread } from './spread.ts';

const cents = 100;
const inCents = (dollars: number) => Math.round(dollars * cents) / cents;

const modelOf = (open: OpenShoot) => judgeOf(open, Option.none());

/** What the judging model says about a photo of a moment. */
const verdictOn = (
  verdict: Verdict | undefined,
  photo: string,
): PhotoView['verdict'] => {
  if (verdict === undefined) {
    return null;
  }
  const { score, subject, description, reason, best, further } = verdict;
  if (best[0] === photo) {
    return { score, subject, description, reason };
  }
  const own = further.find((one) => one.photo === photo);
  return own === undefined
    ? null
    : {
        score: own.score,
        subject,
        description: own.description,
        reason: null,
      };
};

const byTime = (left: Photo, right: Photo) =>
  left.takenAt.localeCompare(right.takenAt) || left.id.localeCompare(right.id);

const ratingOf = Effect.fn('ratingOf')(function* (open: OpenShoot) {
  const questions = yield* readToRate(open);
  if (Option.isNone(questions)) {
    return null;
  }
  const ratings = yield* readRatings(open);
  return {
    questions: questions.value.map(({ id, photos }) => ({
      moment: id,
      photos,
    })),
    ratings: ratings.map(({ moment, best, stars, further }) => ({
      moment,
      best,
      stars,
      further,
    })),
  };
});

/**
 * The camera's own picture in full size: the file an edit was made from, or
 * the photo itself, which is developed when the page asks for it.
 */
const fullOf = Effect.fn('fullOf')(function* (
  gallery: Gallery,
  { id, width, height }: Photo,
  picture: Picture,
) {
  const isKept = yield* exists(gallery.open.files.edit(id).camera);
  if (isKept) {
    return yield* pictureOf(gallery, id, 'camera');
  }
  return width === 0 ? picture : { ...picture, width, height };
});

const manyAtOnce = 32;

const photoViews = Effect.fn('photoViews')(function* (
  gallery: Gallery,
  known: Standings,
) {
  const { open } = gallery;
  const labels = yield* readLabels(open);
  const momentOf = new Map(
    open.moments.flatMap(({ id, photos }) =>
      photos.map((photo) => [photo, id] as const),
    ),
  );
  return yield* Effect.forEach(
    [...open.photos.values()].toSorted(byTime),
    (photo) =>
      Effect.gen(function* () {
        const { id } = photo;
        const moment = momentOf.get(id) ?? id;
        const picture = yield* pictureOf(gallery, id, 'preview');
        return {
          id,
          takenAt: takenThere(open.shoot, photo),
          stack: frontOf(known, id),
          camera: photo.camera,
          lens: photo.lens,
          focalLength: photo.focalLength,
          aperture: photo.aperture,
          exposure: photo.exposure,
          iso: photo.iso,
          picture,
          full: yield* fullOf(gallery, photo, picture),
          standing: known.of.get(id) ?? { kind: 'open' },
          verdict: verdictOn(known.verdicts.get(moment), id),
          edit: yield* editOf(gallery, id),
          labels: labels[id] ?? [],
        } satisfies PhotoView;
      }),
    { concurrency: manyAtOnce },
  );
});

/** The photos that show the same, in the order of those in front. */
const stacksOf = (photos: ReadonlyArray<PhotoView>): ReadonlyArray<Stack> => {
  const behind = Map.groupBy(photos, ({ stack }) => stack);
  return photos.flatMap(({ id }) => {
    const all = behind.get(id);
    return all === undefined
      ? []
      : [{ front: id, photos: all.map((photo) => photo.id) }];
  });
};

/** Everything the page shows of a shoot. */
export const shootView = Effect.fn('shootView')(function* (
  gallery: Gallery,
  canStartAgent: boolean,
) {
  const { open } = gallery;
  const { files, shoot } = open;
  const model = yield* modelOf(open);
  const revision = yield* revisionOf(open, model);
  const known = yield* standings(open, model);
  const { album, picks } = known;
  const spending = yield* readJson(SpendingRecord, files.spending);
  const spent = Option.match(spending, {
    onNone: () => 0,
    onSome: totalDollars,
  });
  const photos = yield* photoViews(gallery, known);
  const order = yield* orderOf(files, known);
  return {
    name: shoot.name,
    title: shoot.title,
    about: shoot.about,
    revision,
    album:
      album === null
        ? null
        : {
            name: album.name,
            url: `${album.server}/albums/${album.id}`,
            readAt: album.readAt,
          },
    picked:
      picks === null
        ? null
        : { minimumScore: picks.minimumScore, maximum: picks.maximum },
    dollars: { spent: inCents(spent), perEdit: dollarsForOneEdit },
    photos,
    stacks: stacksOf(photos),
    marks: yield* readMarks(files),
    choices: yield* choicesOf(open, known),
    activity: yield* readActivity(files),
    preparation: yield* readPreparation(files),
    agent: yield* agentOf(files, canStartAgent),
    ordered:
      order === null
        ? null
        : { at: order.at, dollars: order.dollars, photos: order.photos },
    rating: yield* ratingOf(open),
  } satisfies ShootView;
});

/** What may have changed since the page was given a shoot. */
export const changedSince = Effect.fn('changedSince')(function* (
  open: OpenShoot,
  canStartAgent: boolean,
) {
  const { files } = open;
  return {
    revision: yield* revisionOf(open, yield* modelOf(open)),
    activity: yield* readActivity(files),
    preparation: yield* readPreparation(files),
    agent: yield* agentOf(files, canStartAgent),
  } satisfies Changed;
});

const coverCount = 60;

/** The photos that show best what a shoot is like, the first few most of all. */
const coversOf = (
  open: OpenShoot,
  { album, verdicts }: Standings,
): ReadonlyArray<readonly [string, Kind]> => {
  if (album !== null && album.photos.length > 0) {
    const { photos } = album;
    const favorites = photos.filter(({ favorite }) => favorite);
    const others = photos.filter(({ favorite }) => !favorite);
    return [...spread(favorites, coverCount), ...spread(others, coverCount)]
      .slice(0, coverCount)
      .map(({ photo }) => [photo, 'final'] as const);
  }
  const best = [...verdicts.values()]
    .toSorted((left, right) => right.score - left.score)
    .flatMap((verdict) => verdict.best.slice(0, 1));
  const shown =
    best.length > 0 ? best : spread([...open.photos.keys()], coverCount);
  return shown.slice(0, coverCount).map((photo) => [photo, 'preview'] as const);
};

/** A shoot in short. */
export const shootInShort = Effect.fn('shootInShort')(function* (
  gallery: Gallery,
) {
  const { open } = gallery;
  const { files, shoot } = open;
  const known = yield* standings(open, yield* modelOf(open));
  const marks = yield* readMarks(files);
  const times = [...open.photos.values()]
    .toSorted(byTime)
    .map((photo) => takenThere(shoot, photo));
  return {
    name: shoot.name,
    title: shoot.title,
    about: shoot.about,
    from: times[0] ?? null,
    to: times.at(-1) ?? null,
    photos: open.photos.size,
    inAlbum: known.album?.photos.length ?? 0,
    picked: [...known.of.values()].filter(({ kind }) => kind === 'picked')
      .length,
    preparation: yield* readPreparation(files),
    activity: yield* readActivity(files),
    isOrdered: (yield* orderOf(files, known)) !== null,
    openMarks: marks.filter(isOpen).length,
    newAnswers: marks.filter(isNews).length,
    covers: yield* Effect.forEach(
      coversOf(open, known),
      ([photo, kind]) => pictureOf(gallery, photo, kind).pipe(Effect.option),
      { concurrency: 'unbounded' },
    ).pipe(Effect.map((covers) => covers.flatMap(Option.toArray))),
  } satisfies ShootList['shoots'][number];
});
