import type { Moment, Verdict } from '../../shared/domain.ts';
import { comparable, inTurns, shuffled } from './sample.ts';

/** Which frame is best matters only where a model likes one. */
const likedFrom = 5;
/** How far apart a moment's places in two orders are to be worth a question. */
const farApart = 0.25;

/** Each moment's place among all, from 0 for the lowest score to 1. */
const placesOf = (verdicts: ReadonlyArray<Verdict>) => {
  const scores = verdicts.map(({ score }) => score);
  const placeOf = (score: number) => {
    const lower = scores.filter((other) => other < score).length;
    const equal = scores.filter((other) => other === score).length;
    return (lower + equal / 2) / scores.length;
  };
  return new Map(
    verdicts.map(({ moment, score }) => [moment, placeOf(score)] as const),
  );
};

const byMoment = (verdicts: ReadonlyArray<Verdict>) =>
  new Map(verdicts.map((verdict) => [verdict.moment, verdict] as const));

/**
 * Chooses moments two models judged differently, to tell which of them judges
 * more like the owner: those with another best frame, the ones they like most
 * first, in turns with those one model likes far better than the other does.
 * Models use the scale differently, so scores are compared by their order.
 */
export const disputedBetween = (
  moments: ReadonlyArray<Moment>,
  [left, right]: readonly [ReadonlyArray<Verdict>, ReadonlyArray<Verdict>],
  count: number,
): ReadonlyArray<Moment> => {
  const [leftVerdicts, rightVerdicts] = [byMoment(left), byMoment(right)];
  const [leftPlaces, rightPlaces] = [placesOf(left), placesOf(right)];
  const judged = moments.flatMap((moment) => {
    const verdicts = [
      leftVerdicts.get(moment.id),
      rightVerdicts.get(moment.id),
    ].filter((verdict) => verdict !== undefined);
    const [one, other] = verdicts;
    if (
      one === undefined ||
      other === undefined ||
      moment.photos.length > comparable
    ) {
      return [];
    }
    return [
      {
        moment,
        sameFrame: one.best[0] === other.best[0],
        liked: Math.max(one.score, other.score),
        distance: Math.abs(
          (leftPlaces.get(moment.id) ?? 0) - (rightPlaces.get(moment.id) ?? 0),
        ),
      },
    ];
  });
  const frames = judged
    .filter(({ sameFrame, liked }) => !sameFrame && liked >= likedFrom)
    .toSorted((a, b) => b.liked - a.liked);
  const scores = judged
    .filter(({ distance }) => distance >= farApart)
    .toSorted((a, b) => b.distance - a.distance);
  return shuffled(
    inTurns(
      [frames, scores].map((queue) => queue.map(({ moment }) => moment)),
      count,
    ),
  );
};
