import { Effect, Option } from 'effect';
import { type Moment, type Pick, Verdict } from './domain.ts';
import { type OpenShoot, readJson } from './store.ts';

/** Whether two lists have the same photos in the same order. */
export const sameAs = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/**
 * One verdict on a moment that was judged in parts, from the verdicts on the
 * parts. The best part leads, and the best photos of the others stand next to
 * it, so they stay what they were before the parts were put together.
 */
export const joined = (
  moment: Moment,
  parts: ReadonlyArray<Verdict>,
): Verdict | null => {
  const covered = parts.flatMap(({ photos }) => photos);
  const isWhole =
    covered.length === moment.photos.length &&
    new Set(covered).size === covered.length &&
    covered.every((photo) => moment.photos.includes(photo));
  const start = ({ photos }: Verdict) => moment.photos.indexOf(photos[0] ?? '');
  const [lead, ...rest] = parts.toSorted(
    (left, right) => right.score - left.score || start(left) - start(right),
  );
  if (!isWhole || lead === undefined) {
    return null;
  }
  return {
    ...lead,
    moment: moment.id,
    photos: moment.photos,
    best: [...lead.best, ...rest.flatMap(({ best }) => best)],
    further: [
      ...lead.further,
      ...rest.flatMap(({ best, score, description, further }) => [
        ...best.slice(0, 1).map((photo) => ({ photo, score, description })),
        ...further,
      ]),
    ],
  };
};

/**
 * The moment's verdict by this model, unless its photos have changed. When a
 * new scan put moments together, their verdicts are joined, so the moment
 * isn't judged again. `file` is where its own verdict is kept.
 */
export const verdictOn = Effect.fn('verdictOn')(function* (
  open: OpenShoot,
  model: string,
  moment: Moment,
  file = open.files.verdict(model, moment.id),
) {
  const own = Option.filter(yield* readJson(Verdict, file), ({ photos }) =>
    sameAs(photos, moment.photos),
  );
  if (Option.isSome(own) || moment.photos.length < 2) {
    return own;
  }
  // Each verdict is named after the first photo of what it judged.
  const found = yield* Effect.forEach(moment.photos, (photo) =>
    readJson(Verdict, open.files.verdict(model, photo)),
  );
  const parts = found
    .flatMap(Option.toArray)
    .filter(({ photos }) => photos.every((one) => moment.photos.includes(one)));
  return Option.fromNullishOr(joined(moment, parts));
});

/** Every verdict by this model, in the order the photos were taken. */
export const verdicts = Effect.fn('verdicts')(function* (
  open: OpenShoot,
  model: string,
) {
  const found = yield* Effect.forEach(open.moments, (moment) =>
    verdictOn(open, model, moment),
  );
  return found.flatMap(Option.toArray);
});

/** A photo of a judged moment as a pick, with its own score where it has one. */
export const pickOf = (verdict: Verdict, photo: string): Pick => {
  const { moment, subject, further } = verdict;
  const { score, description } =
    further.find((one) => one.photo === photo) ?? verdict;
  return { photo, moment, score, subject, description };
};
