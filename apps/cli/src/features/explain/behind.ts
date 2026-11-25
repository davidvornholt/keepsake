import { Effect, Schema } from 'effect';
import type { Photo, Reason } from '../../shared/domain.ts';
import type { Standings } from '../../shared/standing.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';
import { role, showing } from './showing.ts';

/** How many photos one question asks about. */
const mostAsked = 11;

const Answer = Schema.Struct({
  reasons: Schema.Array(
    Schema.Struct({
      /** The number of one of the others. */
      photo: Schema.Int,
      because: Schema.String,
    }),
  ),
});

const question = (total: number) =>
  `These ${total} photos show the same, and photo 1 was chosen to stand for all of them. Say of each other photo why it wasn’t.

Compare it with photo 1: where eyes and heads are turned, the expression, the pose, how sharp the subject is, what is cut off or in the way, the light, the framing. Say only what can be seen. When nothing speaks against a photo, say that it is about as good.

Write one plain sentence of at most 12 words for each, about that photo and not about photo 1, without numbers of photos.`;

/** A photo, and some that stand behind it. */
export type Behind = {
  readonly front: string;
  readonly asked: ReadonlyArray<string>;
};

/**
 * The photos that stand behind others, if it isn't known why, or isn't true
 * any more.
 */
export const behind = (
  known: Standings,
  photos: ReadonlyArray<Photo>,
  again: boolean,
): ReadonlyArray<Behind> => {
  const asked = photos.flatMap(({ id }) => {
    const standing = known.of.get(id);
    return standing?.kind === 'similar' &&
      !known.fronts.has(id) &&
      (again || standing.because === null)
      ? [{ front: standing.to, photo: id }]
      : [];
  });
  return [...Map.groupBy(asked, ({ front }) => front)].flatMap(([front, all]) =>
    Array.from({ length: Math.ceil(all.length / mostAsked) }, (_, index) => ({
      front,
      asked: all
        .slice(index * mostAsked, (index + 1) * mostAsked)
        .map(({ photo }) => photo),
    })),
  );
};

/** Why photos stand behind another one. */
export const whyBehind = Effect.fn('whyBehind')(function* (
  open: OpenShoot,
  { front, asked }: Behind,
) {
  const vision = yield* Vision;
  const shown = [front, ...asked];
  const { reasons } = yield* vision.ask({
    role,
    name: 'reasons',
    schema: Answer,
    pieces: [...(yield* showing(open, shown)), question(shown.length)],
  });
  return reasons.flatMap(({ photo, because }): Array<Reason> => {
    const about = asked[photo - 2];
    return about === undefined
      ? []
      : [{ photo: about, repeats: front, because, model: vision.model }];
  });
});
