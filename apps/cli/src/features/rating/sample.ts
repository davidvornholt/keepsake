import { createHash } from 'node:crypto';
import type { Moment, Verdict } from '../../shared/domain.ts';

/** Moments with this many photos tell how well a model finds the best one. */
const burst = 3;
/** Of more photos than this nobody can say which one is best. */
const comparable = 12;
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

const shuffled = (moment: Moment) =>
  createHash('sha256').update(moment.id).digest('hex');

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
  const queues = [...groups.values()].map((group) =>
    group.toSorted((left, right) =>
      shuffled(left).localeCompare(shuffled(right)),
    ),
  );
  const chosen: Array<Moment> = [];
  while (chosen.length < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined && chosen.length < count) {
        chosen.push(next);
      }
    }
  }
  return chosen.toSorted((left, right) =>
    shuffled(left).localeCompare(shuffled(right)),
  );
};
