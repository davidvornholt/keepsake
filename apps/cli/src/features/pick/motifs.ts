import { Effect, Schema } from 'effect';
import type { LeftOut, Pick } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import { inSteps } from '../../shared/progress.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { type Piece, Vision } from '../../shared/vision.ts';

/** How many photos are told apart at once. */
const mostPhotos = 24;
const pictureSide = 900;
const concurrency = 6;
/** Longer after another photo of a motif, in ms, something new has happened. */
const nearby = 600_000;

const role =
  'You put together the album of a private trip or day out from photos that are all good. Whoever leafs through it wants to see something new on every page: a photo that shows what another one shows already makes the album worse, even when both are beautiful.';

const Motifs = Schema.Struct({
  motifs: Schema.Array(
    Schema.Struct({
      motif: Schema.String.annotate({ description: 'What they show' }),
      photos: Schema.Array(Schema.Int),
    }),
  ),
});

const groupingQuestion =
  'Put together the photos that may show the same motif, so that they can be compared: the same building, view or place, even from another spot, at another time or in other light; the same people at the same place; the same animal, or animals of the same kind; the same plants, food or thing. They needn’t follow each other. Each photo belongs to one motif. Leave out the photos whose motif no other photo shows.';

const Answer = Schema.Struct({
  keep: Schema.Array(Schema.Int),
  repeats: Schema.Array(
    Schema.Struct({
      photo: Schema.Int,
      /** The number of the photo that is kept instead. */
      insteadOf: Schema.Int,
    }),
  ),
});

const keepingQuestion = (motif: string) =>
  `These photos of the album show ${motif}. Which of them are repeats, so that somebody who has just seen another one of them would find nothing new in them? A photo is a repeat when it shows the same subject at the same place doing the same thing, even when it is closer, further away, turned, upright instead of wide, or in slightly different light. It isn’t a repeat when something else happens in it, when other people or animals are in it, or when it shows another side or part of the place. Of each set of repeats the album keeps the most interesting one: the one in which most happens, the subject is seen best, close enough and with its face and eyes towards the camera, the light and the colours are strongest, and nothing distracts. Give the numbers of all photos that the album keeps, and for each of the others its number and that of the kept photo it repeats.`;

type Motif = {
  readonly motif: string;
  readonly picks: ReadonlyArray<Pick>;
};

/** The photos that share a motif, as their descriptions tell. */
const motifsOf = Effect.fn('motifsOf')(function* (picks: ReadonlyArray<Pick>) {
  const vision = yield* Vision;
  const { motifs } = yield* vision.ask({
    role,
    name: 'motifs',
    schema: Motifs,
    pieces: [
      picks
        .map(({ description }, index) => `${index + 1}. ${description}`)
        .join('\n'),
      groupingQuestion,
    ],
  });
  const grouped = new Set<number>();
  return motifs
    .map(({ motif, photos }): Motif => {
      const own = [...new Set(photos)].filter((photo) => !grouped.has(photo));
      for (const photo of own) {
        grouped.add(photo);
      }
      return {
        motif,
        picks: own
          .toSorted((left, right) => left - right)
          .flatMap((photo) => picks[photo - 1] ?? []),
      };
    })
    .filter((motif) => motif.picks.length > 1);
});

/** The photos of a motif from around the same time, a few at once. */
const comparable =
  (open: OpenShoot) =>
  ({ motif, picks }: Motif): ReadonlyArray<Motif> => {
    const groups: Array<Array<Pick>> = [];
    let last = Number.NEGATIVE_INFINITY;
    for (const pick of picks) {
      const time = Date.parse(`${open.photos.get(pick.photo)?.takenAt}Z`);
      const group = groups.at(-1);
      if (
        group === undefined ||
        time - last > nearby ||
        group.length === mostPhotos
      ) {
        groups.push([pick]);
      } else {
        group.push(pick);
      }
      last = time;
    }
    return groups
      .filter((group) => group.length > 1)
      .map((group) => ({ motif, picks: group }));
  };

/** The photos of a motif that the album can do without. */
const dispensable = Effect.fn('dispensable')(function* (
  open: OpenShoot,
  { motif, picks }: Motif,
) {
  const vision = yield* Vision;
  const pictures = yield* Effect.forEach(picks, ({ photo }) =>
    rendered(open.files.preview(photo), { longSide: pictureSide }),
  );
  const { keep, repeats } = yield* vision.ask({
    role,
    name: 'motif',
    schema: Answer,
    pieces: [
      ...pictures.flatMap(
        (picture, index): Array<Piece> => [`Photo ${index + 1}:`, picture],
      ),
      keepingQuestion(motif),
    ],
  });
  const kept = picks.filter((_, index) => keep.includes(index + 1));
  const [first] = kept;
  if (first === undefined) {
    return [];
  }
  return picks.flatMap((pick, index): ReadonlyArray<LeftOut> => {
    const named = repeats.find(({ photo }) => photo === index + 1);
    const instead = picks[(named?.insteadOf ?? 0) - 1];
    return kept.includes(pick)
      ? []
      : [
          {
            photo: pick.photo,
            insteadOf: (instead !== undefined && kept.includes(instead)
              ? instead
              : first
            ).photo,
          },
        ];
  });
});

/** Leaves out photos that show again what others of them show better. */
export const withoutSameMotifs = Effect.fn('withoutSameMotifs')(function* (
  open: OpenShoot,
  picks: ReadonlyArray<Pick>,
) {
  const motifs = picks.length < 2 ? [] : yield* motifsOf(picks);
  const out = yield* inSteps(
    'motifs',
    motifs.flatMap(comparable(open)),
    concurrency,
    (motif) => dispensable(open, motif),
  );
  const repeats = out.flat();
  const gone = new Set(repeats.map(({ photo }) => photo));
  return {
    kept: picks.filter(({ photo }) => !gone.has(photo)),
    repeats,
  };
});
