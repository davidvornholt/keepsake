import { Effect, Schema } from 'effect';
import type { Pick } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import { inSteps } from '../../shared/progress.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { type Piece, Vision } from '../../shared/vision.ts';

/** How many photos are compared with each other at once. */
const groupSize = 8;
/** How many different groups each photo is in. */
const rounds = 3;
const pictureSide = 768;
const concurrency = 6;
/** What one point of the score is worth next to the comparisons. */
const scoreWeight = 0.1;

const role =
  'You help someone choose which photos of a private shoot to print. Each photo will be edited by a strong image model first, which can improve light, colour, sky, sharpness and framing, so judge what the photo shows and what it could become.';

const Ranking = Schema.Struct({
  bestFirst: Schema.Array(Schema.Int).annotate({
    description: 'The numbers of all photos, best first',
  }),
});

const question =
  'Which of these would you most like to see on your wall? Rank all of them, best first.';

/**
 * Splits items into groups, differently in every round, so each item meets
 * others each time. The same items always give the same groups.
 */
export const groupsIn = <A>(
  items: ReadonlyArray<A>,
  round: number,
): ReadonlyArray<ReadonlyArray<A>> => {
  const count = Math.max(1, Math.ceil(items.length / groupSize));
  const groups: Array<Array<A>> = Array.from({ length: count }, () => []);
  for (const [index, item] of items.entries()) {
    // In round 0 neighbours are in different groups. Each later round moves
    // every row of items on by one group more than the row before it.
    const row = Math.floor(index / count);
    groups[(index + row * round) % count]?.push(item);
  }
  return groups.filter((group) => group.length > 0);
};

/** Points from 0 for the last to 1 for the first of a ranking. */
export const pointsOf = (
  bestFirst: ReadonlyArray<number>,
  count: number,
): ReadonlyArray<number> => {
  const order = [...new Set(bestFirst)].filter(
    (number) => number >= 1 && number <= count,
  );
  return Array.from({ length: count }, (_, index) => {
    const place = order.indexOf(index + 1);
    // One the model left out counts as the last.
    const position = place === -1 ? count - 1 : place;
    return count === 1 ? 1 : 1 - position / (count - 1);
  });
};

const compare = Effect.fn('compare')(function* (
  open: OpenShoot,
  group: ReadonlyArray<Pick>,
) {
  const vision = yield* Vision;
  const pictures = yield* Effect.forEach(group, ({ photo }) =>
    rendered(open.files.preview(photo), { longSide: pictureSide }),
  );
  const { bestFirst } = yield* vision.ask({
    role,
    name: 'ranking',
    schema: Ranking,
    pieces: [
      ...pictures.flatMap(
        (picture, index): Array<Piece> => [`Photo ${index + 1}:`, picture],
      ),
      question,
    ],
  });
  const points = pointsOf(bestFirst, group.length);
  return group.map(({ photo }, index) => ({
    photo,
    points: points[index] ?? 0,
  }));
});

/** The best of the photos, at most so many, in the order they were taken. */
export const bestOf = Effect.fn('bestOf')(function* (
  open: OpenShoot,
  picks: ReadonlyArray<Pick>,
  maximum: number,
) {
  if (picks.length <= maximum) {
    return picks;
  }
  const groups = Array.from({ length: rounds }, (_, round) =>
    groupsIn(picks, round),
  ).flat();
  const compared = yield* inSteps('rank', groups, concurrency, (group) =>
    compare(open, group),
  );
  const value = new Map(
    picks.map(({ photo, score }) => [photo, score * scoreWeight] as const),
  );
  for (const { photo, points } of compared.flat()) {
    value.set(photo, (value.get(photo) ?? 0) + points / rounds);
  }
  const best = new Set(
    picks
      .map(({ photo }) => photo)
      .toSorted(
        (left, right) => (value.get(right) ?? 0) - (value.get(left) ?? 0),
      )
      .slice(0, maximum),
  );
  return picks.filter(({ photo }) => best.has(photo));
});
