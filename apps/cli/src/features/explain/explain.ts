import { Effect, Schema } from 'effect';
import { type Photo, Reason } from '../../shared/domain.ts';
import { StepMissing } from '../../shared/errors/errors.ts';
import { rendered } from '../../shared/pictures.ts';
import { inSteps } from '../../shared/progress.ts';
import { type Standings, standings } from '../../shared/standing.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';
import { type Piece, Vision } from '../../shared/vision.ts';

/** How many photos one question asks about. */
const mostAsked = 6;
/** How many photos of the album are shown along. */
const mostShown = 10;
/** How far away in time those may be, in ms. */
const nearby = 7_200_000;
const pictureSide = 768;
const concurrency = 6;

const role =
  'You explain to somebody who looks through the photos they took why one of them isn’t in the album of the trip. They want to know what speaks against this photo, so that they can decide whether they agree.';

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
  } All of them were good enough for it, but it has no room for repeats, nor for more than the best. Say of each photo that isn’t in the album why.

It repeats a photo of the album when somebody who has just seen that one would find nothing new in it: the same subject at the same place doing the same thing, even when it is closer, further away, turned, or in slightly different light. Give the number of that photo, and say what the photo of the album does better. Otherwise give none, and say what makes it weaker than others: what it shows, what happens in it, what distracts, how it is framed or lit. Say only what can be seen, and when there is nothing to say against it, say so.

Write one plain sentence of at most 20 words for each, without numbers of photos. Say “the photo in the album” for the one it repeats.`;

/** A photo that has no reason, or one that isn’t true any more. */
const needsReason = (known: Standings, again: boolean) => (id: string) => {
  const standing = known.of.get(id);
  if (standing?.kind !== 'left-out' || standing.rule === 'score') {
    return false;
  }
  const { because, repeats } = standing;
  const other = repeats === null ? undefined : known.of.get(repeats);
  return (
    again ||
    because === null ||
    (other !== undefined && other.kind !== 'album' && other.kind !== 'picked')
  );
};

const timeOf = ({ takenAt }: Photo) => Date.parse(`${takenAt}Z`);

type Batch = {
  readonly asked: ReadonlyArray<Photo>;
  /** Photos of the album from around the same time. */
  readonly album: ReadonlyArray<Photo>;
};

/** A few photos at once, each with what the album has from around then. */
const batchesOf = (
  photos: ReadonlyArray<Photo>,
  album: ReadonlyArray<Photo>,
): ReadonlyArray<Batch> => {
  const sorted = photos.toSorted((left, right) => timeOf(left) - timeOf(right));
  return Array.from(
    { length: Math.ceil(sorted.length / mostAsked) },
    (_, index) => {
      const asked = sorted.slice(index * mostAsked, (index + 1) * mostAsked);
      const away = (photo: Photo) =>
        Math.min(...asked.map((one) => Math.abs(timeOf(one) - timeOf(photo))));
      return {
        asked,
        album: album
          .filter((photo) => away(photo) <= nearby)
          .toSorted((left, right) => away(left) - away(right))
          .slice(0, mostShown)
          .toSorted((left, right) => timeOf(left) - timeOf(right)),
      };
    },
  );
};

const explained = Effect.fn('explained')(function* (
  open: OpenShoot,
  { asked, album }: Batch,
) {
  const vision = yield* Vision;
  const shown = [...album, ...asked];
  const pictures = yield* Effect.forEach(shown, ({ id }) =>
    rendered(open.files.preview(id), { longSide: pictureSide }),
  );
  const { reasons } = yield* vision.ask({
    role,
    name: 'reasons',
    schema: Answer,
    pieces: [
      ...pictures.flatMap(
        (picture, index): Array<Piece> => [`Photo ${index + 1}:`, picture],
      ),
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

const Reasons = Schema.Array(Reason);

/** Finds out why good photos of the shoot aren't in the album. */
export const explain = Effect.fn('explain')(function* (
  open: OpenShoot,
  again: boolean,
) {
  const { model } = yield* Vision;
  const { name } = open.shoot;
  const known = yield* standings(open, model);
  if (known.picks === null) {
    return yield* new StepMissing({
      message: `No photos of ${name} are picked yet. Run \`keepsake pick ${name}\` first.`,
    });
  }
  const photos = [...open.photos.values()];
  const album = photos.filter(({ id }) => {
    const kind = known.of.get(id)?.kind;
    return kind === 'album' || kind === 'picked';
  });
  const todo = photos.filter(({ id }) => needsReason(known, again)(id));
  const answers = yield* inSteps(
    'explain',
    batchesOf(todo, album),
    concurrency,
    (batch) =>
      explained(open, batch).pipe(
        Effect.map((reasons) => ({ reasons, failed: null })),
        // One question that fails doesn't lose the answers to the others.
        Effect.catchTag('ModelFailed', ({ message }) =>
          Effect.succeed({ reasons: [], failed: message }),
        ),
      ),
  );
  const found = answers.flatMap(({ reasons }) => reasons);
  const isNew = new Set(found.map(({ photo }) => photo));
  if (found.length > 0) {
    yield* writeJson(Reasons, open.files.reasons, [
      ...known.reasons.filter(({ photo }) => !isNew.has(photo)),
      ...found,
    ]);
  }
  return {
    shoot: name,
    explained: isNew.size,
    repeats: found.filter(({ repeats }) => repeats !== null).length,
    notExplained: todo.map(({ id }) => id).filter((id) => !isNew.has(id)),
    failed: [...new Set(answers.flatMap(({ failed }) => failed ?? []))],
  };
});
