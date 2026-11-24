import type { Pick } from '../../shared/domain.ts';

/**
 * How many points of the score a photo would lose if all of the album showed
 * the same kind of thing.
 */
const sameKind = 2;
/** How many it loses for each one of the same kind from around the same time. */
const sameScene = 0.25;
const sceneLength = 300_000;

const kindOf = ({ subject }: Pick) => (subject === 'bird' ? 'animal' : subject);

type Valued = {
  readonly pick: Pick;
  /** In points of the score. */
  readonly value: number;
  readonly takenAt: string;
};

/**
 * The most valuable photos, at most so many, one after the other. The more of
 * them show the same kind of thing already, above all in the same scene, the
 * less another one is worth.
 */
export const variedBest = (
  photos: ReadonlyArray<Valued>,
  maximum: number,
): ReadonlyArray<Pick> => {
  const left = photos.map(({ pick, value, takenAt }) => ({
    pick,
    value,
    kind: kindOf(pick),
    time: Date.parse(`${takenAt}Z`),
  }));
  const chosen: Array<(typeof left)[number]> = [];
  const worth = ({ value, kind, time }: (typeof left)[number]) => {
    const alike = chosen.filter((one) => one.kind === kind);
    const near = alike.filter(
      (one) => Math.abs(one.time - time) <= sceneLength,
    );
    return (
      value - (sameKind * alike.length) / maximum - sameScene * near.length
    );
  };
  while (chosen.length < maximum && left.length > 0) {
    const worths = left.map(worth);
    const [best] = left.splice(worths.indexOf(Math.max(...worths)), 1);
    if (best !== undefined) {
      chosen.push(best);
    }
  }
  return chosen.map(({ pick }) => pick);
};
