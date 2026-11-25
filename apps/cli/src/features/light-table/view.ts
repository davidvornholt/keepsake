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
import { type Standings, standings } from '../../shared/standing.ts';
import { exists, type OpenShoot, readJson } from '../../shared/store.ts';
import type {
  Changed,
  PhotoView,
  Picture,
  ShootList,
  ShootView,
} from './contract.ts';
import { editOf } from './edits.ts';
import { readLabels } from './labels.ts';
import { isNews, isOpen, isOpinion, readMarks } from './marks.ts';
import { type Gallery, type Kind, pictureOf } from './pictures.ts';
import { revisionOf } from './revision.ts';
import { spread } from './spread.ts';
import { agentWaitsSince } from './waiting.ts';

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
          moment,
          camera: photo.camera,
          lens: photo.lens,
          focalLength: photo.focalLength,
          aperture: photo.aperture,
          exposure: photo.exposure,
          iso: photo.iso,
          picture,
          full: yield* fullOf(gallery, photo, picture),
          standing: known.of.get(id) ?? {
            kind: 'left-out',
            rule: 'unknown',
            repeats: null,
            because: null,
          },
          verdict: verdictOn(known.verdicts.get(moment), id),
          edit: yield* editOf(gallery, id),
          labels: labels[id] ?? [],
        } satisfies PhotoView;
      }),
    { concurrency: manyAtOnce },
  );
});

/** Everything the page shows of a shoot. */
export const shootView = Effect.fn('shootView')(function* (gallery: Gallery) {
  const { open } = gallery;
  const { files, shoot, moments } = open;
  const model = yield* modelOf(open);
  const revision = yield* revisionOf(open, model);
  const known = yield* standings(open, model);
  const { album, picks } = known;
  const spending = yield* readJson(SpendingRecord, files.spending);
  const spent = Option.match(spending, {
    onNone: () => 0,
    onSome: totalDollars,
  });
  return {
    name: shoot.name,
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
    photos: yield* photoViews(gallery, known),
    moments,
    marks: yield* readMarks(files),
    activity: yield* readActivity(files),
    agentWaitsSince: yield* agentWaitsSince(files),
    rating: yield* ratingOf(open),
  } satisfies ShootView;
});

/** What may have changed since the page was given a shoot. */
export const changedSince = Effect.fn('changedSince')(function* (
  open: OpenShoot,
) {
  const { files } = open;
  return {
    revision: yield* revisionOf(open, yield* modelOf(open)),
    activity: yield* readActivity(files),
    agentWaitsSince: yield* agentWaitsSince(files),
  } satisfies Changed;
});

const coverCount = 60;

/** The photos that show best what a shoot is like, the first few most of all. */
const coversOf = (known: Standings): ReadonlyArray<readonly [string, Kind]> => {
  const { album, verdicts } = known;
  if (album !== null && album.photos.length > 0) {
    const { photos } = album;
    const favorites = photos.filter(({ favorite }) => favorite);
    const others = photos.filter(({ favorite }) => !favorite);
    return [...spread(favorites, coverCount), ...spread(others, coverCount)]
      .slice(0, coverCount)
      .map(({ photo }) => [photo, 'final'] as const);
  }
  return [...verdicts.values()]
    .toSorted((left, right) => right.score - left.score)
    .flatMap(({ best }) => best.slice(0, 1))
    .slice(0, coverCount)
    .map((photo) => [photo, 'preview'] as const);
};

/** A shoot in short. */
export const shootInShort = Effect.fn('shootInShort')(function* (
  gallery: Gallery,
) {
  const { open } = gallery;
  const known = yield* standings(open, yield* modelOf(open));
  const marks = yield* readMarks(open.files);
  const times = [...open.photos.values()]
    .toSorted(byTime)
    .map((photo) => takenThere(open.shoot, photo));
  return {
    name: open.shoot.name,
    about: open.shoot.about,
    from: times[0] ?? '',
    to: times.at(-1) ?? '',
    photos: open.photos.size,
    inAlbum: known.album?.photos.length ?? 0,
    openMarks: marks.filter((mark) => isOpen(mark) && !isOpinion(mark.kind))
      .length,
    newAnswers: marks.filter(isNews).length,
    covers: yield* Effect.forEach(coversOf(known), ([photo, kind]) =>
      pictureOf(gallery, photo, kind).pipe(Effect.option),
    ).pipe(Effect.map((covers) => covers.flatMap(Option.toArray))),
  } satisfies ShootList['shoots'][number];
});
