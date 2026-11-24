import { createHash } from 'node:crypto';
import type { Moment, Verdict } from '../../shared/domain.ts';

/** Moments with this many photos tell how well a model finds the best one. */
const burst = 3;
/** Of more photos than this nobody can say which one is best. */
export const comparable = 12;
const lowScore = 4;
const middleScore = 6;

const bandOf = (score: number | undefined) => {
  if (score === undefined) {
    return 'unknown';
  }
  if (score <= lowScore) {
    return 'low';
  }
  return score <= middleScore ? 'middle' : 'high';
};

const shuffleKey = (moment: Moment) =>
  createHash('sha256').update(moment.id).digest('hex');

/** In an order that gives nothing away, the same every time. */
export const shuffled = (
  moments: ReadonlyArray<Moment>,
): ReadonlyArray<Moment> =>
  moments.toSorted((left, right) =>
    shuffleKey(left).localeCompare(shuffleKey(right)),
  );

/** The first of each queue, then the second of each, and so on; each once. */
export const inTurns = <A>(
  queues: ReadonlyArray<ReadonlyArray<A>>,
  count: number,
): ReadonlyArray<A> => {
  const longest = Math.max(0, ...queues.map(({ length }) => length));
  const all = Array.from({ length: longest }, (_, index) =>
    queues.flatMap((queue) => queue.slice(index, index + 1)),
  ).flat();
  return [...new Set(all)].slice(0, count);
};

/**
 * Chooses moments that tell the most about a model: bursts and single photos,
 * some it liked and some it didn't, in an order that gives nothing away. The
 * same moments always give the same sample.
 */
export const sampleOf = (
  moments: ReadonlyArray<Moment>,
  verdicts: ReadonlyArray<Verdict>,
  count: number,
): ReadonlyArray<Moment> => {
  const scores = new Map(
    verdicts.map(({ moment, score }) => [moment, score] as const),
  );
  const groups = new Map<string, Array<Moment>>();
  for (const moment of moments.filter(
    ({ photos }) => photos.length <= comparable,
  )) {
    const kind = moment.photos.length >= burst ? 'burst' : 'single';
    const key = `${kind} ${bandOf(scores.get(moment.id))}`;
    groups.set(key, [...(groups.get(key) ?? []), moment]);
  }
  return shuffled(inTurns([...groups.values()].map(shuffled), count));
};
