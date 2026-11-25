import { Effect, Schema } from 'effect';
import type { Photo, Reason } from '../../shared/domain.ts';
import type { Standings } from '../../shared/standing.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';
import { role, showing } from './showing.ts';

/** How many photos one question asks about. */
const mostAsked = 6;
/** How many photos of the album are shown along. */
const mostShown = 10;
/** How far away in time those may be, in ms. */
const nearby = 7_200_000;

const Answer = Schema.Struct({
  reasons: Schema.Array(
    Schema.Struct({
      /** The number of the photo that isn’t in the album. */
      photo: Schema.Int,
      repeats: Schema.NullOr(Schema.Int).annotate({
        description:
          'The number of the photo of the album that shows the same, if one does',
      }),
      because: Schema.String,
    }),
  ),
});

const question = (inAlbum: number, total: number) =>
  `${
    inAlbum === 0
      ? `None of these ${total} photos is in the album.`
      : `Photos 1 to ${inAlbum} are in the album. Photos ${inAlbum + 1} to ${total} aren’t.`
  } It has no room for repeats, nor for more than the best. Say of each photo that isn’t in the album why.

It repeats a photo of the album when somebody who has just seen that one would find nothing new in it: the same subject at the same place doing the same thing, even when it is closer, further away, turned, or in slightly different light. Give the number of that photo, and say what the photo of the album does better. Otherwise give none, and say what makes it weaker than others: what it shows, what happens in it, what distracts, how it is framed or lit. Say only what can be seen, and when there is nothing to say against it, say so.

Write one plain sentence of at most 20 words for each, without numbers of photos. Say “the photo in the album” for the one it repeats.`;

const isChosen = (known: Standings, photo: string) => {
  const kind = known.of.get(photo)?.kind;
  return kind === 'album' || kind === 'picked';
};

/**
 * The photos that stand for themselves and aren't in the album, if it isn't
 * known why, or isn't true any more.
 */
export const leftOut = (
  known: Standings,
  photos: ReadonlyArray<Photo>,
  again: boolean,
): ReadonlyArray<Photo> =>
  photos.filter(({ id }) => {
    const standing = known.of.get(id);
    if (standing?.kind === 'left-out') {
      return again || standing.because === null;
    }
    return (
      standing?.kind === 'similar' &&
      known.fronts.has(id) &&
      (again || standing.because === null || !isChosen(known, standing.to))
    );
  });

const timeOf = ({ takenAt }: Photo) => Date.parse(`${takenAt}Z`);

export type LeftOut = {
  readonly asked: ReadonlyArray<Photo>;
  /** Photos of the album from around the same time. */
  readonly album: ReadonlyArray<Photo>;
};

/** A few photos at once, each with what the album has from around then. */
export const batchesOf = (
  known: Standings,
  asked: ReadonlyArray<Photo>,
  photos: ReadonlyArray<Photo>,
): ReadonlyArray<LeftOut> => {
  const album = photos.filter(({ id }) => isChosen(known, id));
  const sorted = asked.toSorted((left, right) => timeOf(left) - timeOf(right));
  return Array.from(
    { length: Math.ceil(sorted.length / mostAsked) },
    (_, index) => {
      const batch = sorted.slice(index * mostAsked, (index + 1) * mostAsked);
      const away = (photo: Photo) =>
        Math.min(...batch.map((one) => Math.abs(timeOf(one) - timeOf(photo))));
      return {
        asked: batch,
        album: album
          .filter((photo) => away(photo) <= nearby)
          .toSorted((left, right) => away(left) - away(right))
          .slice(0, mostShown)
          .toSorted((left, right) => timeOf(left) - timeOf(right)),
      };
    },
  );
};

/** Why photos aren't in the album, next to what it has. */
export const whyLeftOut = Effect.fn('whyLeftOut')(function* (
  open: OpenShoot,
  { asked, album }: LeftOut,
) {
  const vision = yield* Vision;
  const shown = [...album, ...asked].map(({ id }) => id);
  const { reasons } = yield* vision.ask({
    role,
    name: 'reasons',
    schema: Answer,
    pieces: [
      ...(yield* showing(open, shown)),
      question(album.length, shown.length),
    ],
  });
  return reasons.flatMap(({ photo, repeats, because }): Array<Reason> => {
    const about = asked[photo - 1 - album.length];
    const same = repeats === null ? undefined : album[repeats - 1];
    return about === undefined
      ? []
      : [
          {
            photo: about.id,
            repeats: same?.id ?? null,
            because,
            model: vision.model,
          },
        ];
  });
});
