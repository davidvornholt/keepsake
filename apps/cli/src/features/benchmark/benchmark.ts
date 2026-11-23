import type { Rating, Verdict } from '../../shared/domain.ts';

/** From this many stars on, the owner would keep a photo. */
const keptFrom = 3;
const half = 0.5;

const average = (values: ReadonlyArray<number>): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const decimals = 1000;
const rounded = (value: number | null) =>
  value === null ? null : Math.round(value * decimals) / decimals;

/**
 * How often a photo that was kept has a higher score than one that wasn't:
 * 1 is perfect and 0.5 no better than chance.
 */
export const keepAccuracy = (
  pairs: ReadonlyArray<{ readonly score: number; readonly stars: number }>,
): number | null => {
  const kept = pairs.filter(({ stars }) => stars >= keptFrom);
  const dropped = pairs.filter(({ stars }) => stars < keptFrom);
  return average(
    kept.flatMap((good) =>
      dropped.map((bad) => {
        if (good.score === bad.score) {
          return half;
        }
        return good.score > bad.score ? 1 : 0;
      }),
    ),
  );
};

/** Each value's place in the order; equal values share the average place. */
const ranksOf = (values: ReadonlyArray<number>): ReadonlyArray<number> =>
  values.map((value) => {
    const smaller = values.filter((other) => other < value).length;
    const equal = values.filter((other) => other === value).length;
    return smaller + (equal + 1) / 2;
  });

/** Spearman's rank correlation, from -1 to 1. */
export const rankCorrelation = (
  pairs: ReadonlyArray<{ readonly score: number; readonly stars: number }>,
): number | null => {
  const scores = ranksOf(pairs.map(({ score }) => score));
  const stars = ranksOf(pairs.map(({ stars: value }) => value));
  const meanScore = average(scores) ?? 0;
  const meanStars = average(stars) ?? 0;
  const covariance = scores.reduce(
    (sum, score, index) =>
      sum + (score - meanScore) * ((stars[index] ?? 0) - meanStars),
    0,
  );
  const spread = (values: ReadonlyArray<number>, mean: number) =>
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const scale = Math.sqrt(spread(scores, meanScore) * spread(stars, meanStars));
  return scale === 0 ? null : covariance / scale;
};

/** Compares a model's verdicts with what the owner chose. */
export const compareWithOwner = (
  verdicts: ReadonlyArray<Verdict>,
  ratings: ReadonlyArray<Rating>,
) => {
  const byMoment = new Map(
    verdicts.map((verdict) => [verdict.moment, verdict] as const),
  );
  const both = ratings.flatMap((rating) => {
    const verdict = byMoment.get(rating.moment);
    return verdict === undefined ? [] : [{ rating, verdict }];
  });
  const bursts = both.filter(
    ({ rating }) => rating.photos.length > 1 && rating.best.length > 0,
  );
  const share = (
    matches: (pair: (typeof bursts)[number]) => boolean,
  ): number | null => average(bursts.map((pair) => (matches(pair) ? 1 : 0)));
  const pairs = both.map(({ rating, verdict }) => ({
    score: verdict.score,
    stars: rating.stars,
  }));
  return {
    moments: both.length,
    bursts: bursts.length,
    /** How often its best frame is the owner's best frame. */
    sameBestFrame: rounded(
      share(({ rating, verdict }) => verdict.best[0] === rating.best[0]),
    ),
    /** How often its best frame is one the owner kept. */
    bestFrameKept: rounded(
      share(({ rating, verdict }) =>
        rating.best.includes(verdict.best[0] ?? ''),
      ),
    ),
    /** How often a frame taken at random is one the owner kept. */
    bestFrameByChance: rounded(
      average(
        bursts.map(({ rating }) => rating.best.length / rating.photos.length),
      ),
    ),
    keepAccuracy: rounded(keepAccuracy(pairs)),
    rankCorrelation: rounded(rankCorrelation(pairs)),
  };
};
